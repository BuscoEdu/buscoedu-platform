import type { SupabaseClient } from '@supabase/supabase-js';

export const DEMOWAPP_CANAL = 'demo_wapp';
export const DEMOWAPP_TIPO = 'seguimiento_aplicacion';
export const CONVERSACION_ESTADO_ACTIVA = 'activa';
export const CONVERSACION_ESTADO_CERRADA = 'cerrada';

export interface DemoWappConversationRow {
  id: string;
  persona_id: string;
  oportunidad_id: string;
  estado: string;
  resumen?: string | null;
  contexto_resumido?: string | null;
  ultima_actividad_en?: string | null;
  actualizado_en?: string | null;
}

function nowIso() {
  return new Date().toISOString();
}

export async function getLatestConversationByOpportunity(
  db: SupabaseClient,
  oportunidadId: string
): Promise<DemoWappConversationRow | null> {
  const { data, error } = await db
    .from('conversaciones')
    .select('*')
    .eq('oportunidad_id', oportunidadId)
    .eq('canal', DEMOWAPP_CANAL)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo consultar conversación: ${error.message}`);
  }

  return (data as DemoWappConversationRow) || null;
}

export async function getOrCreateActiveConversation(
  db: SupabaseClient,
  input: {
    oportunidadId: string;
    personaId: string;
    reopenIfClosed?: boolean;
    tipoInicio?: 'aplicacion_exitosa' | 'estudiante_inbound' | 'operador_simulacion';
  }
): Promise<DemoWappConversationRow> {
  const found = await getLatestConversationByOpportunity(db, input.oportunidadId);

  if (found && found.estado === CONVERSACION_ESTADO_ACTIVA) {
    return found;
  }

  if (found && input.reopenIfClosed) {
    const { data, error } = await db
      .from('conversaciones')
      .update({
        estado: CONVERSACION_ESTADO_ACTIVA,
        cierre_en: null,
        ultima_actividad_en: nowIso(),
        actualizado_en: nowIso(),
        metadatos: {
          ...(found as any).metadatos,
          reabierta_en: nowIso(),
          canal_simulado: DEMOWAPP_CANAL,
          tipo_inicio: input.tipoInicio || 'estudiante_inbound'
        }
      })
      .eq('id', found.id)
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`No se pudo reabrir conversación: ${error?.message || 'sin datos'}`);
    }

    return data as DemoWappConversationRow;
  }

  const { data, error } = await db
    .from('conversaciones')
    .insert({
      persona_id: input.personaId,
      oportunidad_id: input.oportunidadId,
      canal: DEMOWAPP_CANAL,
      tipo: DEMOWAPP_TIPO,
      estado: CONVERSACION_ESTADO_ACTIVA,
      resumen: null,
      contexto_resumido: null,
      ultimo_canal_usado: DEMOWAPP_CANAL,
      inicio_en: nowIso(),
      ultima_actividad_en: nowIso(),
      metadatos: {
        version: 'v1',
        canal_simulado: DEMOWAPP_CANAL,
        tipo_inicio: input.tipoInicio || 'estudiante_inbound'
      }
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(`No se pudo crear conversación: ${error?.message || 'sin datos'}`);
  }

  return data as DemoWappConversationRow;
}

export async function updateConversationContext(
  db: SupabaseClient,
  conversacionId: string,
  patch: {
    resumen?: string | null;
    contextoResumido?: string | null;
    estado?: string;
    cierreEn?: string | null;
  }
) {
  const payload: Record<string, unknown> = {
    ultima_actividad_en: nowIso(),
    ultimo_canal_usado: DEMOWAPP_CANAL,
    actualizado_en: nowIso()
  };

  if (patch.resumen !== undefined) payload.resumen = patch.resumen;
  if (patch.contextoResumido !== undefined) payload.contexto_resumido = patch.contextoResumido;
  if (patch.estado !== undefined) payload.estado = patch.estado;
  if (patch.cierreEn !== undefined) payload.cierre_en = patch.cierreEn;

  const { error } = await db.from('conversaciones').update(payload).eq('id', conversacionId);
  if (error) {
    throw new Error(`No se pudo actualizar conversación: ${error.message}`);
  }
}
