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
import { resolverIdsAliadas } from './aliadas';
import { ORDEN_ESTABLE_OFERTAS, hayMasPaginas, rangoPagina } from './paginacion-ofertas';
import { precioParaEstudiante, TEXTO_PRECIO_NO_DISPONIBLE } from './precios-publicos';
import type { PrecioOfertaFila, PrecioParaEstudiante } from './precios-publicos';

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
    /** WA-fix-1 (S14): código SNIES del programa (`programas_academicos.codigo_snies`). */
    codigo_snies?: string;
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
  /** WA-fix-1: precio mostrable (puerta precios-publicos) o T17. Nunca trae un monto pendiente. */
  precio?: PrecioParaEstudiante;
  /** WA-fix-1: texto listo para la ficha: «Precio: $monto COP por semestre» (sin periodo si no está mapeado) o T17. */
  texto_precio?: string;
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

/** WA-fix-1 (S5): opciones fuera de FiltrosOferta (FE usa keyof FiltrosOferta como texto). */
export interface OpcionesBusquedaOfertas {
  /** Términos que deben cumplirse TODOS (AND) en el programa. */
  terminosTodos?: string[];
}

/**
 * Contrato discriminado (BA-005): el FE distingue éxito de fallo real.
 * En error NO se simula "0 resultados" — eso ocultaba fallos de BD/red.
 */
export type ResultadoOfertas =
  | {
      ok: true;
      ofertas: OfertaAcademica[];
      total: number;
      page: number;
      pageSize: number;
      hasMore: boolean;
      /** WA-fix-1: la RPC de BD no encontró por nombre y devolvió el respaldo por área. */
      fue_respaldo_area?: boolean;
    }
  | {
      ok: false;
      error: { code: string; message: string };
      ofertas: [];
      total: 0;
      page: number;
      pageSize: number;
      hasMore: false;
    };

export type ResultadoOfertasPorIds =
  | { ok: true; ofertas: OfertaAcademica[] }
  | { ok: false; error: { code: string; message: string }; ofertas: [] };

const PAGE_SIZE_DEFAULT = 20;

