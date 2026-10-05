import type { SupabaseClient } from '@supabase/supabase-js';
import {
  agenteExecutor,
  esErrorCanalFailClosed,
  resolverAgenteDelCanal,
  type SalidaEjecucion
} from '@/lib/agentes';
import {
  detectarAperturas,
  extraerSlotsDeclarados,
  fusionarSesion,
  sanearSesion,
  type SesionEstudiante
} from '@/lib/agentes/vozNaia';
import {
  CONVERSACION_ESTADO_ACTIVA,
  DEMOWAPP_CANAL,
  getOrCreateActiveConversation,
  updateConversationContext
} from './conversacion-service';
import { scheduleSilenceReminderPush, cancelPendingSilencePushes } from './push-service';
import { DEMOWAPP_CAPTURE_ORDER, type DemoWappCaptureKey } from './config';
import { leerSesionHiloDeContexto, type SesionHilo } from './sesion-hilo';

interface NaiaStructuredResponse {
  mensaje: string;
  resumen_actualizado?: string;
  intencion_detectada?: string;
  siguiente_accion_sugerida?: string;
  requiere_escalamiento?: boolean;
  espera_respuesta?: boolean;
  conversationId?: string;
}

const MENSAJE_FALLBACK_PROVEEDOR =
  'Se me enredó la respuesta un momento. Cuéntame **con tus palabras** qué necesitas y lo retomamos.';

/**
 * BA-029: el hilo de WhatsApp solo guarda un texto. La pregunta de seguimiento
 * del formato NaIA va en la misma burbuja. Las opciones tipo "Explorar resultados"
 * son chips del canal web y no se pegan aquí.
 */
/** Log de contingencia. Solo código, nombre y mensaje corto: sin texto del estudiante ni teléfono. */
function logNaiaFallback(detalle: Record<string, unknown>) {
  console.error('[demowapp] naia_fallback', detalle);
}

function mensajeSinPii(texto: string): string {
  return texto.replace(/\+?\d[\d\s-]{6,}\d/g, '[redactado]').slice(0, 240);
}

function textoVisibleEnHilo(salida: SalidaEjecucion): string {
  const mensaje = (salida.mensaje || '').trim();
  const pregunta = (salida.pregunta_seguimiento || '').trim();
  if (salida.json_parseado === false) {
    logNaiaFallback({ motivo: 'json_no_parseable' });
  }
  if (!mensaje) {
    if (salida.json_parseado !== false) logNaiaFallback({ motivo: 'respuesta_vacia' });
    return MENSAJE_FALLBACK_PROVEEDOR;
  }
  if (!pregunta) return mensaje;
  if (mensaje.toLowerCase().includes(pregunta.toLowerCase())) return mensaje;
  return `${mensaje}\n\n${pregunta}`.trim();
}

/**
 * BA-029: Demo WApp usa la misma NaIA del Centro IA, canal whatsapp.
 * El prompt, el tono y el contexto de canal salen de configuraciones_agente_canal
 * y de componentes tipo_contexto=canal filtrados. No llama a Abacus por su cuenta
 * ni hereda el prompt del canal web.
 *
 * Fail-closed: canal inactivo, sin agente o sin config activa se propaga
 * (canal_no_configurado / canal_no_encontrado / agente_canal_no_asignado).
 * Un fallo del proveedor sigue con un mensaje de contingencia para no cortar el hilo.
 */
async function callNaiaFromServer(input: {
  mensaje: string;
  conversationId?: string;
  contexto: Record<string, unknown>;
  sesion: SesionEstudiante;
  sesionHilo?: SesionHilo;
}): Promise<NaiaStructuredResponse & { sesionHilo?: SesionHilo }> {
  // BA-024 sigue en el executor (voz, sesión, contrato JSON de este canal).
  // BA-029 pide codigo_canal=whatsapp: config y contexto de canal salen del Centro IA.
  // El hilo W1 viaja en sesion_hilo; mensaje_usuario es solo el texto del estudiante.
  const codigoAgente = await resolverAgenteDelCanal(DEMOWAPP_CANAL);
  try {
    const salida = await agenteExecutor.ejecutar({
      codigo_agente: codigoAgente,
      codigo_canal: DEMOWAPP_CANAL,
      mensaje_usuario: input.mensaje,
      conversation_id: input.conversationId,
      contexto_persona: input.contexto,
      sesion_previa: input.sesion,
      sesion_hilo: input.sesionHilo
    });
    return {
      mensaje: textoVisibleEnHilo(salida),
      resumen_actualizado: salida.resumen_actualizado,
      intencion_detectada: salida.intencion_detectada,
      siguiente_accion_sugerida: salida.siguiente_accion_sugerida,
      requiere_escalamiento: salida.requiere_escalamiento,
      espera_respuesta: salida.espera_respuesta !== false,
      conversationId: salida.conversationId || input.conversationId,
      sesionHilo: salida.sesion_hilo || input.sesionHilo
    };
  } catch (err) {
    if (esErrorCanalFailClosed(err)) throw err;
    const error = err as { name?: string; code?: string; codigo?: string; message?: string };
    logNaiaFallback({
      motivo: 'excepcion',
      name: typeof error?.name === 'string' ? error.name : 'Error',
      code:
        typeof error?.codigo === 'string'
          ? error.codigo
          : typeof error?.code === 'string'
            ? error.code
            : null,
      message: mensajeSinPii(typeof error?.message === 'string' ? error.message : 'error_desconocido')
    });
    return {
      mensaje: MENSAJE_FALLBACK_PROVEEDOR,
      espera_respuesta: true,
      conversationId: input.conversationId,
      sesionHilo: input.sesionHilo
    };
  }
}


