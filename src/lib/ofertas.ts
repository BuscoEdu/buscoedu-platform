/**
 * Funciones para consultar ofertas académicas desde Supabase.
 *
 * Estrategia de filtrado (robusta con PostgREST):
 * - Los filtros que dependen de tablas relacionadas (programa, área de
 *   conocimiento, nivel, modalidad, ciudad, país, universidad) se resuelven
 *   primero a listas de IDs mediante consultas auxiliares. La consulta
 *   principal filtra únicamente sobre columnas propias de `ofertas_academicas`
 *   (ids + texto + estado), lo que evita problemas de OR entre tablas y hace
 *   que el conteo total (count: 'exact') y la paginación (.range()) sean exactos.
 * - Se embeben (LEFT JOIN) los datos relacionados solo para mostrarlos en las
 *   tarjetas; el filtrado no depende de esos embeds.
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
  programa?: {
    nombre: string;
    nivel_academico?: string;
    duracion?: string;
    modalidad?: string;
    area?: string;
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

export interface ResultadoOfertas {
  ofertas: OfertaAcademica[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

const PAGE_SIZE_DEFAULT = 20;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Escapa caracteres especiales de PostgREST en patrones ILIKE. */
function likePattern(value: string): string {
  const clean = value.trim().replace(/[%,()]/g, ' ').replace(/\s+/g, ' ').trim();
  return `%${clean}%`;
}

/**
 * Mapa de etiquetas de beneficio (UI) a patrón ILIKE sobre la columna
 * `tipo_beneficio` (texto) de ofertas_academicas, cuyos valores en BD usan
 * códigos como `beca_postulacion`, `descuento`, `financiacion`, etc.
 */
function patronTipoBeneficio(valor: string): string {
  const v = valor.trim().toLowerCase();
  if (v.startsWith('beca')) return '%beca%';
  if (v.startsWith('descuento')) return '%descuento%';
  if (v.startsWith('financ')) return '%financ%';
  if (v.startsWith('convenio')) return '%convenio%';
  if (v.startsWith('otro')) return '%otro%';
  return `%${v}%`;
}

/**
 * Expande sinónimos y agrupaciones comunes para mejorar coincidencias.
 * Devuelve una lista de términos alternativos a buscar (el original + expansiones).
 */
function expandirSinonimos(termino: string, contexto: 'nivel' | 'area'): string[] {
  const t = termino.trim().toLowerCase();
  
  if (contexto === 'nivel') {
    // "Posgrado" no es un nivel en la BD, es un grupo conceptual.
    if (t.includes('posgrado') || t.includes('postgrado')) {
      return ['Especialización', 'Maestría', 'Doctorado'];
    }
  }

  if (contexto === 'area') {
    // Sinónimos comunes para áreas de conocimiento.
    if (t.includes('empresa') || t.includes('negocio')) {
      return ['Administración', 'Negocios', 'Empresariales', 'Gestión', termino];
    }
    if (t.includes('salud') || t.includes('medicina')) {
      return ['Salud', 'Medicina', 'Ciencias de la Salud', termino];
    }
    if (t.includes('ingenier')) {
      return ['Ingeniería', termino];
    }
    if (t.includes('derecho') || t.includes('leyes')) {
      return ['Derecho', 'Ciencias Jurídicas', termino];
    }
  }

  return [termino];
}

/** Devuelve IDs de una tabla catálogo cuyo `nombre` coincide (ILIKE). */
async function idsPorNombre(tabla: string, termino: string): Promise<string[]> {
  const { data, error } = await supabase
    .from(tabla)
    .select('id')
    .ilike('nombre', likePattern(termino));

  if (error) {
    console.error(`Error resolviendo IDs de ${tabla}:`, error);
    return [];
  }
  return (data || []).map((row: any) => row.id);
}

/**
 * Resuelve los IDs de programas que satisfacen el término de programa/área.
 * Coincide si: nombre_oficial ILIKE término OR area_conocimiento_id ∈ áreas
 * cuyo nombre coincide con el término (expandiendo sinónimos comunes).
 */
async function resolverProgramasPorTexto(termino: string): Promise<string[]> {
  // Expandir sinónimos para áreas (ej: "empresas" → "Administración", "Negocios", etc.)
  const terminosArea = expandirSinonimos(termino, 'area');
  
  // Buscar IDs de áreas que coincidan con cualquiera de los términos expandidos.
  const areaIdsPromises = terminosArea.map(t => idsPorNombre('areas_conocimiento', t));
  const areaIdsArrays = await Promise.all(areaIdsPromises);
  const areaIds = [...new Set(areaIdsArrays.flat())]; // Deduplica

  const condiciones = [`nombre_oficial.ilike.${likePattern(termino)}`];
  if (areaIds.length > 0) {
    condiciones.push(`area_conocimiento_id.in.(${areaIds.join(',')})`);
  }

  const { data, error } = await supabase
    .from('programas_academicos')
    .select('id')
    .or(condiciones.join(','));

  if (error) {
    console.error('Error resolviendo programas por texto:', error);
    return [];
  }
  return (data || []).map((row: any) => row.id);
}

