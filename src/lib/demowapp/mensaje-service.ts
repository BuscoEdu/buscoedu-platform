import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CONVERSACION_ESTADO_ACTIVA,
  getOrCreateActiveConversation,
  updateConversationContext
} from './conversacion-service';
import { scheduleSilenceReminderPush, cancelPendingSilencePushes } from './push-service';
import { DEMOWAPP_CAPTURE_ORDER, type DemoWappCaptureKey } from './config';

const ABACUS_ENDPOINT = 'https://api.abacus.ai/api/v0/getConversationResponse';

interface NaiaStructuredResponse {
  mensaje: string;
  resumen_actualizado?: string;
  intencion_detectada?: string;
  siguiente_accion_sugerida?: string;
  requiere_escalamiento?: boolean;
  espera_respuesta?: boolean;
  conversationId?: string;
}

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function extractJson(text: string): any | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] || text.trim();
  try { return JSON.parse(candidate); } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
    }
    return null;
  }
}

async function callNaiaFromServer(input: {
  mensaje: string;
  conversationId?: string;
  contexto: Record<string, unknown>;
}): Promise<NaiaStructuredResponse> {
  const deploymentId = process.env.ABACUS_NAIA_DEPLOYMENT_ID;
  const deploymentToken = process.env.ABACUS_NAIA_DEPLOYMENT_TOKEN;
  const fallback = 'No pude procesar tu mensaje en este momento. ¿Podrías contarme de otra forma qué necesitas para avanzar con tu proceso?';

  if (!deploymentId || !deploymentToken) {
    return { mensaje: fallback, espera_respuesta: true, conversationId: input.conversationId };
  }

  const instructions = [
    'Eres NaIA, asesora de admisiones de BuscoEdu.',
    'Responde en español, de manera tranquila, directa y útil; no seas aduladora.',
    'Usa el contexto CRM y el historial para responder al mensaje real del estudiante.',
    'No repitas preguntas si el estudiante ya respondió ni uses un guion fijo.',
    'No inventes condiciones de oferta, admisión, becas o cupos.',
    'Devuelve exclusivamente JSON válido con: mensaje, resumen_actualizado, intencion_detectada, siguiente_accion_sugerida, requiere_escalamiento, espera_respuesta.'
  ].join(' ');

  try {
    const body: Record<string, unknown> = {
      deploymentId,
      deploymentToken,
      message: `${instructions}\n\nContexto CRM: ${JSON.stringify(input.contexto)}\n\nMensaje actual del estudiante: ${input.mensaje}`
    };
    if (input.conversationId) body.deploymentConversationId = input.conversationId;
    const response = await fetch(ABACUS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`abacus_${response.status}`);

    const raw = await response.json();
    const result = raw?.result ?? raw;
    const conversationId = result?.deploymentConversationId || result?.deployment_conversation_id || input.conversationId;
    const messages = Array.isArray(result?.messages) ? result.messages : [];
    const bot = [...messages].reverse().find((m: any) => !(m?.is_user ?? m?.isUser));
    const text = safeString(bot?.text ?? bot?.content);
    if (!text) throw new Error('abacus_sin_mensaje');

    const parsed = extractJson(text);
    if (!parsed) return { mensaje: text, espera_respuesta: true, conversationId };
    return {
      mensaje: safeString(parsed.mensaje) || safeString(parsed.respuesta) || fallback,
      resumen_actualizado: safeString(parsed.resumen_actualizado) || undefined,
      intencion_detectada: safeString(parsed.intencion_detectada) || undefined,
      siguiente_accion_sugerida: safeString(parsed.siguiente_accion_sugerida) || undefined,
      requiere_escalamiento: Boolean(parsed.requiere_escalamiento),
      espera_respuesta: parsed.espera_respuesta !== false,
      conversationId
    };
  } catch {
    return { mensaje: fallback, espera_respuesta: true, conversationId: input.conversationId };
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
  const marker = `[demowapp:${input.idempotencyKey}]`;
  const contenidoNota = `${marker} ${input.nota}`;

  const existingNote = await db
    .from('notas_crm')
    .select('id')
    .eq('oportunidad_id', input.oportunidadId)
    .eq('persona_id', input.personaId)
    .eq('contenido', contenidoNota)
    .limit(1)
    .maybeSingle();

  if (!existingNote.data) {
    await db.from('notas_crm').insert({
      oportunidad_id: input.oportunidadId,
      persona_id: input.personaId,
      autor_id: null,
      contenido: contenidoNota,
      es_privada: true
    });
  }

  await db.from('eventos_negocio').insert({
    evento: input.evento,
    persona_id: input.personaId,
    oportunidad_id: input.oportunidadId,
    metadatos: {
      ...(input.metadatos || {}),
      idempotency_key: input.idempotencyKey,
      origen: 'demowapp'
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
    clave: DemoWappCaptureKey;
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

function mergeKnown(current: CapturedFacts, updates: CapturedFacts): CapturedFacts {
  return {
    ...current,
    ...Object.fromEntries(Object.entries(updates).filter(([, value]) => Boolean(value)))
  };
}

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

export async function processInboundStudentMessage(
  db: SupabaseClient,
  input: {
    oportunidadId: string;
    personaId: string;
    aplicacionId: string;
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
    db
      .from('aplicaciones')
      .select('estado, fecha_aplicacion, oferta_id, periodo_academico_id')
      .eq('id', input.aplicacionId)
      .eq('oportunidad_id', input.oportunidadId)
      .maybeSingle(),
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

  const ofertaId = aplicacionRes.data?.oferta_id;
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
  const newFactsRaw = detectNewFactsFromText(input.texto);

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

  const contextoNaia = {
    estudiante: persona,
    aplicacion: aplicacionRes.data || null,
    oferta: oferta || null,
    oportunidad,
    mensajeEntrante: input.texto,
    resumenPrevio: (conversacion as any).resumen || null,
    contextoResumidoPrevio: (conversacion as any).contexto_resumido || null,
    mensajesRecientes: (historyRes.data || []).slice(-12),
    capturaProgresiva: { known: stateAfterCapture.known, missing: stateAfterCapture.missing }
  };
  const naia = await callNaiaFromServer({
    mensaje: input.texto,
    conversationId: (conversacion as any).referencia_externa || undefined,
    contexto: contextoNaia
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
      origen: 'naia_abacus',
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
        origen: 'demowapp_abacus',
        known: stateAfterCapture.known,
        missing: stateAfterCapture.missing,
        intencion: naia.intencion_detectada || null,
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