type MensajeRemitente = 'persona' | 'naia';

type CapturedFacts = Partial<Record<DemoWappCaptureKey, string>>;

interface ProgressiveState {
  known: CapturedFacts;
  missing: DemoWappCaptureKey[];
}

function nowIso() {
  return new Date().toISOString();
}

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function normalizeToken(text: string) {
  return normalizeText(text).toLowerCase();
}

/**
 * Los efectos de CRM (analítica, funnel, recordatorios y hechos) nunca deben
 * interrumpir la conversación. El mensaje del estudiante y la respuesta de
 * NaIA son la ruta crítica; el resto queda registrado cuando la base lo admite.
 */
async function bestEffort<T>(label: string, operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    console.error(`[demowapp] ${label}`, error);
    return null;
  }
}

function makeIdempotencyRef(prefix: string, id: string) {
  return `${prefix}:${id}`;
}

async function findMessageByReference(
  db: SupabaseClient,
  conversacionId: string,
  referencia: string
) {
  const { data } = await db
    .from('mensajes_conversacion')
    .select('id, contenido, metadatos, enviado_en')
    .eq('conversacion_id', conversacionId)
    .eq('referencia_externa', referencia)
    .limit(1)
    .maybeSingle();

  return data || null;
}

export async function appendConversationMessage(
  db: SupabaseClient,
  input: {
    conversacionId: string;
    remitenteTipo: MensajeRemitente;
    contenido: string;
    remitenteId?: string | null;
    referenciaExterna?: string;
    metadatos?: Record<string, unknown>;
  }
) {
  if (!normalizeText(input.contenido)) {
    throw new Error('contenido_vacio');
  }

  if (input.referenciaExterna) {
    const existing = await findMessageByReference(db, input.conversacionId, input.referenciaExterna);
    if (existing) return existing;
  }

  const payload = {
    conversacion_id: input.conversacionId,
    remitente_tipo: input.remitenteTipo,
    remitente_id: input.remitenteId ?? null,
    tipo_contenido: 'texto',
    contenido: input.contenido.trim(),
    metadatos: input.metadatos || {},
    referencia_externa: input.referenciaExterna || null,
    enviado_en: nowIso()
  };

  const { data, error } = await db
    .from('mensajes_conversacion')
    .insert(payload)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`No se pudo guardar mensaje: ${error?.message || 'sin datos'}`);
  }

  return data;
}

async function appendEventAndNote(
  db: SupabaseClient,
  input: {
    oportunidadId: string;
    personaId: string;
    evento: string;
    nota: string;
    idempotencyKey: string;
    generadoPor: string;
    metadatos?: Record<string, unknown>;
  }
) {
  // Los eventos automáticos se almacenan en eventos_negocio. No son notas de
  // gestión y, por tanto, no deben contaminar el historial legible con claves
  // técnicas como "[demowapp:…]".
  const eventoExistente = await db
    .from('eventos_negocio')
    .select('id')
    .eq('evento', input.evento)
    .eq('metadatos->>idempotency_key', input.idempotencyKey)
    .limit(1)
    .maybeSingle();

  if (eventoExistente.data) return;

  await db.from('eventos_negocio').insert({
    evento: input.evento,
    persona_id: input.personaId,
    oportunidad_id: input.oportunidadId,
    metadatos: {
      ...(input.metadatos || {}),
      idempotency_key: input.idempotencyKey,
      origen: 'demowapp',
      resumen_legible: input.nota
    },
    generado_por: input.generadoPor,
    creado_en: nowIso()
  } as any);
}

function extractEmail(text: string): string | null {
  const m = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m ? m[0].toLowerCase() : null;
}

function extractName(text: string): string | null {
  const m = text.match(/(?:me\s+llamo|mi\s+nombre\s+es|soy)\s+([a-záéíóúñ\s]{3,60})/i);
  if (!m?.[1]) return null;
  const candidate = normalizeText(m[1]).replace(/[^a-záéíóúñ\s]/gi, '');
  if (candidate.length < 3) return null;
  return candidate;
}