/**
 * Resuelve IDs de programas que cumplen restricciones duras (nivel y/o
 * modalidad). Devuelve `null` cuando no hay ninguna de esas restricciones
 * activas (no se debe filtrar por programa en ese caso).
 * 
 * Expande "posgrado" a Especialización + Maestría + Doctorado.
 */
async function resolverProgramasPorNivelModalidad(
  filtros: FiltrosOferta
): Promise<string[] | null> {
  if (!filtros.nivel_academico && !filtros.modalidad) return null;

  let query = supabase.from('programas_academicos').select('id');

  if (filtros.nivel_academico) {
    // Expandir sinónimos para niveles (ej: "posgrado" → Especialización + Maestría + Doctorado)
    const terminosNivel = expandirSinonimos(filtros.nivel_academico, 'nivel');
    
    // Buscar IDs de niveles que coincidan con cualquiera de los términos expandidos.
    const nivelIdsPromises = terminosNivel.map(t => idsPorNombre('niveles_academicos', t));
    const nivelIdsArrays = await Promise.all(nivelIdsPromises);
    const nivelIds = [...new Set(nivelIdsArrays.flat())]; // Deduplica
    
    if (nivelIds.length === 0) return [];
    query = query.in('nivel_academico_id', nivelIds);
  }

  if (filtros.modalidad) {
    const modalidadIds = await idsPorNombre('modalidades', filtros.modalidad);
    if (modalidadIds.length === 0) return [];
    query = query.in('modalidad_id', modalidadIds);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error resolviendo programas por nivel/modalidad:', error);
    return [];
  }
  return (data || []).map((row: any) => row.id);
}

/** Resuelve IDs de sedes según ciudad y/o país. `null` si no aplica. */
async function resolverSedes(filtros: FiltrosOferta): Promise<string[] | null> {
  if (!filtros.ciudad && !filtros.pais) return null;

  let query = supabase.from('sedes').select('id');

  if (filtros.ciudad) {
    const ciudadIds = await idsPorNombre('ciudades', filtros.ciudad);
    if (ciudadIds.length === 0) return [];
    query = query.in('ciudad_id', ciudadIds);
  }

  if (filtros.pais) {
    const paisIds = await idsPorNombre('paises', filtros.pais);
    if (paisIds.length === 0) return [];
    query = query.in('pais_id', paisIds);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error resolviendo sedes:', error);
    return [];
  }
  return (data || []).map((row: any) => row.id);
}

/** Resuelve IDs de universidades por nombre oficial. `null` si no aplica. */
async function resolverUniversidades(filtros: FiltrosOferta): Promise<string[] | null> {
  if (!filtros.universidad) return null;

  const { data, error } = await supabase
    .from('universidades')
    .select('id')
    .ilike('nombre_oficial', likePattern(filtros.universidad));

  if (error) {
    console.error('Error resolviendo universidades:', error);
    return [];
  }
  return (data || []).map((row: any) => row.id);
}

const SELECT_OFERTAS = `
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
  vigente_hasta,
  programa:programas_academicos(
    nombre_oficial,
    duracion_valor,
    duracion_unidad,
    nivel:niveles_academicos(nombre),
    modalidad:modalidades(nombre),
    area:areas_conocimiento(nombre)
  ),
  universidad:universidades(nombre_oficial),
  sede:sedes(
    nombre,
    ciudad:ciudades(nombre),
    pais:paises(nombre)
  )
`;

function mapearOferta(item: any, hoy: string): OfertaAcademica {
  const vigente =
    Boolean(item.activo) &&
    Boolean(item.vigente_desde) &&
    item.vigente_desde <= hoy &&
    (!item.vigente_hasta || item.vigente_hasta >= hoy);

  const duracion =
    item.programa?.duracion_valor != null
      ? [item.programa.duracion_valor, item.programa.duracion_unidad]
          .filter(Boolean)
          .join(' ')
      : undefined;

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
    programa: item.programa
      ? {
          nombre: item.programa.nombre_oficial,
          nivel_academico: item.programa.nivel?.nombre,
          modalidad: item.programa.modalidad?.nombre,
          area: item.programa.area?.nombre,
          duracion
        }
      : undefined,
    universidad: item.universidad
      ? { nombre: item.universidad.nombre_oficial }
      : undefined,
    sede: item.sede
      ? {
          nombre: item.sede.nombre,
          ciudad: item.sede.ciudad?.nombre,
          pais: item.sede.pais?.nombre
        }
      : undefined,
    beneficios: item.tipo_beneficio
      ? [
          {
            tipo: String(item.tipo_beneficio).replaceAll('_', ' '),
            descripcion: item.descripcion_beneficio || undefined
          }
        ]
      : []
  };
}

