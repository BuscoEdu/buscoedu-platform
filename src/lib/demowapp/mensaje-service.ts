import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CONVERSACION_ESTADO_ACTIVA,
  CONVERSACION_ESTADO_CERRADA,
  getOrCreateActiveConversation,
  updateConversationContext
} from './conversacion-service';
import { scheduleSilenceReminderPush, cancelPendingSilencePushes } from './push-service';

const ABACUS_ENDPOINT = 'https://api.abacus.ai/api/v0/getConversationResponse';

// La tabla usa los actores canónicos del CRM: `persona` y `naia`.
// "estudiante" es una etiqueta de interfaz, no un valor permitido por la
// restricción de mensajes_conversacion.remitente_tipo.
type MensajeRemitente = 'persona' | 'naia';

interface NaiaStructuredResponse {
  mensaje: string;
  resumen_actualizado?: string;
  intencion_detectada?: string;
  siguiente_accion_sugerida?: string;
  requiere_escalamiento?: boolean;
  espera_respuesta?: boolean;
}

function nowIso() {
  return new Date().toISOString();
}

function safeString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
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

  const eventPayload = {
    evento: input.evento,
    metadatos: {
      ...(input.metadatos || {}),
      idempotency_key: input.idempotencyKey,
      origen: 'demowapp'
    },
    generado_por: input.generadoPor,
    creado_en: nowIso()
  };

  const eventInsert = await db.from('eventos_negocio').insert(eventPayload as any);

  if (eventInsert.error && /column/i.test(eventInsert.error.message || '')) {
    await db.from('eventos_negocio').insert({
      tipo_evento: input.evento,
      metadata: {
        ...(input.metadatos || {}),
        idempotency_key: input.idempotencyKey,
        origen: 'demowapp'
      },
      fecha_evento: nowIso()
    } as any);
  }
}

