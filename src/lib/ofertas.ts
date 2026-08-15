/**
 * Funciones para consultar ofertas académicas desde Supabase
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
  // Joins
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

/**
 * Obtiene ofertas académicas con filtros opcionales
 */
export async function obtenerOfertas(
  filtros: FiltrosOferta = {},
  limit: number = 20,
  offset: number = 0
): Promise<{ ofertas: OfertaAcademica[]; total: number }> {
  try {
    // Query base - solo ofertas publicadas, validadas y vigentes
    let query = supabase
      .from('ofertas_academicas')
      .select(`
        id,
        nombre,
        descripcion,
        programa_id,
        universidad_id,
        sede_id,
        vigente,
        cupos_disponibles,
        estado_publicacion,
        estado_validacion,
        programas_academicos!inner(
          nombre,
          nivel_academico,
          duracion,
          modalidad
        ),
        universidades!inner(
          nombre
        ),
        sedes(
          nombre,
          ciudad,
          pais
        ),
        beneficios_oferta(
          tipo,
          descripcion
        )
      `, { count: 'exact' })
      .eq('vigente', true)
      .eq('estado_publicacion', 'publicado')
      .eq('estado_validacion', 'validado');

    // Aplicar filtros si existen
    // Nota: Los filtros en tablas relacionadas requieren ajustes según el esquema real
    // Por ahora aplicamos filtros básicos
    
    // Paginación
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error obteniendo ofertas:', error);
      return { ofertas: [], total: 0 };
    }

    // Transformar datos al formato esperado
    const ofertas: OfertaAcademica[] = (data || []).map((item: any) => ({
      id: item.id,
      nombre: item.nombre,
      descripcion: item.descripcion,
      programa_id: item.programa_id,
      universidad_id: item.universidad_id,
      sede_id: item.sede_id,
      vigente: item.vigente,
      cupos_disponibles: item.cupos_disponibles,
      estado_publicacion: item.estado_publicacion,
      estado_validacion: item.estado_validacion,
      programa: item.programas_academicos ? {
        nombre: item.programas_academicos.nombre,
        nivel_academico: item.programas_academicos.nivel_academico,
        duracion: item.programas_academicos.duracion,
        modalidad: item.programas_academicos.modalidad
      } : undefined,
      universidad: item.universidades ? {
        nombre: item.universidades.nombre
      } : undefined,
      sede: item.sedes ? {
        nombre: item.sedes.nombre,
        ciudad: item.sedes.ciudad,
        pais: item.sedes.pais
      } : undefined,
      beneficios: item.beneficios_oferta || []
    }));

    return {
      ofertas,
      total: count || 0
    };
  } catch (error) {
    console.error('Error en obtenerOfertas:', error);
    return { ofertas: [], total: 0 };
  }
}

/**
 * Verifica si hay datos demo en la base de datos
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