function extractCiudad(text: string): string | null {
  const m = text.match(/(?:vivo\s+en|estoy\s+en|desde|en)\s+([a-záéíóúñ\s]{3,40})/i);
  if (!m?.[1]) return null;
  const city = normalizeText(m[1]).replace(/[^a-záéíóúñ\s]/gi, '');
  if (city.length < 3) return null;
  return city;
}

function extractModalidad(text: string): string | null {
  const t = normalizeToken(text);
  if (/(semi\s*presencial|h[íi]brid)/.test(t)) return 'hibrida';
  if (/(virtual|online|a distancia|remot)/.test(t)) return 'virtual';
  if (/(presencial|campus)/.test(t)) return 'presencial';
  return null;
}

function extractNivel(text: string): string | null {
  const t = normalizeToken(text);
  if (/(doctorado|phd)/.test(t)) return 'doctorado';
  if (/(maestr[ií]a|master|mag[ií]ster)/.test(t)) return 'maestria';
  if (/(especializaci[oó]n)/.test(t)) return 'especializacion';
  if (/(tecn[oó]logo)/.test(t)) return 'tecnologo';
  if (/(t[eé]cnico)/.test(t)) return 'tecnico';
  if (/(pregrado|profesional|carrera)/.test(t)) return 'pregrado';
  return null;
}

function extractHorizon(text: string): string | null {
  const m = text.match(/(?:iniciar|empezar|comenzar|inicio|arrancar)\s+([a-z0-9áéíóúñ\-\s]{2,30})/i);
  if (m?.[1]) return normalizeText(m[1]);
  const t = normalizeToken(text);
  if (/(este\s+a[nñ]o|pronto|lo\s+antes\s+posible|inmediato)/.test(t)) return 'lo_antes_posible';
  return null;
}

function extractInterestConfirmation(text: string): string | null {
  const t = normalizeToken(text);
  if (/(si\b|sí\b|confirmo|me interesa|quiero seguir|de acuerdo)/.test(t)) return 'si';
  if (/(no\b|no me interesa|prefiero otra)/.test(t)) return 'no';
  return null;
}

function splitName(fullName: string) {
  const parts = normalizeText(fullName).split(' ').filter(Boolean);
  if (parts.length <= 1) return { nombres: fullName, apellidos: '' };
  return {
    nombres: parts.slice(0, -1).join(' '),
    apellidos: parts.slice(-1).join(' ')
  };
}

async function getConfirmedFactsMap(db: SupabaseClient, personaId: string) {
  const { data } = await db
    .from('hechos_extraidos_naia')
    .select('id, clave, valor, estado_confirmacion, actualizado_en')
    .eq('persona_id', personaId)
    .eq('origen', 'naia')
    .order('actualizado_en', { ascending: false })
    .limit(200);

  const confirmed: Record<string, string> = {};
  for (const row of data || []) {
    if (row?.estado_confirmacion !== 'confirmado') continue;
    if (!row?.clave || confirmed[row.clave]) continue;
    confirmed[row.clave] = typeof row?.valor === 'string' ? row.valor : String(row?.valor ?? '');
  }
  return confirmed;
}

async function persistFactIfMissing(
  db: SupabaseClient,
  input: {
    personaId: string;
    conversacionId: string;
    mensajeId: string;
    clave: string;
    valor: string;
  }
) {
  const { data: existing } = await db
    .from('hechos_extraidos_naia')
    .select('id, estado_confirmacion')
    .eq('persona_id', input.personaId)
    .eq('origen', 'naia')
    .eq('clave', input.clave)
    .eq('estado_confirmacion', 'confirmado')
    .limit(1)
    .maybeSingle();

  if (existing) return false;

  const { error } = await db.from('hechos_extraidos_naia').insert({
    persona_id: input.personaId,
    conversacion_id: input.conversacionId,
    mensaje_id: input.mensajeId,
    tipo_hecho: 'dato_declarado',
    clave: input.clave,
    valor: input.valor,
    origen: 'naia',
    nivel_confianza: 1,
    estado_confirmacion: 'confirmado',
    fecha_confirmacion: nowIso(),
    creado_en: nowIso(),
    actualizado_en: nowIso()
  } as any);

  if (error) throw new Error(`No se pudo guardar hecho ${input.clave}: ${error.message}`);
  return true;
}

