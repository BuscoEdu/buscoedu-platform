import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CONVERSACION_ESTADO_CERRADA,
  DEMOWAPP_CANAL,
  DEMOWAPP_META_CHANNEL,
  getOrCreateActiveConversation,
  updateConversationContext
} from './conversacion-service';
import { DEMOWAPP_PUSH_CATALOG, type DemoWappPushCode, renderPushTemplate } from './push-catalog';
import { DEMOWAPP_TIMEOUTS } from './config';

function nowIso() {
  return new Date().toISOString();
}

function plusSeconds(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function schedulePush(
  db: SupabaseClient,
  input: {
    code: DemoWappPushCode;
    oportunidadId: string;
    personaId: string;
    conversacionId: string;
    destinatario: string;
    fechaProgramada: string;
    idempotencyKey: string;
    metadatos?: Record<string, unknown>;
    mensajeRenderizado: string;
  }
) {
  const existing = await db
    .from('comunicaciones_transaccionales')
    .select('id, estado_envio')
    .eq('metadatos->>idempotency_key', input.idempotencyKey)
    .limit(1)
    .maybeSingle();

  if (existing.data) {
    return existing.data;
  }

  const payload = {
    persona_id: input.personaId,
    oportunidad_id: input.oportunidadId,
    conversacion_id: input.conversacionId,
    canal: DEMOWAPP_CANAL,
    destinatario: input.destinatario,
    plantilla: input.code,
    estado_envio: 'pendiente',
    fecha_programada: input.fechaProgramada,
    metadatos: {
      ...(input.metadatos || {}),
      origen: 'demowapp_push',
      canal_simulado: DEMOWAPP_META_CHANNEL,
      idempotency_key: input.idempotencyKey,
      mensaje_renderizado: input.mensajeRenderizado
    }
  };

  const { data, error } = await db
    .from('comunicaciones_transaccionales')
    .insert(payload)
    .select('id, estado_envio')
    .single();

  if (error || !data) {
    throw new Error(`No se pudo programar push ${input.code}: ${error?.message || 'sin datos'}`);
  }

  return data;
}

export async function scheduleWelcomePushFromConversion(
  db: SupabaseClient,
  input: {
    oportunidadId: string;
    personaId: string;
    aplicacionId: string;
    nombre: string;
    ofertaNombre: string;
    destinatario: string;
  }
) {
  const conversacion = await getOrCreateActiveConversation(db, {
    oportunidadId: input.oportunidadId,
    personaId: input.personaId,
    reopenIfClosed: false,
    tipoInicio: 'aplicacion_exitosa'
  });

  const code: DemoWappPushCode = 'bienvenida_aplicacion_exitosa';
  const idempotencyKey = `demowapp:bienvenida:${input.aplicacionId}`;
  const message = renderPushTemplate(code, {
    nombre: input.nombre,
    oferta: input.ofertaNombre
  });

  return schedulePush(db, {
    code,
    oportunidadId: input.oportunidadId,
    personaId: input.personaId,
    conversacionId: conversacion.id,
    destinatario: input.destinatario,
    fechaProgramada: plusSeconds(5),
    idempotencyKey,
    metadatos: {
      aplicacion_id: input.aplicacionId,
      tipo_inicio: 'aplicacion_exitosa'
    },
    mensajeRenderizado: message
  });
}

export async function scheduleSilenceReminderPush(
  db: SupabaseClient,
  input: {
    conversacionId: string;
    oportunidadId: string;
    personaId: string;
    baseMessageId: string;
  }
) {
  const code: DemoWappPushCode = 'recordatorio_silencio_3_min';
  const idempotencyKey = `demowapp:recordatorio:${input.baseMessageId}`;

  return schedulePush(db, {
    code,
    oportunidadId: input.oportunidadId,
    personaId: input.personaId,
    conversacionId: input.conversacionId,
    destinatario: 'estudiante',
    fechaProgramada: plusSeconds(DEMOWAPP_TIMEOUTS.SILENCE_REMINDER_SECONDS),
    idempotencyKey,
    metadatos: {
      base_message_id: input.baseMessageId,
      tipo_control: 'silencio_3_min'
    },
    mensajeRenderizado: DEMOWAPP_PUSH_CATALOG[code].mensajeBase
  });
}

export async function cancelPendingSilencePushes(db: SupabaseClient, conversacionId: string) {
  // La restricción actual de la tabla no contempla un estado `cancelado`.
  // Eliminar únicamente recordatorios aún pendientes equivale a cancelarlos
  // y evita que un mensaje válido del estudiante interrumpa el turno de NaIA.
  const { error } = await db
    .from('comunicaciones_transaccionales')
    .delete()
    .eq('conversacion_id', conversacionId)
    .eq('canal', DEMOWAPP_CANAL)
    .eq('metadatos->>origen', 'demowapp_push')
    .in('plantilla', ['recordatorio_silencio_3_min', 'cierre_inactividad_5_min'])
    .eq('estado_envio', 'pendiente');

  if (error) {
    throw new Error(`No se pudieron cancelar pushes pendientes: ${error.message}`);
  }
}

async function appendPushMessage(
  db: SupabaseClient,
  input: {
    conversacionId: string;
    referenciaExterna: string;
    contenido: string;
    plantilla: string;
  }
) {
  const existing = await db
    .from('mensajes_conversacion')
    .select('id')
    .eq('conversacion_id', input.conversacionId)
    .eq('referencia_externa', input.referenciaExterna)
    .limit(1)
    .maybeSingle();

  if (existing.data) {
    return existing.data;
  }

  const { data, error } = await db
    .from('mensajes_conversacion')
    .insert({
      conversacion_id: input.conversacionId,
      remitente_tipo: 'naia',
      tipo_contenido: 'texto',
      contenido: input.contenido,
      referencia_externa: input.referenciaExterna,
      metadatos: {
        origen: 'push_automatico',
        plantilla: input.plantilla
      },
      enviado_en: nowIso()
    })
    .select('id')
    .single();

  if (error || !data) throw new Error(`No se pudo persistir mensaje push: ${error?.message || 'sin datos'}`);
  return data;
}

async function logPushSideEffects(
  db: SupabaseClient,
  input: {
    oportunidadId: string;
    personaId: string;
    referencia: string;
    plantilla: string;
    estado: 'enviado' | 'cancelado';
  }
) {
  const evento = `demowapp_push_${input.estado}`;
  const eventoExistente = await db
    .from('eventos_negocio')
    .select('creado_en')
    .eq('evento', evento)
    .eq('metadatos->>idempotency_key', input.referencia)
    .maybeSingle();

  if (!eventoExistente.data) {
    await db.from('eventos_negocio').insert({
      evento,
      metadatos: {
        idempotency_key: input.referencia,
        plantilla: input.plantilla,
        oportunidad_id: input.oportunidadId,
        persona_id: input.personaId,
        resumen_legible: `Mensaje automático ${input.estado}: ${input.plantilla.replaceAll('_', ' ')}`
      },
      generado_por: 'demowapp_push_processor',
      creado_en: nowIso()
    } as any);
  }
}

async function scheduleCloseAfterReminder(
  db: SupabaseClient,
  row: any,
  contenidoBase: string
) {
  const reminderKey = row?.metadatos?.idempotency_key;
  if (!reminderKey) throw new Error('Push de recordatorio sin clave de idempotencia');
  const idempotencyKey = `demowapp:cierre:${reminderKey}`;
  await schedulePush(db, {
    code: 'cierre_inactividad_5_min',
    oportunidadId: row.oportunidad_id,
    personaId: row.persona_id,
    conversacionId: row.conversacion_id,
    destinatario: row.destinatario || 'estudiante',
    fechaProgramada: plusSeconds(DEMOWAPP_TIMEOUTS.CLOSE_AFTER_REMINDER_SECONDS),
    idempotencyKey,
    metadatos: {
      disparado_por: row.id,
      recordatorio_base: reminderKey
    },
    mensajeRenderizado: contenidoBase
  });
}

async function deliverPushRow(db: SupabaseClient, row: any) {
  const contenido =
    row?.metadatos?.mensaje_renderizado || DEMOWAPP_PUSH_CATALOG[row.plantilla as DemoWappPushCode]?.mensajeBase;
  if (!contenido) return;

  await appendPushMessage(db, {
    conversacionId: row.conversacion_id,
    referenciaExterna: row?.metadatos?.idempotency_key,
    contenido,
    plantilla: row.plantilla
  });

  await db
    .from('comunicaciones_transaccionales')
    .update({ estado_envio: 'enviada', fecha_enviada: nowIso(), actualizado_en: nowIso() })
    .eq('id', row.id)
    .eq('estado_envio', 'pendiente');

  if (row.plantilla === 'recordatorio_silencio_3_min') {
    await scheduleCloseAfterReminder(db, row, DEMOWAPP_PUSH_CATALOG.cierre_inactividad_5_min.mensajeBase);
  }

  if (row.plantilla === 'cierre_inactividad_5_min') {
    await updateConversationContext(db, row.conversacion_id, {
      estado: CONVERSACION_ESTADO_CERRADA,
      cierreEn: nowIso(),
      contextoResumido: JSON.stringify({ motivo_cierre: 'inactividad_estudiante', cerrado_en: nowIso() })
    });
  }

  await logPushSideEffects(db, {
    oportunidadId: row.oportunidad_id,
    personaId: row.persona_id,
    referencia: row?.metadatos?.idempotency_key,
    plantilla: row.plantilla,
    estado: 'enviado'
  });
}

export async function processDuePushes(
  db: SupabaseClient,
  limit = 50,
  scope?: { oportunidadId?: string; conversacionId?: string }
) {
  let query = db
    .from('comunicaciones_transaccionales')
    .select('*')
    .eq('canal', DEMOWAPP_CANAL)
    .eq('metadatos->>origen', 'demowapp_push')
    .eq('estado_envio', 'pendiente')
    .lte('fecha_programada', nowIso());

  if (scope?.oportunidadId) query = query.eq('oportunidad_id', scope.oportunidadId);
  if (scope?.conversacionId) query = query.eq('conversacion_id', scope.conversacionId);

  const { data, error } = await query.order('fecha_programada', { ascending: true }).limit(limit);

  if (error) {
    throw new Error(`No se pudieron cargar pushes pendientes: ${error.message}`);
  }

  let processed = 0;
  const failed: string[] = [];

  for (const row of data || []) {
    try {
      await deliverPushRow(db, row);
      processed += 1;
    } catch (e: any) {
      failed.push(row.id);
      await db
        .from('comunicaciones_transaccionales')
        .update({
          estado_envio: 'fallida',
          error_envio: e?.message || 'error_desconocido',
          actualizado_en: nowIso()
        })
        .eq('id', row.id)
        .eq('estado_envio', 'pendiente');
    }
  }

  return {
    ok: true,
    procesadas: processed,
    fallidas: failed.length,
    ids_fallidas: failed
  };
}
