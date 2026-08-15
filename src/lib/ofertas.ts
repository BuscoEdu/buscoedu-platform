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

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function tokenize(value: string): string[] {
  const stopWords = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'con', 'para', 'por', 'una', 'un']);

  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !stopWords.has(t));
}

function extraerTokensDesdeFiltros(filtros: FiltrosOferta): string[] {
  const valores = [
    filtros.programa_o_area,
    filtros.modalidad,
    filtros.ciudad,
    filtros.pais,
    filtros.nivel_academico,
    filtros.tipo_beneficio,
    filtros.universidad
  ].filter(Boolean) as string[];

  return valores.flatMap(tokenize);
}

/**
 * Obtiene ofertas académicas con filtros opcionales.
 *
 * Nota técnica:
 * - Se consulta únicamente ofertas_academicas para evitar fallos por joins
 *   en tablas relacionadas que actualmente están vacías en el entorno.
 * - Los filtros se aplican en memoria sobre nombre/descripcion/beneficio.
 */
export async function obtenerOfertas(
  filtros: FiltrosOferta = {},
  limit: number = 40,
  offset: number = 0
): Promise<{ ofertas: OfertaAcademica[]; total: number }> {
  try {
    const hoy = todayISO();

    const { data, error } = await supabase
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
        `
      )
      .eq('activo', true)
      .lte('vigente_desde', hoy)
      .or(`vigente_hasta.is.null,vigente_hasta.gte.${hoy}`)
      .limit(1000);

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
                descripcion: item.descripcion_beneficio || undefined
              }
            ]
          : []
      };
    });

    const tokensFiltro = extraerTokensDesdeFiltros(filtros);

    const ofertasFiltradas =
      tokensFiltro.length === 0
        ? ofertas
        : ofertas.filter((oferta) => {
            const bolsaTexto = normalizeText(
              [
                oferta.nombre,
                oferta.descripcion,
                oferta.tipo_beneficio,
                ...(oferta.beneficios || []).map((b) => `${b.tipo} ${b.descripcion || ''}`)
              ]
                .filter(Boolean)
                .join(' ')
            );

            return tokensFiltro.every((token) => bolsaTexto.includes(token));
          });

    const total = ofertasFiltradas.length;
    const ofertasPaginadas = ofertasFiltradas.slice(offset, offset + limit);

    return {
      ofertas: ofertasPaginadas,
      total
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
    const { data, error } = await supabase.from('ofertas_academicas').select('id').limit(1);

    return !error && (data?.length || 0) > 0;
  } catch {
    return false;
  }
}