async function persistPersonaUpdatesWithoutOverwrite(
  db: SupabaseClient,
  input: {
    personaId: string;
    persona: any;
    captured: CapturedFacts;
    rawText: string;
  }
) {
  const patch: Record<string, unknown> = {};

  // Nunca sobrescribe dato confirmado existente.
  if (!input.persona?.correo_principal) {
    const email = extractEmail(input.rawText);
    if (email) patch.correo_principal = email;
  }

  const nombreNuevo = input.captured.nombre_confirmado;
  const nombreActual = normalizeText([input.persona?.nombres, input.persona?.apellidos].filter(Boolean).join(' '));
  if (nombreNuevo && (!nombreActual || /^sin\s+nombre$/i.test(nombreActual))) {
    const split = splitName(nombreNuevo);
    patch.nombres = split.nombres;
    patch.apellidos = split.apellidos;
  }

  if (Object.keys(patch).length === 0) return false;

  patch.actualizado_en = nowIso();
  const { error } = await db.from('personas').update(patch).eq('id', input.personaId);
  if (error) throw new Error(`No se pudo actualizar persona: ${error.message}`);
  return true;
}

function inferKnownState(input: {
  persona: any;
  oferta: any;
  confirmedFacts: Record<string, string>;
}): ProgressiveState {
  const known: CapturedFacts = {};

  const fullName = normalizeText([input.persona?.nombres, input.persona?.apellidos].filter(Boolean).join(' '));
  if (fullName && !/^sin\s+nombre$/i.test(fullName)) known.nombre_confirmado = fullName;

  const interest = input.confirmedFacts.interes_oferta_confirmado;
  if (interest === 'si' || interest === 'no') known.interes_oferta_confirmado = interest;

  if (input.confirmedFacts.ciudad_interes) known.ciudad_interes = input.confirmedFacts.ciudad_interes;
  if (input.confirmedFacts.modalidad_preferida)
    known.modalidad_preferida = input.confirmedFacts.modalidad_preferida;
  if (input.confirmedFacts.nivel_academico_interes)
    known.nivel_academico_interes = input.confirmedFacts.nivel_academico_interes;
  if (input.confirmedFacts.horizonte_inicio) known.horizonte_inicio = input.confirmedFacts.horizonte_inicio;

  // Si no hay confirmación explícita de interés, se mantiene como faltante aunque exista oferta.
  if (!known.interes_oferta_confirmado && input.oferta?.nombre_oferta) {
    // intentionally empty
  }

  const missing = DEMOWAPP_CAPTURE_ORDER.filter((key) => !known[key]);
  return { known, missing };
}

function detectNewFactsFromText(text: string): CapturedFacts {
  const captured: CapturedFacts = {};
  const clean = normalizeText(text);

  const nombre = extractName(clean);
  if (nombre) captured.nombre_confirmado = nombre;

  const interes = extractInterestConfirmation(clean);
  if (interes) captured.interes_oferta_confirmado = interes;

  const ciudad = extractCiudad(clean);
  if (ciudad) captured.ciudad_interes = ciudad;

  const modalidad = extractModalidad(clean);
  if (modalidad) captured.modalidad_preferida = modalidad;

  const nivel = extractNivel(clean);
  if (nivel) captured.nivel_academico_interes = nivel;

  const horizonte = extractHorizon(clean);
  if (horizonte) captured.horizonte_inicio = horizonte;

  return captured;
}

/**
 * BA-024: base de sesión con hechos confirmados y contacto que ya está
 * en la persona. El turno actual y la corrección del hilo se fusionan
 * después. No rellena lo que nadie declaró.
 */
function sesionPreviaDelHilo(contextoResumido: unknown): SesionEstudiante {
  if (typeof contextoResumido !== 'string' || !contextoResumido.trim()) return {};
  try {
    const parsed = JSON.parse(contextoResumido) as { datos_ya_dichos?: unknown };
    return sanearSesion(parsed?.datos_ya_dichos);
  } catch {
    return {};
  }
}

function sesionDesdeHechos(input: {
  confirmedFacts: Record<string, string>;
  persona: any;
  known: CapturedFacts;
}): SesionEstudiante {
  const base: SesionEstudiante = {};
  const nombre = input.known.nombre_confirmado || input.confirmedFacts.nombre_confirmado;
  if (nombre && !/^sin\s+nombre$/i.test(nombre)) base.contacto_nombre = nombre;
  if (input.known.ciudad_interes || input.confirmedFacts.ciudad_interes) {
    base.ciudad = input.known.ciudad_interes || input.confirmedFacts.ciudad_interes;
  }
  if (input.known.modalidad_preferida || input.confirmedFacts.modalidad_preferida) {
    base.modalidad = input.known.modalidad_preferida || input.confirmedFacts.modalidad_preferida;
  }
  if (input.known.nivel_academico_interes || input.confirmedFacts.nivel_academico_interes) {
    base.nivel = input.known.nivel_academico_interes || input.confirmedFacts.nivel_academico_interes;
  }
  if (input.confirmedFacts.presupuesto_declarado) base.presupuesto = input.confirmedFacts.presupuesto_declarado;
  if (input.confirmedFacts.intereses_declarados) base.intereses = input.confirmedFacts.intereses_declarados;
  if (input.confirmedFacts.contacto_correo) base.contacto_correo = input.confirmedFacts.contacto_correo;
  if (input.confirmedFacts.contacto_celular) base.contacto_celular = input.confirmedFacts.contacto_celular;

  const correoPersona = safeString(input.persona?.correo_principal);
  const celularPersona = safeString(input.persona?.celular_e164 || input.persona?.telefono_principal);
  if (correoPersona && !base.contacto_correo) base.contacto_correo = correoPersona;
  if (celularPersona && !base.contacto_celular) base.contacto_celular = celularPersona;

  return base;
}

