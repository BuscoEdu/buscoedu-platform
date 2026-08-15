/**
 * Funciones para consultar ofertas académicas desde Supabase
 * Adaptadas al esquema real de la tabla ofertas_academicas.
 */

import { supabase } from './supabase';

export interface OfertaAcademica {
  id: string;
  nombre: string;
  descripcion?: string;
  programa_id: string;
  universidad_id: string;
  sede_id?: string;
  vigente: boolean;
  cupos_disponibles?: number;
  estado_publicacion?: string;
  estado_validacion?: string;
  tipo_beneficio?: string;
  vigente_desde?: string;
  vigente_hasta?: string;
  // Joins opcionales (temporalmente no usados hasta alinear esquema/políticas)
  programa?: {
    nombre: string;
    nivel_academico?: string;
    duracion?: string;
    modalidad?: string;
  };
  universidad?: {
    nombre: string;
  };
  sede?: {
    nombre: string;
    ciudad?: string;
    pais?: string;
  };
  beneficios?: Array<{
    tipo: string;
    descripcion?: string;
  }>;
}

export interface FiltrosOferta {
  programa_o_area?: string;
  modalidad?: string;
  ciudad?: string;
  pais?: string;
  nivel_academico?: string;
  tipo_beneficio?: string;
  universidad?: string;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Obtiene ofertas académicas con filtros opcionales.
 *
 * Nota técnica:
 * - Se consulta únicamente ofertas_academicas para evitar errores por
 *   diferencias de columnas/políticas en tablas relacionadas.
 */
export async function obtenerOfertas(
  filtros: FiltrosOferta = {},
  limit: number = 20,
  offset: number = 0
): Promise<{ ofertas: OfertaAcademica[]; total: number }> {
  try {
    const hoy = todayISO();

    let query = supabase
      .from('ofertas_academicas')
      .select(
        `
          id,
          nombre_oferta,
          descripcion_comercial,
          programa_id,
          universidad_id,
          sede_id,
          activo,
          cupos_disponibles,
          estado_publicacion,
          estado_validacion,
          tipo_beneficio,
          descripcion_beneficio,
          vigente_desde,
          vigente_hasta
        `,
        { count: 'exact' }
      )
      .eq('activo', true)
      .lte('vigente_desde', hoy)
      .or(`vigente_hasta.is.null,vigente_hasta.gte.${hoy}`);

    // Filtros soportados directamente por columnas existentes
    if (filtros.programa_o_area) {
      query = query.or(
        `nombre_oferta.ilike.%${filtros.programa_o_area}%,descripcion_comercial.ilike.%${filtros.programa_o_area}%`
      );
    }

    if (filtros.tipo_beneficio) {
      query = query.ilike('tipo_beneficio', `%${filtros.tipo_beneficio}%`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error obteniendo ofertas:', error);
      return { ofertas: [], total: 0 };
    }

    const ofertas: OfertaAcademica[] = (data || []).map((item: any) => {
      const vigente =
        Boolean(item.activo) &&
        Boolean(item.vigente_desde) &&
        item.vigente_desde <= hoy &&
        (!item.vigente_hasta || item.vigente_hasta >= hoy);

      return {
        id: item.id,
        nombre: item.nombre_oferta,
        descripcion: item.descripcion_comercial,
        programa_id: item.programa_id,
        universidad_id: item.universidad_id,
        sede_id: item.sede_id,
        vigente,
        cupos_disponibles: item.cupos_disponibles,
        estado_publicacion: item.estado_publicacion,
        estado_validacion: item.estado_validacion,
        tipo_beneficio: item.tipo_beneficio,
        vigente_desde: item.vigente_desde,
        vigente_hasta: item.vigente_hasta,
        beneficios: item.tipo_beneficio
          ? [
              {
                tipo: String(item.tipo_beneficio).replaceAll('_', ' '),
                descripcion: item.descripcion_beneficio || undefined,
              },
            ]
          : [],
      };
    });

    return {
      ofertas,
      total: count || 0,
    };
  } catch (error) {
    console.error('Error en obtenerOfertas:', error);
    return { ofertas: [], total: 0 };
  }
}

/**
 * Verifica si hay datos de ofertas en la base de datos.
 */
export async function verificarDatosDemo(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('ofertas_academicas')
      .select('id')
      .limit(1);

    return !error && (data?.length || 0) > 0;
  } catch {
    return false;
  }
}