const STOPWORDS_BUSQUEDA = new Set([
  'quiero',
  'buscar',
  'busco',
  'estudiar',
  'en',
  'de',
  'la',
  'el',
  'los',
  'las',
  'con',
  'para',
  'por',
  'que',
  'una',
  'un',
  'del',
  'al'
]);

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizarTermino(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function likePattern(value: string): string {
  const clean = value.trim().replace(/[%,()]/g, ' ').replace(/\s+/g, ' ').trim();
  return `%${clean}%`;
}

/**
 * Bloque: error de un resolver previo (C-13 · error ≠ vacío).
 * Qué: registra solo el código (sin el objeto completo, que puede traer valores de la consulta) y lanza.
 * Por qué: antes devolvía [] y un fallo de BD se mostraba como «0 resultados»; ahora obtenerOfertas
 * lo captura y responde ok:false (el bot muestra T13 y Explorar su estado de error).
 */
function resolverFallo(paso: string, error: unknown): never {
  console.error(JSON.stringify({ origen: 'ofertas', evento: 'resolver_error', paso, codigo: (error as { code?: string })?.code ?? null }));
  throw new Error(`ofertas_resolver_${paso}`);
}

function construirTerminosBusqueda(entrada: string): string[] {
  const raw = entrada.trim();
  const normalizado = normalizarTermino(raw);

  const tokens = normalizado
    .split(/[^a-z0-9]+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 3 && !STOPWORDS_BUSQUEDA.has(x));

  const terminos = new Set<string>([raw]);

  for (const token of tokens) {
    terminos.add(token);
  }

  for (let i = 0; i < tokens.length - 1; i++) {
    const bigrama = `${tokens[i]} ${tokens[i + 1]}`;
    if (bigrama.length >= 7) terminos.add(bigrama);
  }

  return [...terminos].slice(0, 8);
}

function patronTipoBeneficio(valor: string): string {
  const v = valor.trim().toLowerCase();
  if (v.startsWith('beca')) return '%beca%';
  if (v.startsWith('descuento')) return '%descuento%';
  if (v.startsWith('financ')) return '%financ%';
  if (v.startsWith('convenio')) return '%convenio%';
  if (v.startsWith('otro')) return '%otro%';
  return `%${v}%`;
}

function expandirSinonimos(termino: string, contexto: 'nivel' | 'area'): string[] {
  const t = normalizarTermino(termino);

  if (contexto === 'nivel') {
    if (t.includes('posgrado') || t.includes('postgrado')) {
      return ['Especialización', 'Especializacion', 'Maestría', 'Maestria', 'Doctorado'];
    }
    return [termino];
  }

  const sin: string[] = [termino];

  if (t.includes('empresa') || t.includes('negocio') || t.includes('administr')) {
    sin.push('Administración', 'Administracion', 'Negocios', 'Empresariales', 'Gestión', 'Gestion');
  }
  if (t.includes('salud') || t.includes('medicina') || t.includes('medico')) {
    sin.push('Salud', 'Medicina', 'Ciencias de la Salud');
  }
  if (t.includes('ingenier') || t.includes('ingeniero')) {
    sin.push('Ingeniería', 'Ingenieria', 'Tecnología', 'Tecnologia');
  }
  if (t.includes('derecho') || t.includes('leyes') || t.includes('juridic')) {
    sin.push('Derecho', 'Ciencias Jurídicas', 'Ciencias Juridicas', 'Leyes');
  }
  if (t.includes('comunic')) {
    sin.push('Comunicación', 'Comunicacion', 'Periodismo');
  }

  return [...new Set(sin)];
}

async function idsPorNombre(tabla: string, termino: string): Promise<string[]> {
  const variantes = [...new Set([termino, normalizarTermino(termino)])].filter(Boolean);
  const condiciones = variantes.map((v) => `nombre.ilike.${likePattern(v)}`);

  const { data, error } = await supabase
    .from(tabla)
    .select('id')
    .or(condiciones.join(','));

  if (error) {
    resolverFallo(`ids_${tabla}`, error);
  }
  return (data || []).map((row: any) => row.id);
}

// Bloque: S6 · áreas que coinciden con el texto (lista corta de ids, no ~755 programas).
async function resolverAreasPorTexto(termino: string): Promise<string[]> {
  const terminosArea = [...new Set(construirTerminosBusqueda(termino).flatMap((t) => expandirSinonimos(t, 'area')))];
  const arrays = await Promise.all(terminosArea.map((t) => idsPorNombre('areas_conocimiento', t)));
  return [...new Set(arrays.flat())];
}

// Bloque: niveles y modalidades a ids (tablas pequeñas). `null` = sin filtro; `[]` = filtro sin coincidencias.
async function resolverNivelModalidad(
  filtros: FiltrosOferta
): Promise<{ nivelIds: string[] | null; modalidadIds: string[] | null }> {
  let nivelIds: string[] | null = null;
  let modalidadIds: string[] | null = null;
  if (filtros.nivel_academico) {
    const terminosNivel = expandirSinonimos(filtros.nivel_academico, 'nivel');
    const arrays = await Promise.all(terminosNivel.map((t) => idsPorNombre('niveles_academicos', t)));
    nivelIds = [...new Set(arrays.flat())];
  }
  if (filtros.modalidad) modalidadIds = await idsPorNombre('modalidades', filtros.modalidad);
  return { nivelIds, modalidadIds };
}

// Bloque: ciudades y países a ids (tablas pequeñas). La ciudad NO aplica a la modalidad virtual (S6).
async function resolverUbicacion(
  filtros: FiltrosOferta
): Promise<{ ciudadIds: string[] | null; paisIds: string[] | null }> {
  const ciudadIds = ciudadAplica(filtros) ? await idsPorNombre('ciudades', filtros.ciudad!) : null;
  const paisIds = filtros.pais ? await idsPorNombre('paises', filtros.pais) : null;
  return { ciudadIds, paisIds };
}

/** S6 · ¿la modalidad pedida es virtual (online, a distancia)? */
export function esModalidadVirtual(modalidad?: string | null): boolean {
  // Decisión final: SOLO «virtual» ignora la ciudad; «a distancia», «dual» e «híbrida» sí filtran (igual que la RPC de BD).
  return /\b(virtual|online|en linea)\b/.test(normalizarTermino(modalidad || ''));
}

/** S6 · la ciudad filtra presencial e híbrida; con modalidad virtual se ignora (se estudia desde cualquier ciudad). */
export function ciudadAplica(filtros: FiltrosOferta): boolean {
  return Boolean(filtros.ciudad?.trim()) && !esModalidadVirtual(filtros.modalidad);
}

// Bloque: variantes con y sin tilde de un término (S5). ilike distingue tildes; sin `unaccent` en BD
// (dependencia BD) se envían las dos formas para cubrir «Psicología» y «Psicologia».
function variantesTilde(t: string): string[] {
  return [...new Set([t.trim(), normalizarTermino(t)])].filter(Boolean);
}

/**
 * S6 · condiciones de texto sobre el programa embebido (`programa!inner`), sin listas largas de ids.
 * Antes: `programa_id.in.(~755 ids)` → URL demasiado larga (HTTP 400). Ahora el filtro viaja como
 * `programa.or=(nombre_oficial.ilike…,area_conocimiento_id.in.(pocas áreas))`.
 * GANCHO RPC BD: si BD publica una RPC de búsqueda (p. ej. con `unaccent`), reemplazar este armado
 * por `supabase.rpc(...)` aquí; el resto de obtenerOfertas no cambia.
 */
export function condicionesProgramaTexto(termino: string, areaIds: string[], terminosTodos?: string[]): string {
  const grupo = (t: string) =>
    variantesTilde(t).flatMap((v) => {
      const p = likePattern(v);
      return [`nombre_oficial.ilike.${p}`, `nombre_corto.ilike.${p}`, `titulo_otorgado.ilike.${p}`];
    });
  // S5 · AND entre los términos reconocidos: cada término es un or(...) y todos deben cumplirse.
  if (terminosTodos && terminosTodos.length >= 2) {
    return `and(${terminosTodos.map((t) => `or(${grupo(t).join(',')})`).join(',')})`;
  }
  const condiciones = construirTerminosBusqueda(termino).flatMap(grupo);
  if (areaIds.length > 0) condiciones.push(`area_conocimiento_id.in.(${areaIds.join(',')})`);
  return [...new Set(condiciones)].join(',');
}

async function resolverUniversidades(filtros: FiltrosOferta): Promise<string[] | null> {
  if (!filtros.universidad) return null;

  const terminos = construirTerminosBusqueda(filtros.universidad);
  const condiciones: string[] = [];
  for (const t of terminos) {
    const p = likePattern(t);
    condiciones.push(`nombre_oficial.ilike.${p}`);
    condiciones.push(`nombre_corto.ilike.${p}`);
    condiciones.push(`sigla.ilike.${p}`);
  }

  const { data, error } = await supabase
    .from('universidades')
    .select('id')
    .or(condiciones.join(','));

  if (error) {
    resolverFallo('universidades', error);
  }
  return (data || []).map((row: any) => row.id);
}

// Bloque: S6 · select con `!inner` solo cuando se filtra por el programa o la sede embebidos.
export function selectOfertas(opciones: { programaInner?: boolean; sedeInner?: boolean } = {}): string {
  return SELECT_OFERTAS.replace('programas_academicos(', opciones.programaInner ? 'programas_academicos!inner(' : 'programas_academicos(')
    .replace('sedes(', opciones.sedeInner ? 'sedes!inner(' : 'sedes(');
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
    codigo_snies,
    nivel_academico_id,
    modalidad_id,
    area_conocimiento_id,
    duracion_valor,
    duracion_unidad,
    nivel:niveles_academicos(nombre),
    modalidad:modalidades(nombre),
    area:areas_conocimiento(nombre)
  ),
  universidad:universidades(nombre_oficial),
  sede:sedes(
    nombre,
    ciudad_id,
    pais_id,
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
          // S14 · SNIES tal cual viene de BD; vacío → undefined («por confirmar» en el bot).
          codigo_snies: String(item.programa.codigo_snies ?? '').trim() || undefined,
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
 * Bloque: precios (diagnóstico WA-fix-1). Causa de «0 montos» en Explorar/ficha: ningún lector del
 * portal consultaba `precios_oferta` (SELECT_OFERTAS no lo embebía) y la ficha no lo pintaba.
 * Qué: consulta aparte por los ids de la página (≤100, URL corta) y pasa cada fila por la puerta
 * precios-publicos (MARCA:/no validado/sin periodicidad/no vigente → T17). Aparte y no embebido para
 * que un fallo de RLS o de permisos de columna en precios no tumbe la búsqueda: si falla, T17.
 */
// Bloque: etiquetas legibles de periodicidad (única fuente, formato final Orq + Producto).
export const ETIQUETAS_PERIODICIDAD: Record<string, string> = {
  semestral: 'por semestre',
  anual: 'por año',
  mensual: 'por mes',
  trimestral: 'por trimestre',
  cuatrimestral: 'por cuatrimestre'
};

// Bloque: monto con punto de miles y sin decimales («4316000.00» → «4.316.000»), independiente del locale.
function formatearMonto(valor: number): string {
  return String(Math.round(valor)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Bloque: solo la parte antes de «/» y solo si está en el mapa; enums crudos no se muestran.
export function etiquetaPeriodicidad(periodicidad: string): string | null {
  const clave = normalizarTermino(periodicidad.split('/')[0] || '');
  return ETIQUETAS_PERIODICIDAD[clave] ?? null;
}

export function textoPrecio(precio: PrecioParaEstudiante): string {
  if (precio.visible === false) return precio.texto;
  const base = `Precio: $${formatearMonto(precio.valor)} ${precio.moneda}`;
  const periodo = etiquetaPeriodicidad(precio.periodicidad);
  return periodo ? `${base} ${periodo}` : base;
}

export function elegirPrecio(filas: PrecioOfertaFila[], hoy: string): PrecioParaEstudiante {
  for (const fila of filas) {
    const p = precioParaEstudiante(fila, hoy);
    if (p.visible) return p;
  }
  return { visible: false, texto: TEXTO_PRECIO_NO_DISPONIBLE };
}

async function adjuntarPrecios(ofertas: OfertaAcademica[], hoy: string): Promise<OfertaAcademica[]> {
  if (ofertas.length === 0) return ofertas;
  const porOferta = new Map<string, PrecioOfertaFila[]>();
  try {
    const { data, error, status } = await supabase
      .from('precios_oferta')
      .select('oferta_id,valor,moneda,periodicidad,concepto_cobro,descripcion_condiciones,estado_validacion,es_precio_activo,vigente_desde,vigente_hasta')
      .in('oferta_id', ofertas.map((o) => o.id));
    if (error) {
      console.error(JSON.stringify({ origen: 'ofertas', evento: 'precios_query_failed', codigo: (error as { code?: string })?.code ?? null, status: status ?? null }));
    }
    for (const fila of (data || []) as Array<PrecioOfertaFila & { oferta_id: string }>) {
      porOferta.set(fila.oferta_id, [...(porOferta.get(fila.oferta_id) || []), fila]);
    }
  } catch (error) {
    console.error(JSON.stringify({ origen: 'ofertas', evento: 'precios_unexpected', error: error instanceof Error ? error.name : 'desconocido' }));
  }
  return ofertas.map((o) => {
    const precio = elegirPrecio(porOferta.get(o.id) || [], hoy);
    return { ...o, precio, texto_precio: textoPrecio(precio) };
  });
}

// Bloque: la RPC no cubre universidad, país ni tipo de beneficio: esos filtros siguen por PostgREST.
// Solo S5/S6 (texto o ciudad); Explorar sin texto ni ciudad sigue por PostgREST como antes.
function puedeUsarRpc(filtros: FiltrosOferta): boolean {
  const aplica = Boolean(filtros.programa_o_area?.trim() || filtros.ciudad?.trim());
  return aplica && !filtros.universidad && !filtros.pais && !filtros.tipo_beneficio;
}

/** Límite máximo que acepta la RPC de BD (p_limit ≤ 200). */
export const LIMITE_RPC_OFERTAS = 200;

// Bloque: ¿el error es «la función no existe»? (PostgREST PGRST202 / Postgres 42883) → fallback PostgREST.
export function esRpcAusente(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

/** Argumentos de la RPC a partir de los filtros (puro, para tests). */
export function argumentosRpc(
  filtros: FiltrosOferta,
  opciones: OpcionesBusquedaOfertas,
  ciudadId: string | null,
  limite: number,
  offset: number
): Record<string, unknown> {
  const texto = opciones.terminosTodos?.length ? opciones.terminosTodos.join(' ') : filtros.programa_o_area?.trim() || null;
  return {
    p_texto: texto,
    p_modalidad: filtros.modalidad?.trim() || null,
    p_ciudad_id: ciudadId,
    p_nivel: filtros.nivel_academico?.trim() || null,
    p_area_id: null,
    p_limit: Math.min(Math.max(limite, 0), LIMITE_RPC_OFERTAS),
    p_offset: Math.max(offset, 0)
  };
}

/**
 * Bloque: búsqueda por RPC. Devuelve null SOLO si la RPC no existe (fail-closed con log `rpc_ausente`).
 * Offset más allá del total = 0 filas sin total_count → total 0, sin error (el canal muestra «fin de lista»).
 */
async function buscarPorRpc(
  filtros: FiltrosOferta,
  opciones: OpcionesBusquedaOfertas,
  page: number,
  pageSize: number
): Promise<ResultadoOfertas | null> {
  const vacio = (): ResultadoOfertas => ({ ok: true, ofertas: [], total: 0, page, pageSize, hasMore: false });
  let ciudadId: string | null = null;
  if (filtros.ciudad?.trim()) {
    const ids = await idsPorNombre('ciudades', filtros.ciudad);
    if (ids.length === 0) return vacio();
    ciudadId = ids[0];
  }
  const limite = Math.min(pageSize, LIMITE_RPC_OFERTAS);
  const { desde } = rangoPagina(page, limite);
  const { data, error, status } = await supabase.rpc('buscar_ofertas_publicas', argumentosRpc(filtros, opciones, ciudadId, limite, desde));
  if (error) {
    if (esRpcAusente(error)) {
      console.error(JSON.stringify({ origen: 'ofertas', evento: 'rpc_ausente', codigo: error.code ?? null, status: status ?? null }));
      return null;
    }
    console.error(JSON.stringify({ origen: 'ofertas', evento: 'ofertas_rpc_failed', codigo: error.code ?? null, status: status ?? null, mensaje: String(error.message || '').slice(0, 160) }));
    return { ok: false, error: { code: 'ofertas_query_failed', message: 'No se pudieron consultar las ofertas académicas.' }, ofertas: [], total: 0, page, pageSize, hasMore: false };
  }
  const filas = (data || []) as Array<{ oferta_id: string; fue_respaldo_area: boolean; total_count: number | string }>;
  if (filas.length === 0) return vacio();
  const total = Number(filas[0].total_count) || filas.length;
  const ids = filas.map((f) => f.oferta_id);
  const detalle = await obtenerOfertasPorIds(ids);
  if (detalle.ok === false) {
    return { ok: false, error: detalle.error, ofertas: [], total: 0, page, pageSize, hasMore: false };
  }
  return {
    ok: true,
    ofertas: detalle.ofertas,
    total,
    page,
    pageSize,
    hasMore: hayMasPaginas(desde, filas.length, total),
    fue_respaldo_area: filas.some((f) => f.fue_respaldo_area === true)
  };
}

export async function obtenerOfertas(
  filtros: FiltrosOferta = {},
  page: number = 0,
  pageSize: number = PAGE_SIZE_DEFAULT,
  opciones: OpcionesBusquedaOfertas = {}
): Promise<ResultadoOfertas> {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 0;
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : PAGE_SIZE_DEFAULT;

  try {
    const hoy = todayISO();

    const aliadaIds = await resolverIdsAliadas();
    if (aliadaIds.length === 0) {
      return {
        ok: true,
        ofertas: [],
        total: 0,
        page: safePage,
        pageSize: safeSize,
        hasMore: false
      };
    }

    // Bloque: S5/S6 · ruta principal = RPC de BD `buscar_ofertas_publicas` (AND sin tildes, respaldo por área,
    // ciudad ≠ virtual). Si la RPC no existe en la BD, se registra y se sigue por PostgREST (`!inner`).
    if (puedeUsarRpc(filtros)) {
      const r = await buscarPorRpc(filtros, opciones, safePage, safeSize);
      if (r) return r;
    }

    const terminoPrograma = filtros.programa_o_area?.trim();
    const [nivelMod, ubicacion, universidadIds, areaIds] = await Promise.all([
      resolverNivelModalidad(filtros),
      resolverUbicacion(filtros),
      resolverUniversidades(filtros),
      terminoPrograma ? resolverAreasPorTexto(terminoPrograma) : Promise.resolve([] as string[])
    ]);
    // Bloque: filtro pedido sin coincidencias en el catálogo (nivel, modalidad, ciudad o país inexistente) = 0 resultados.
    const vacio = [nivelMod.nivelIds, nivelMod.modalidadIds, ubicacion.ciudadIds, ubicacion.paisIds].some((x) => x !== null && x.length === 0);
    if (vacio) {
      return { ok: true, ofertas: [], total: 0, page: safePage, pageSize: safeSize, hasMore: false };
    }
    const programaInner = Boolean(terminoPrograma) || nivelMod.nivelIds !== null || nivelMod.modalidadIds !== null;
    const sedeInner = ubicacion.ciudadIds !== null || ubicacion.paisIds !== null;

    // Rango de la página pedida (base 0); ver src/lib/paginacion-ofertas.ts.
    const { desde: from, hasta: to } = rangoPagina(safePage, safeSize);

    let query = supabase
      .from('ofertas_academicas')
      .select(selectOfertas({ programaInner, sedeInner }), { count: 'exact' })
      .eq('activo', true)
      .eq('estado_publicacion', 'publicado')
      .eq('estado_validacion', 'validado')
      // Bloque: nunca mostrar ofertas demo en el catálogo público (portal, NaIA, WA, funnel).
      // Por qué: con el catálogo real cargado (BD, 19-oct-2026) las demo sobran; BD ya las ocultó
      // en datos (activo=false), esto es una segunda barrera en código por si alguna se reactiva.
      .eq('es_demo', false)
      .lte('vigente_desde', hoy)
      .or(`vigente_hasta.is.null,vigente_hasta.gte.${hoy}`);

    // Bloque: S6 · texto, nivel, modalidad y ciudad filtran sobre los embebidos `!inner` (URL corta).
    if (terminoPrograma) {
      query = query.or(condicionesProgramaTexto(terminoPrograma, areaIds, opciones.terminosTodos), { referencedTable: 'programa' });
    }
    if (nivelMod.nivelIds !== null) query = query.in('programa.nivel_academico_id', nivelMod.nivelIds);
    if (nivelMod.modalidadIds !== null) query = query.in('programa.modalidad_id', nivelMod.modalidadIds);
    if (ubicacion.ciudadIds !== null) query = query.in('sede.ciudad_id', ubicacion.ciudadIds);
    if (ubicacion.paisIds !== null) query = query.in('sede.pais_id', ubicacion.paisIds);

    if (universidadIds !== null) {
      const cruzados = universidadIds.filter((id) => aliadaIds.includes(id));
      if (cruzados.length === 0) {
        return {
          ok: true,
          ofertas: [],
          total: 0,
          page: safePage,
          pageSize: safeSize,
          hasMore: false
        };
      }
      query = query.in('universidad_id', cruzados);
    } else {
      query = query.in('universidad_id', aliadaIds);
    }

    if (filtros.tipo_beneficio) {
      query = query.ilike('tipo_beneficio', patronTipoBeneficio(filtros.tipo_beneficio));
    }

    // «COORDINAR CON BE» (src/lib/ofertas.ts es la capa de datos del contrato BA-005): cambio mínimo
    // de Frontend, solo orden y cálculo de rango/«hay más»; no cambia filtros, columnas ni la forma
    // de ResultadoOfertas. Lo usan también NaIA, WhatsApp y el corredor de Demo WApp.
    // Orden TOTAL y estable: creado_en desc + id asc. Solo con creado_en, las filas de una carga
    // masiva (mismo creado_en) cambiaban de orden entre consultas y «Mostrar más» repetía o se
    // saltaba ofertas (se quedaba en 14 de 50). El id desempata y hace el rango determinista.
    for (const o of ORDEN_ESTABLE_OFERTAS) query = query.order(o.columna, { ascending: o.ascendente });
    query = query.range(from, to);

    const { data, error, count, status } = await query;

    if (error) {
      // Bloque: S6 · log con código, estado HTTP y mensaje recortado (sin filtros ni datos del usuario).
      console.error(JSON.stringify({
        origen: 'ofertas',
        evento: 'ofertas_query_failed',
        codigo: (error as { code?: string })?.code ?? null,
        status: status ?? null,
        mensaje: String(error.message || '').slice(0, 160)
      }));
      return {
        ok: false,
        error: {
          code: 'ofertas_query_failed',
          message: error.message || 'No se pudieron consultar las ofertas académicas.'
        },
        ofertas: [],
        total: 0,
        page: safePage,
        pageSize: safeSize,
        hasMore: false
      };
    }

    const ofertas: OfertaAcademica[] = await adjuntarPrecios((data || []).map((item: any) => mapearOferta(item, hoy)), hoy);
    const total = count ?? ofertas.length;
    // «Hay más» con el total exacto del servidor (página vacía → no hay más).
    const hasMore = hayMasPaginas(from, ofertas.length, total);

    return { ok: true, ofertas, total, page: safePage, pageSize: safeSize, hasMore };
  } catch (error) {
    console.error(JSON.stringify({ origen: 'ofertas', evento: 'ofertas_unexpected', error: error instanceof Error ? error.name : 'desconocido' }));
    const message =
      error instanceof Error ? error.message : 'Error inesperado al consultar ofertas.';
    return {
      ok: false,
      error: { code: 'ofertas_unexpected', message },
      ofertas: [],
      total: 0,
      page: safePage,
      pageSize: safeSize,
      hasMore: false
    };
  }
}

export async function obtenerOfertasPorIds(ids: string[]): Promise<ResultadoOfertasPorIds> {
  if (!ids || ids.length === 0) return { ok: true, ofertas: [] };

  try {
    const hoy = todayISO();
    const { data, error } = await supabase
      .from('ofertas_academicas')
      .select(selectOfertas())
      .in('id', ids);

    if (error) {
      console.error('Error obteniendo ofertas por IDs:', error);
      return {
        ok: false,
        error: {
          code: 'ofertas_by_ids_query_failed',
          message: error.message || 'No se pudieron consultar las ofertas por IDs.'
        },
        ofertas: []
      };
    }

    const ofertas = await adjuntarPrecios((data || []).map((item: any) => mapearOferta(item, hoy)), hoy);
    const orden = new Map(ids.map((id, index) => [id, index]));
    ofertas.sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0));

    return { ok: true, ofertas };
  } catch (error) {
    console.error('Error en obtenerOfertasPorIds:', error);
    const message =
      error instanceof Error ? error.message : 'Error inesperado al consultar ofertas por IDs.';
    return {
      ok: false,
      error: { code: 'ofertas_by_ids_unexpected', message },
      ofertas: []
    };
  }
}

export async function verificarDatosDemo(): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('ofertas_academicas').select('id').limit(1);
    return !error && (data?.length || 0) > 0;
  } catch {
    return false;
  }
}

export const __ofertaSearchTestUtils = {
  normalizarTermino,
  construirTerminosBusqueda,
  expandirSinonimos
};