function mergeKnown(current: CapturedFacts, updates: CapturedFacts): CapturedFacts {
  return {
    ...current,
    ...Object.fromEntries(Object.entries(updates).filter(([, value]) => Boolean(value)))
  };
}

/**
 * Guion histórico del perfil mínimo. BA-024 no lo usa como respuesta:
 * NaIA pregunta de a una, con la voz del bloque, y no recorre este formulario.
 */
function nextQuestion(state: ProgressiveState, ofertaNombre: string | null): string {
  const next = state.missing[0];
  switch (next) {
    case 'nombre_confirmado':
      return 'Para continuar, ¿me confirmas tu nombre completo tal como quieres que quede registrado?';
    case 'interes_oferta_confirmado':
      return `¿Confirmas que quieres continuar con esta oferta${ofertaNombre ? `: ${ofertaNombre}` : ''}? (sí/no)`;
    case 'ciudad_interes':
      return '¿En qué ciudad estás actualmente o desde qué ciudad harías tu proceso?';
    case 'modalidad_preferida':
      return '¿Qué modalidad prefieres para estudiar: virtual, presencial o híbrida?';
    case 'nivel_academico_interes':
      return '¿Qué nivel académico buscas: técnico, tecnólogo, pregrado, especialización, maestría o doctorado?';
    case 'horizonte_inicio':
      return '¿Cuándo te gustaría iniciar? (ejemplo: este año, 2027-1, enero)';
    default:
      return '¡Perfecto! Ya tengo la información clave para continuar con tu seguimiento.';
  }
}

function buildProgressiveReply(input: {
  state: ProgressiveState;
  newFacts: CapturedFacts;
  ofertaNombre: string | null;
}) {
  const capturedKeys = Object.keys(input.newFacts);
  const intro =
    capturedKeys.length > 0
      ? `Gracias, registré este dato: ${capturedKeys.join(', ').replaceAll('_', ' ')}.`
      : 'Gracias por tu mensaje.';

  if (input.state.missing.length === 0) {
    return {
      mensaje:
        `${intro} Ya tenemos perfil mínimo completo. A partir de aquí continuamos con seguimiento y próximos pasos de tu solicitud.`,
      esperaRespuesta: true,
      perfilMinimoCompleto: true
    };
  }

  return {
    mensaje: `${intro} ${nextQuestion(input.state, input.ofertaNombre)}`,
    esperaRespuesta: true,
    perfilMinimoCompleto: false
  };
}

async function resolveStageTargets(db: SupabaseClient) {
  const { data: etapas } = await db
    .from('etapas_embudo')
    .select('id, nombre, orden, es_etapa_final_ganada, es_etapa_final_perdida, activo')
    .eq('activo', true)
    .order('orden', { ascending: true });

  const { data: subestados } = await db
    .from('subestados_oportunidad')
    .select('id, etapa_id, nombre, orden, activo')
    .eq('activo', true)
    .order('orden', { ascending: true });

  const byName = (name: string) =>
    (etapas || []).find((e: any) => normalizeToken(e.nombre) === normalizeToken(name));

  const etapaGestion = byName('En gestión') || null;
  const etapaCalificada = byName('Calificada') || null;

  const subFor = (etapaId?: string | null, preferred?: string[]) => {
    if (!etapaId) return null;
    const list = (subestados || []).filter((s: any) => s.etapa_id === etapaId);
    if (preferred?.length) {
      const byPref = list.find((s: any) =>
        preferred.some((p) => normalizeToken(s.nombre) === normalizeToken(p))
      );
      if (byPref) return byPref;
    }
    return list[0] || null;
  };

  return {
    etapas: etapas || [],
    etapaGestion,
    etapaCalificada,
    subGestion: subFor(etapaGestion?.id, ['Contactado', 'En seguimiento']),
    subCalificada: subFor(etapaCalificada?.id, ['Perfil completo', 'Calificado'])
  };
}

