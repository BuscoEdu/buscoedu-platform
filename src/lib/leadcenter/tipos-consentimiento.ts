import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * BA-031 reusa el mismo catálogo que GET /api/leadcenter/consentimientos.
 * El orden y las columnas no cambian: la UI web y el hilo leen la misma lista,
 * sin casillas preseleccionadas.
 */
export const ORDEN_TIPOS_CONSENTIMIENTO = [
  'tratamiento_datos',
  'contacto',
  'contacto_whatsapp',
  'transferencia_universidad'
] as const;

export interface TipoConsentimiento {
  id: string;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  version?: string | null;
  texto_completo?: string | null;
  es_obligatorio?: boolean | null;
}

export async function listarTiposConsentimientoActivos(
  db: SupabaseClient
): Promise<TipoConsentimiento[]> {
  const { data, error } = await db
    .from('tipos_consentimiento')
    .select('id, codigo, nombre, descripcion, version, texto_completo, es_obligatorio')
    .eq('activo', true);

  if (error) {
    throw new Error(error.message);
  }

  const orden = ORDEN_TIPOS_CONSENTIMIENTO as readonly string[];
  return ((data || []) as TipoConsentimiento[]).sort(
    (a, b) => orden.indexOf(a.codigo) - orden.indexOf(b.codigo)
  );
}