/**
 * Obtiene ofertas académicas publicadas con filtros opcionales y paginación.
 *
 * @param filtros  Criterios de búsqueda.
 * @param page     Página solicitada (base 0).
 * @param pageSize Tamaño de página (por defecto 20).
 */
export async function obtenerOfertas(
  filtros: FiltrosOferta = {},
  page: number = 0,
  pageSize: number = PAGE_SIZE_DEFAULT
): Promise<ResultadoOfertas> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 0;
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : PAGE_SIZE_DEFAULT;

  try {
    const hoy = todayISO();

    // 1) Resolver restricciones relacionales a listas de IDs.
    const [programasNivelMod, sedeIds, universidadIds] = await Promise.all([
      resolverProgramasPorNivelModalidad(filtros),
      resolverSedes(filtros),
      resolverUniversidades(filtros)
    ]);

    const terminoPrograma = filtros.programa_o_area?.trim();
    const programasTexto = terminoPrograma
      ? await resolverProgramasPorTexto(terminoPrograma)
      : null;

    // 2) Construir la consulta principal solo sobre columnas de ofertas.
    const from = safePage * safeSize;
    const to = from + safeSize - 1;

    let query = supabase
      .from('ofertas_academicas')
      .select(SELECT_OFERTAS, { count: 'exact' })
      .eq('activo', true)
      .eq('estado_publicacion', 'publicado')
      .lte('vigente_desde', hoy)
      .or(`vigente_hasta.is.null,vigente_hasta.gte.${hoy}`);

    // Filtro programa/área: nombre_oferta ILIKE término OR programa ∈ coincidencias.
    if (terminoPrograma) {
      const condiciones = [`nombre_oferta.ilike.${likePattern(terminoPrograma)}`];
      if (programasTexto && programasTexto.length > 0) {
        condiciones.push(`programa_id.in.(${programasTexto.join(',')})`);
      }
      query = query.or(condiciones.join(','));
    }

    // Restricciones duras por nivel/modalidad (AND).
    if (programasNivelMod !== null) {
      query = query.in('programa_id', programasNivelMod);
    }

    // Ubicación (ciudad/país) mediante sedes.
    if (sedeIds !== null) {
      query = query.in('sede_id', sedeIds);
    }

    // Universidad.
    if (universidadIds !== null) {
      query = query.in('universidad_id', universidadIds);
    }

    // Tipo de beneficio (columna de texto en ofertas_academicas).
    if (filtros.tipo_beneficio) {
      query = query.ilike('tipo_beneficio', patronTipoBeneficio(filtros.tipo_beneficio));
    }

    query = query
      .order('creado_en', { ascending: false })
      .range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('Error obteniendo ofertas:', error);
      return { ofertas: [], total: 0, page: safePage, pageSize: safeSize, hasMore: false };
    }

    const ofertas: OfertaAcademica[] = (data || []).map((item: any) => mapearOferta(item, hoy));
    const total = count ?? ofertas.length;
    const hasMore = from + ofertas.length < total;

    return { ofertas, total, page: safePage, pageSize: safeSize, hasMore };
  } catch (error) {
    console.error('Error en obtenerOfertas:', error);
    return { ofertas: [], total: 0, page: safePage, pageSize: safeSize, hasMore: false };
  }
}

/**
 * Obtiene ofertas académicas por una lista de IDs (para "Mi Lista").
 *
 * Devuelve las ofertas en el mismo orden en que se pasaron los IDs. Solo
 * considera ofertas activas (no filtra por vigencia para no ocultar algo que
 * el usuario ya guardó, pero sí exige que sigan publicadas).
 */
export async function obtenerOfertasPorIds(ids: string[]): Promise<OfertaAcademica[]> {
  if (!ids || ids.length === 0) return [];

  try {
    const hoy = todayISO();
    const { data, error } = await supabase
      .from('ofertas_academicas')
      .select(SELECT_OFERTAS)
      .in('id', ids);

    if (error) {
      console.error('Error obteniendo ofertas por IDs:', error);
      return [];
    }

    const ofertas = (data || []).map((item: any) => mapearOferta(item, hoy));

    // Reordenar según el orden en que el usuario las guardó.
    const orden = new Map(ids.map((id, index) => [id, index]));
    ofertas.sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0));

    return ofertas;
  } catch (error) {
    console.error('Error en obtenerOfertasPorIds:', error);
    return [];
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