async function advanceFunnelIfNeeded(
  db: SupabaseClient,
  input: {
    oportunidad: any;
    oportunidadId: string;
    personaId: string;
    firstStudentMessage: boolean;
    perfilMinimoCompleto: boolean;
    conversacionId: string;
    mensajeId: string;
  }
) {
  const targets = await resolveStageTargets(db);
  const current = targets.etapas.find((e: any) => e.id === input.oportunidad?.etapa_id);
  if (!current) return { changed: false, trigger: null as string | null };
  if (current.es_etapa_final_ganada || current.es_etapa_final_perdida) {
    return { changed: false, trigger: null as string | null };
  }

  let targetEtapa: any = null;
  let targetSub: any = null;
  let trigger: string | null = null;

  // HITO 1: primer mensaje real del estudiante -> pasa a "En gestión/Contactado".
  if (input.firstStudentMessage && targets.etapaGestion) {
    const currentOrder = Number(current.orden ?? 0);
    const targetOrder = Number(targets.etapaGestion.orden ?? 0);
    if (currentOrder < targetOrder) {
      targetEtapa = targets.etapaGestion;
      targetSub = targets.subGestion;
      trigger = 'hito_primer_mensaje';
    }
  }

  // HITO 2: perfil mínimo completo (nombre+interés+ciudad+modalidad+nivel+horizonte)
  // -> pasa a "Calificada".
  if (input.perfilMinimoCompleto && targets.etapaCalificada) {
    const currentStage = targetEtapa || current;
    const currentOrder = Number(currentStage.orden ?? 0);
    const targetOrder = Number(targets.etapaCalificada.orden ?? 0);
    if (currentOrder < targetOrder) {
      targetEtapa = targets.etapaCalificada;
      targetSub = targets.subCalificada;
      trigger = 'hito_perfil_minimo_completo';
    }
  }

  if (!targetEtapa) return { changed: false, trigger: null as string | null };

  const { error: upError } = await db
    .from('oportunidades')
    .update({
      etapa_id: targetEtapa.id,
      subestado_id: targetSub?.id || null,
      actualizado_en: nowIso()
    })
    .eq('id', input.oportunidadId);

  if (upError) throw new Error(`No se pudo avanzar etapa: ${upError.message}`);

  const { error: histError } = await db.from('historial_etapas_oportunidad').insert({
    oportunidad_id: input.oportunidadId,
    etapa_anterior_id: current.id,
    etapa_nueva_id: targetEtapa.id,
    subestado_anterior_id: input.oportunidad?.subestado_id || null,
    subestado_nuevo_id: targetSub?.id || null,
    motivo: trigger,
    cambiado_por: null,
    canal: 'demowapp_auto',
    creado_en: nowIso()
  } as any);

  if (histError) throw new Error(`No se pudo registrar historial de etapa: ${histError.message}`);

  await appendEventAndNote(db, {
    oportunidadId: input.oportunidadId,
    personaId: input.personaId,
    evento: 'demowapp_funnel_avance_automatico',
    nota: `Avance automático de funnel por ${trigger}. Nueva etapa: ${targetEtapa.nombre}${targetSub?.nombre ? ` / ${targetSub.nombre}` : ''}.`,
    idempotencyKey: `${input.mensajeId}:${trigger}`,
    generadoPor: 'demowapp_funnel_engine',
    metadatos: {
      trigger,
      conversacion_id: input.conversacionId,
      etapa_anterior_id: current.id,
      etapa_nueva_id: targetEtapa.id,
      subestado_nuevo_id: targetSub?.id || null
    }
  });

  return { changed: true, trigger };
}

/**
 * BA-031 no entra por este turno. NaIA orienta y puede nombrar una oferta;
 * Aplicar, el registro y el consentimiento viven en funnel-aplicar.ts.
 * Este camino no crea oportunidad ni transferencia a universidad.
 */
