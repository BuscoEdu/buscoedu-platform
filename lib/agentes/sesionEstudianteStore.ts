/**
 * BA-024 — Memoria de lo dicho en el hilo.
 *
 * Reusa `ejecuciones_agente_ia.respuesta` (jsonb ya existente). No crea tablas.
 * El chat web anónimo no tiene persona: un hecho en `hechos_extraidos_naia`
 * exigiría persona_id. Si la lectura falla, la sesión vuelve vacía (fail-closed):
 * no se inventan datos de un turno anterior.
 */

import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { sanearFiltros, sanearSesion, type SesionEstudiante } from './vozNaia';

export interface MemoriaSesion {
  sesion: SesionEstudiante;
  filtros: Record<string, string | null>;
}

const VACIA: MemoriaSesion = { sesion: {}, filtros: {} };

export async function cargarMemoriaSesion(conversationId?: string): Promise<MemoriaSesion> {
  const id = (conversationId || '').trim();
  if (!id) return VACIA;

  try {
    const db = getServiceRoleClient();
    const { data, error } = await db
      .from('ejecuciones_agente_ia')
      .select('respuesta')
      .eq('estado', 'exitoso')
      .contains('respuesta', { conversationId: id })
      .order('ejecutado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.respuesta || typeof data.respuesta !== 'object') return VACIA;

    const respuesta = data.respuesta as Record<string, unknown>;
    // Sin el bloque BA-024 no rehidratamos filtros viejos: podían venir del modelo sin ancla.
    if (!respuesta.sesion_estudiante) return VACIA;

    return {
      sesion: sanearSesion(respuesta.sesion_estudiante),
      filtros: sanearFiltros(respuesta.filtros)
    };
  } catch {
    return VACIA;
  }
}