async function callNaiaFromServer(input: {
  mensaje: string;
  conversationId?: string;
  contexto: Record<string, unknown>;
}): Promise<NaiaStructuredResponse> {
  const deploymentId = process.env.ABACUS_NAIA_DEPLOYMENT_ID;
  const deploymentToken = process.env.ABACUS_NAIA_DEPLOYMENT_TOKEN;

  if (!deploymentId || !deploymentToken) {
    return {
      mensaje:
        'Gracias por tu mensaje. En este momento tuve un inconveniente técnico, pero puedo seguir acompañándote. ¿Cuál es tu principal duda para avanzar con tu postulación?',
      espera_respuesta: true
    };
  }

  const prompt = `Contexto CRM JSON: ${JSON.stringify(input.contexto)}\n\n` +
    'Responde EXCLUSIVAMENTE un JSON válido con llaves: mensaje, resumen_actualizado, intencion_detectada, siguiente_accion_sugerida, requiere_escalamiento, espera_respuesta.' +
    `\nMensaje estudiante: ${input.mensaje}`;

  try {
    const reqBody: Record<string, unknown> = {
      deploymentId,
      deploymentToken,
      message: prompt
    };

    if (input.conversationId) {
      reqBody.deploymentConversationId = input.conversationId;
    }

    const response = await fetch(ABACUS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });

    if (!response.ok) {
      throw new Error(`abacus_${response.status}`);
    }

    const data = await response.json();
    const result = data?.result ?? data;
    const messages = result?.messages;

    const botText = Array.isArray(messages)
      ? [...messages].reverse().find((m: any) => !(m?.is_user ?? m?.isUser))?.text || ''
      : '';

    if (!botText.trim()) throw new Error('abacus_sin_mensaje');
    const match = botText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonText = match?.[1] || botText;
    let parsed: any = null;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      // La integración existente también puede responder texto plano. En ese caso
      // se conserva la respuesta comercial de NaIA en lugar de descartarla.
      return { mensaje: botText.trim(), espera_respuesta: true };
    }

    return {
      mensaje:
        safeString(parsed?.mensaje) ||
        '¡Gracias! Ya registré tu mensaje. ¿Qué te gustaría resolver primero para avanzar?',
      resumen_actualizado: safeString(parsed?.resumen_actualizado) || undefined,
      intencion_detectada: safeString(parsed?.intencion_detectada) || undefined,
      siguiente_accion_sugerida: safeString(parsed?.siguiente_accion_sugerida) || undefined,
      requiere_escalamiento: Boolean(parsed?.requiere_escalamiento),
      espera_respuesta: parsed?.espera_respuesta !== false
    };
  } catch {
    return {
      mensaje:
        'Te leí y quiero acompañarte en este proceso. Para ayudarte mejor, cuéntame cuál es tu principal objetivo con esta oportunidad.',
      espera_respuesta: true
    };
  }
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

  await cancelPendingSilencePushes(db, conversacion.id);

  const [personaRes, aplicacionRes, oportunidadRes, mensajesRes] = await Promise.all([
    db
      .from('personas')
      .select('nombres, apellidos, correo_principal, celular_e164')
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
      .select('estado, temperatura, puntaje, etapa_id, subestado_id, notas_internas')
      .eq('id', input.oportunidadId)
      .maybeSingle(),
    db
      .from('mensajes_conversacion')
      .select('remitente_tipo, contenido, creado_en')
      .eq('conversacion_id', conversacion.id)
      .order('creado_en', { ascending: false })
      .limit(12)
  ]);

  const ofertaId = aplicacionRes.data?.oferta_id;
  const oportunidad = oportunidadRes.data;
  const [ofertaRes, etapaRes, subestadoRes] = await Promise.all([
    ofertaId
      ? db.from('ofertas_academicas').select('nombre_oferta, universidad_id, programa_id, sede_id').eq('id', ofertaId).maybeSingle()
      : Promise.resolve({ data: null } as any),
    oportunidad?.etapa_id
      ? db.from('etapas_embudo').select('nombre').eq('id', oportunidad.etapa_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    oportunidad?.subestado_id
      ? db.from('subestados_oportunidad').select('nombre').eq('id', oportunidad.subestado_id).maybeSingle()
      : Promise.resolve({ data: null } as any)
  ]);

  const contexto = {
    estudiante: personaRes.data || null,
    aplicacion: aplicacionRes.data || null,
    oferta: ofertaRes.data || null,
    oportunidad: {
      ...(oportunidad || {}),
      etapa: etapaRes.data?.nombre || null,
      subestado: subestadoRes.data?.nombre || null
    },
    visitanteId: input.visitanteId,
    celularVerificado: input.celularVerificado,
    mensajeEntrante: input.texto,
    resumenPrevio: (conversacion as any).resumen || null,
    contextoResumidoPrevio: (conversacion as any).contexto_resumido || null,
    mensajesRecientes: (mensajesRes.data || []).reverse()
  };

  const naia = await callNaiaFromServer({
    mensaje: input.texto,
    conversationId: (conversacion as any).referencia_externa || undefined,
    contexto
  });

  const naiaRef = makeIdempotencyRef('naia', input.clientMessageId);
  const outbound = await appendConversationMessage(db, {
    conversacionId: conversacion.id,
    remitenteTipo: 'naia',
    contenido: naia.mensaje,
    referenciaExterna: naiaRef,
    metadatos: {
      origen: 'naia_respuesta',
      espera_respuesta: naia.espera_respuesta !== false,
      intencion_detectada: naia.intencion_detectada || null,
      siguiente_accion_sugerida: naia.siguiente_accion_sugerida || null,
      requiere_escalamiento: Boolean(naia.requiere_escalamiento)
    }
  });

  await updateConversationContext(db, conversacion.id, {
    estado: CONVERSACION_ESTADO_ACTIVA,
    resumen: naia.resumen_actualizado || (conversacion as any).resumen || null,
    contextoResumido:
      JSON.stringify({
        intencion: naia.intencion_detectada || null,
        siguiente_accion: naia.siguiente_accion_sugerida || null,
        requiere_escalamiento: Boolean(naia.requiere_escalamiento),
        ultima_interaccion_en: nowIso()
      }) || null
  });

  await appendEventAndNote(db, {
    oportunidadId: input.oportunidadId,
    personaId: input.personaId,
    evento: 'demowapp_turno_estudiante',
    nota: `Estudiante escribió: "${normalizeText(input.texto).slice(0, 160)}". NaIA respondió y se actualizó contexto.`,
    idempotencyKey: input.clientMessageId,
    generadoPor: input.origen,
    metadatos: {
      conversacion_id: conversacion.id,
      mensaje_estudiante_id: inbound.id,
      mensaje_naia_id: outbound.id
    }
  });

  if (naia.espera_respuesta !== false) {
    await scheduleSilenceReminderPush(db, {
      conversacionId: conversacion.id,
      oportunidadId: input.oportunidadId,
      personaId: input.personaId,
      baseMessageId: outbound.id
    });
  }

  return {
    conversacionId: conversacion.id,
    inbound,
    outbound,
    estadoConversacion: naia.espera_respuesta === false ? CONVERSACION_ESTADO_CERRADA : CONVERSACION_ESTADO_ACTIVA
  };
}