export async function processInboundStudentMessage(
  db: SupabaseClient,
  input: {
    oportunidadId: string;
    personaId: string;
    aplicacionId?: string | null;
    texto: string;
    clientMessageId: string;
    origen: 'estudiante_modal' | 'operador_simulacion';
    visitanteId?: string | null;
    celularVerificado?: string | null;
  }
) {
  const conversacion = await getOrCreateActiveConversation(db, {
    oportunidadId: input.oportunidadId,
    personaId: input.personaId,
    reopenIfClosed: true,
    tipoInicio: input.origen === 'estudiante_modal' ? 'estudiante_inbound' : 'operador_simulacion'
  });

  const inboundRef = makeIdempotencyRef('inbound', input.clientMessageId);

  const inbound = await appendConversationMessage(db, {
    conversacionId: conversacion.id,
    remitenteTipo: 'persona',
    remitenteId: input.personaId,
    contenido: input.texto,
    referenciaExterna: inboundRef,
    metadatos: {
      origen: 'estudiante_inbound',
      clientMessageId: input.clientMessageId,
      canal: 'demo_wapp'
    }
  });

  await bestEffort('cancelar recordatorios pendientes', () =>
    cancelPendingSilencePushes(db, conversacion.id)
  );

  const [personaRes, aplicacionRes, oportunidadRes, historyRes] = await Promise.all([
    db
      .from('personas')
      .select('id, nombres, apellidos, correo_principal, celular_e164, telefono_principal')
      .eq('id', input.personaId)
      .maybeSingle(),
    input.aplicacionId
      ? db
          .from('aplicaciones')
          .select('estado, fecha_aplicacion, oferta_id, periodo_academico_id')
          .eq('id', input.aplicacionId)
          .eq('oportunidad_id', input.oportunidadId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from('oportunidades')
      .select('id, estado, temperatura, puntaje, etapa_id, subestado_id, actualizado_en')
      .eq('id', input.oportunidadId)
      .maybeSingle(),
    db
      .from('mensajes_conversacion')
      .select('id, remitente_tipo, contenido, creado_en')
      .eq('conversacion_id', conversacion.id)
      .order('creado_en', { ascending: true })
      .limit(400)
  ]);

  const persona = personaRes.data || {};
  const oportunidad = oportunidadRes.data || {};

  const ofertaId = input.aplicacionId ? aplicacionRes.data?.oferta_id : null;
  const { data: oferta } = ofertaId
    ? await db
        .from('ofertas_academicas')
        .select('id, nombre_oferta, universidad_id, programa_id, sede_id')
        .eq('id', ofertaId)
        .maybeSingle()
    : { data: null as any };

  const confirmedFacts =
    (await bestEffort('cargar hechos confirmados', () =>
      getConfirmedFactsMap(db, input.personaId)
    )) || {};
  const initialState = inferKnownState({ persona, oferta, confirmedFacts });
  // BA-024: la extracción de voz pisa al extractor viejo cuando reconoce
  // ciudad, modalidad o nivel. No inventa: solo lo que está en el texto.
  const slotsTurno = extraerSlotsDeclarados(input.texto);
  const newFactsRaw = detectNewFactsFromText(input.texto);
  if (slotsTurno.ciudad) newFactsRaw.ciudad_interes = slotsTurno.ciudad;
  if (slotsTurno.modalidad) newFactsRaw.modalidad_preferida = slotsTurno.modalidad;
  if (slotsTurno.nivel) newFactsRaw.nivel_academico_interes = slotsTurno.nivel;
  if (slotsTurno.contacto_nombre) newFactsRaw.nombre_confirmado = slotsTurno.contacto_nombre;

  const persistedFacts: CapturedFacts = {};
  for (const [k, value] of Object.entries(newFactsRaw) as [DemoWappCaptureKey, string][]) {
    if (!value || initialState.known[k]) continue;
    const inserted = await bestEffort(`guardar hecho ${k}`, () =>
      persistFactIfMissing(db, {
        personaId: input.personaId,
        conversacionId: conversacion.id,
        mensajeId: inbound.id,
        clave: k,
        valor: value
      })
    );
    if (inserted) persistedFacts[k] = value;
  }

  // Slots que no mueven el funnel (presupuesto, intereses, contacto).
  // Si el insert falla, el turno sigue y la sesión de este mensaje igual los tiene.
  const slotsExtra: Array<[string, string | undefined]> = [
    ['presupuesto_declarado', slotsTurno.presupuesto],
    ['intereses_declarados', slotsTurno.intereses],
    ['contacto_correo', slotsTurno.contacto_correo],
    ['contacto_celular', slotsTurno.contacto_celular]
  ];
  for (const [clave, valor] of slotsExtra) {
    if (!valor || confirmedFacts[clave]) continue;
    await bestEffort(`guardar hecho ${clave}`, () =>
      persistFactIfMissing(db, {
        personaId: input.personaId,
        conversacionId: conversacion.id,
        mensajeId: inbound.id,
        clave,
        valor
      })
    );
  }

  await bestEffort('actualizar datos de persona', () =>
    persistPersonaUpdatesWithoutOverwrite(db, {
      personaId: input.personaId,
      persona,
      captured: persistedFacts,
      rawText: input.texto
    })
  );

  const stateAfterCapture = (() => {
    const known = mergeKnown(initialState.known, persistedFacts);
    return {
      known,
      missing: DEMOWAPP_CAPTURE_ORDER.filter((k) => !known[k])
    } as ProgressiveState;
  })();

  // Hechos confirmados no se pisan en BD. El hilo sí: lo último dicho
  // (contexto_resumido) gana, y este turno gana sobre eso. Una apertura
  // (“cualquier ciudad”) borra solo ese dato.
  const sesionNaia = fusionarSesion(
    fusionarSesion(
      sesionDesdeHechos({
        confirmedFacts,
        persona,
        known: stateAfterCapture.known
      }),
      sesionPreviaDelHilo((conversacion as any).contexto_resumido)
    ),
    slotsTurno,
    detectarAperturas(input.texto)
  );
  const contextoNaia = {
    estudiante: persona,
    aplicacion: aplicacionRes.data || null,
    oferta: oferta || null,
    oportunidad,
    mensajeEntrante: input.texto,
    resumenPrevio: (conversacion as any).resumen || null,
    contextoResumidoPrevio: (conversacion as any).contexto_resumido || null,
    mensajesRecientes: (historyRes.data || []).slice(-12),
    // BA-024: lo ya dicho, no la lista de faltantes del formulario.
    datos_ya_dichos: sesionNaia
  };
  const sesionHiloPrevia = leerSesionHiloDeContexto((conversacion as any).contexto_resumido);
  const naia = await callNaiaFromServer({
    mensaje: input.texto,
    conversationId: (conversacion as any).referencia_externa || undefined,
    contexto: contextoNaia,
    sesion: sesionNaia,
    sesionHilo: sesionHiloPrevia
  });
  const reply = {
    mensaje: naia.mensaje,
    esperaRespuesta: naia.espera_respuesta !== false,
    perfilMinimoCompleto: stateAfterCapture.missing.length === 0
  };

  if (naia.conversationId && naia.conversationId !== (conversacion as any).referencia_externa) {
    await bestEffort('guardar sesión de Abacus', async () => {
      const { error } = await db
        .from('conversaciones')
        .update({ referencia_externa: naia.conversationId, actualizado_en: nowIso() })
        .eq('id', conversacion.id);
      if (error) throw error;
    });
  }

  const naiaRef = makeIdempotencyRef('naia', input.clientMessageId);
  const outbound = await appendConversationMessage(db, {
    conversacionId: conversacion.id,
    remitenteTipo: 'naia',
    contenido: reply.mensaje,
    referenciaExterna: naiaRef,
    metadatos: {
      origen: 'naia_centro_ia',
      codigo_canal: DEMOWAPP_CANAL,
      espera_respuesta: reply.esperaRespuesta,
      intencion_detectada: naia.intencion_detectada || null,
      siguiente_accion_sugerida: naia.siguiente_accion_sugerida || null,
      requiere_escalamiento: Boolean(naia.requiere_escalamiento),
      faltantes: stateAfterCapture.missing,
      capturados_turno: Object.keys(persistedFacts)
    }
  });

  const studentMessages = (historyRes.data || []).filter((m: any) => m.remitente_tipo === 'persona' || m.remitente_tipo === 'estudiante').length;
  const firstStudentMessage = studentMessages === 1;

  const funnelAdvance =
    (await bestEffort('avanzar funnel', () =>
      advanceFunnelIfNeeded(db, {
        oportunidad,
        oportunidadId: input.oportunidadId,
        personaId: input.personaId,
        firstStudentMessage,
        perfilMinimoCompleto: reply.perfilMinimoCompleto,
        conversacionId: conversacion.id,
        mensajeId: outbound.id
      })
    )) || { changed: false, trigger: null as string | null };

  await bestEffort('actualizar contexto de conversación', () =>
    updateConversationContext(db, conversacion.id, {
      estado: CONVERSACION_ESTADO_ACTIVA,
      resumen: naia.resumen_actualizado || (conversacion as any).resumen || 'Conversación NaIA Demowapp',
      contextoResumido: JSON.stringify({
        origen: 'demowapp_centro_ia',
        codigo_canal: DEMOWAPP_CANAL,
        known: stateAfterCapture.known,
        missing: stateAfterCapture.missing,
        datos_ya_dichos: sesionNaia,
        intencion: naia.intencion_detectada || null,
        sesion_hilo: naia.sesionHilo || sesionHiloPrevia,
        siguiente_accion: naia.siguiente_accion_sugerida || null,
        requiere_escalamiento: Boolean(naia.requiere_escalamiento),
        funnel_advance_trigger: funnelAdvance.trigger,
        updated_at: nowIso()
      })
    })
  );

  await bestEffort('registrar nota y evento CRM', () =>
    appendEventAndNote(db, {
      oportunidadId: input.oportunidadId,
      personaId: input.personaId,
      evento: 'demowapp_turno_estudiante',
      nota: `Captura progresiva: faltantes=${stateAfterCapture.missing.join(', ') || 'ninguno'}; capturados=${Object.keys(persistedFacts).join(', ') || 'ninguno'}.`,
      idempotencyKey: input.clientMessageId,
      generadoPor: input.origen,
      metadatos: {
        conversacion_id: conversacion.id,
        mensaje_estudiante_id: inbound.id,
        mensaje_naia_id: outbound.id,
        funnel_advance_trigger: funnelAdvance.trigger
      }
    })
  );

  await bestEffort('programar recordatorio de silencio', () =>
    scheduleSilenceReminderPush(db, {
      conversacionId: conversacion.id,
      oportunidadId: input.oportunidadId,
      personaId: input.personaId,
      baseMessageId: outbound.id
    })
  );

  return {
    conversacionId: conversacion.id,
    inbound,
    outbound,
    estadoConversacion: CONVERSACION_ESTADO_ACTIVA
  };
}
