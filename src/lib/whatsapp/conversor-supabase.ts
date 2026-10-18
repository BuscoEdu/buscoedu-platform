/**
 * BA-032 · Conversión a lead desde WhatsApp.
 *
 * Solo se construye si WA_LEAD_CONVERSION_ENABLED === 'true'. Con el interruptor
 * apagado la ruta usa conversorBloqueado (nunca toca la base).
 *
 * Encendido: llama a fn_ba031_convertir_si_consentido (atómica: si falla, RAISE revierte)
 * y luego crea la conversación en Lead Center con canal = 'whatsapp' y su historial.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConversorLeadsWa } from './tipos';

// Bloque: conversor que nunca convierte (interruptor apagado o sin configuración).
export const conversorBloqueado: ConversorLeadsWa = {
  async convertir() {
    return { ok: false, codigo: 'conversion_deshabilitada' };
  }
};

export function crearConversorSupabase(db: SupabaseClient, log: (e: string, d?: Record<string, unknown>) => void): ConversorLeadsWa {
  return {
    async convertir(payload, contexto) {
      const { data, error } = await db.rpc('fn_ba031_convertir_si_consentido', { p_payload: payload });
      if (error) {
        const codigo = /ba031_sin_lead:([a-z_]+)/.exec(error.message || '')?.[1] || 'rpc_error';
        return { ok: false, codigo };
      }
      const r = (data || {}) as { ok?: boolean; error?: string; persona_id?: string; oportunidad_id?: string };
      if (!r.ok || !r.persona_id || !r.oportunidad_id) {
        return { ok: false, codigo: r.error || 'lead_no_creado' };
      }

      // Bloque: Lead Center. El lead ya existe completo; si este puente falla, queda registrado
      // en wa_intenciones (oportunidad_id) para reintentar, y no se deshace el lead.
      try {
        await vincularConversacionLeadCenter(db, {
          contactoId: contexto.contactoId,
          personaId: r.persona_id,
          oportunidadId: r.oportunidad_id
        });
      } catch (e) {
        log('wa_puente_leadcenter_fallido', { error: e instanceof Error ? e.message.slice(0, 200) : 'desconocido' });
      }
      return { ok: true, personaId: r.persona_id, oportunidadId: r.oportunidad_id };
    }
  };
}

/** Crea conversación canal='whatsapp' y copia el historial consentido de wa_mensajes. */
export async function vincularConversacionLeadCenter(
  db: SupabaseClient,
  input: { contactoId: string; personaId: string; oportunidadId: string }
) {
  const ahora = new Date().toISOString();
  const { data: conv, error } = await db
    .from('conversaciones')
    .insert({
      persona_id: input.personaId,
      oportunidad_id: input.oportunidadId,
      canal: 'whatsapp',
      tipo: 'mixta',
      estado: 'activa',
      ultimo_canal_usado: 'whatsapp',
      inicio_en: ahora,
      ultima_actividad_en: ahora,
      metadatos: { version: 'v1', canal_real: 'meta_cloud_api', wa_contacto_id: input.contactoId, origen: 'ba032' }
    })
    .select('id')
    .single();
  if (error || !conv) throw new Error(`conversacion: ${error?.message || 'sin datos'}`);

  await db.from('wa_contactos').update({ conversacion_id: conv.id, persona_id: input.personaId }).eq('id', input.contactoId);

  const { data: mensajes } = await db
    .from('wa_mensajes')
    .select('direccion, contenido, id_meta, creado_en')
    .eq('contacto_id', input.contactoId)
    .order('creado_en', { ascending: true })
    .limit(200);

  const filas = (mensajes || [])
    .filter((m: any) => typeof m.contenido === 'string' && m.contenido.trim())
    .map((m: any) => ({
      conversacion_id: conv.id,
      remitente_tipo: m.direccion === 'entrante' ? 'persona' : 'naia',
      remitente_id: null,
      tipo_contenido: 'texto',
      contenido: m.contenido,
      metadatos: { canal_real: 'meta_cloud_api' },
      referencia_externa: m.id_meta ? `wa:${m.id_meta}` : null,
      enviado_en: m.creado_en
    }));
  if (filas.length) {
    const { error: errMsg } = await db.from('mensajes_conversacion').insert(filas);
    if (errMsg) throw new Error(`mensajes_conversacion: ${errMsg.message}`);
  }
}
