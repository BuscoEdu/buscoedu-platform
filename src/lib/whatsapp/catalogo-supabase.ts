/**
 * BA-032 · Catálogo para WhatsApp sobre la fuente única del portal.
 *
 * Reutiliza obtenerOfertas (BA-005): ya filtra activo + publicado + validado + vigente
 * y solo universidades aliadas. Aquí solo se adapta al formato OfertaWa con link a la web.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { etiquetaBeneficio } from '@/src/lib/etiquetas-beneficio';
import { listarTiposConsentimientoActivos } from '@/src/lib/leadcenter/tipos-consentimiento';
import type { OfertaAcademica } from '@/src/lib/ofertas';
import { obtenerOfertas } from '@/src/lib/ofertas';
import { URL_WEB } from './mensajes';
import type { CatalogoWa, ConteoProgramasWa, OfertaWa } from './tipos';

/** Ofertas que se piden a BD para agrupar por programa antes de cortar (C-52). */
export const OFERTAS_POR_CONSULTA_WA = 100;

// No existe URL por ficha en la web (el detalle es un modal); se enlaza a Explorar con la búsqueda.
export function urlFicha(nombrePrograma: string): string {
  return `${URL_WEB}/explorar?q=${encodeURIComponent(nombrePrograma.slice(0, 80))}`;
}

/**
 * Bloque: agrupa ofertas por programa_id conservando el orden estable de BD (C-08/C-52).
 * Qué: un programa en 4 sedes = 1 fila con `ciudades` (la primera oferta queda como la elegible para Aplicar).
 * Por qué: en QA S4 «Maestría en Psicología» ocupaba 4 de las 8 filas, todas iguales.
 * Puro (sin BD) para poder probarlo.
 */
export function agruparPorPrograma(items: OfertaAcademica[]): OfertaWa[] {
  const grupos = new Map<string, OfertaWa>();
  for (const item of items) {
    const clave = item.programa_id || item.id;
    const ciudad = item.sede?.ciudad || undefined;
    const existente = grupos.get(clave);
    if (existente) {
      if (ciudad && !existente.ciudades!.includes(ciudad)) existente.ciudades!.push(ciudad);
      if (!existente.beneficio) {
        const b = etiquetaBeneficio(item.tipo_beneficio);
        if (b) existente.beneficio = b;
      }
      continue;
    }
    const beneficio = etiquetaBeneficio(item.tipo_beneficio);
    const nombrePrograma = item.programa?.nombre || item.nombre;
    grupos.set(clave, {
      id: item.id,
      programa_id: clave,
      nombre: item.nombre,
      universidad: item.universidad?.nombre || 'Universidad aliada',
      ...(item.programa?.modalidad ? { modalidad: item.programa.modalidad } : {}),
      ...(item.programa?.nivel_academico ? { nivel: item.programa.nivel_academico } : {}),
      ...(ciudad ? { ciudad } : {}),
      ciudades: ciudad ? [ciudad] : [],
      ...(beneficio ? { beneficio } : {}),
      // Bloque: WA-fix-1 · área del programa para S5 (respaldo) y S12 (ofrecer áreas).
      ...(item.programa?.area ? { area: item.programa.area } : {}),
      // S14 · código SNIES del programa para la respuesta de registro.
      ...(item.programa?.codigo_snies ? { snies: item.programa.codigo_snies } : {}),
      // WA-fix-1b · S13 · duración del catálogo (si viene) para la ficha.
      ...(item.programa?.duracion ? { duracion: item.programa.duracion } : {}),
      // Precio publicable (puerta precios-publicos); sin él la ficha usa T17.
      ...(item.texto_precio ? { texto_precio: item.texto_precio } : {}),
      url: urlFicha(nombrePrograma)
    });
  }
  return [...grupos.values()];
}

/** Tope de páginas de 100 ofertas por consulta (1.000 ofertas): evita bucles largos si BD crece mucho. */
export const MAX_PAGINAS_WA = 10;

type PaginaOfertas = { ok: true; ofertas: OfertaAcademica[]; total: number; fue_respaldo_area?: boolean } | { ok: false };

/**
 * Bloque: WA-fix-1b · S6 · el total cuenta PROGRAMAS, no ofertas.
 * Qué: pide páginas de 100 ofertas hasta traerlas todas (o hasta MAX_PAGINAS_WA), agrupa por programa
 * y devuelve `total` = programas distintos.
 * Por qué: en el preview «virtual · Medellín» decía 196 (ofertas) cuando eran 16 programas: con más de
 * 100 ofertas el total caía al conteo de ofertas de BD. Puro (recibe la función de página) para probarlo sin BD.
 */
export async function buscarProgramasPaginado(
  pedirPagina: (pagina: number, tamano: number) => Promise<PaginaOfertas>,
  max: number
): Promise<{ ok: true; ofertas: OfertaWa[]; total: number; respaldoArea?: boolean; completo: boolean; totalOfertas: number; conteo: ConteoProgramasWa } | { ok: false }> {
  const primera = await pedirPagina(0, OFERTAS_POR_CONSULTA_WA);
  if (!primera.ok) return { ok: false };
  const todas = [...primera.ofertas];
  let pagina = 1;
  // Se sigue pidiendo mientras falten ofertas, la página anterior no venga vacía y no se pase el tope.
  while (todas.length < primera.total && pagina < MAX_PAGINAS_WA) {
    const r = await pedirPagina(pagina, OFERTAS_POR_CONSULTA_WA);
    if (!r.ok) return { ok: false };
    if (r.ofertas.length === 0) break;
    todas.push(...r.ofertas);
    pagina += 1;
  }
  const programas = agruparPorPrograma(todas);
  const completo = todas.length >= primera.total;
  return {
    ok: true,
    ofertas: programas.slice(0, Math.max(1, max)),
    // Incompleto (más de 1.000 ofertas): se cuentan los programas vistos, nunca ofertas (cota inferior).
    total: programas.length,
    completo,
    totalOfertas: primera.total,
    // S12 exacto · conteo por área sobre TODOS los programas agrupados (antes del corte a `max`).
    conteo: { exacto: completo, areas: contarAreasProgramas(programas) },
    ...(primera.fue_respaldo_area ? { respaldoArea: true } : {})
  };
}

/**
 * Bloque: S12 exacto · programas por área (1 programa = 1, aunque tenga varias ofertas). Sin área no cuenta;
 * orden por cantidad desc y, a igual cantidad, por nombre (orden estable).
 */
export function contarAreasProgramas(programas: Array<{ area?: string }>): Array<{ area: string; cantidad: number }> {
  const conteo = new Map<string, number>();
  for (const p of programas) if (p.area) conteo.set(p.area, (conteo.get(p.area) || 0) + 1);
  return [...conteo.entries()]
    .map(([area, cantidad]) => ({ area, cantidad }))
    .sort((x, y) => y.cantidad - x.cantidad || x.area.localeCompare(y.area, 'es'));
}

export function crearCatalogoSupabase(dbServicio: SupabaseClient): CatalogoWa {
  return {
    // Bloque: trae todas las ofertas de la consulta por páginas, agrupa por programa y devuelve hasta
    // `max` programas + total de PROGRAMAS (C-12/C-52, S6 WA-fix-1b).
    async buscar(filtros, max) {
      // S5 · los términos AND viajan como opción aparte (FiltrosOferta es contrato de FE).
      const { terminos_todos, ...base } = filtros;
      const r = await buscarProgramasPaginado(async (pagina, tamano) => {
        const res = await obtenerOfertas(base, pagina, tamano, { terminosTodos: terminos_todos });
        return res.ok ? { ok: true, ofertas: res.ofertas, total: res.total, ...(res.fue_respaldo_area ? { fue_respaldo_area: true } : {}) } : { ok: false };
      }, max);
      if (!r.ok) return { ok: false };
      if (!r.completo) console.info(JSON.stringify({ origen: 'wa_catalogo', evento: 'wa_total_aproximado', ofertas: r.totalOfertas, programas: r.total }));
      return { ok: true, ofertas: r.ofertas, total: r.total, conteo: r.conteo, ...(r.respaldoArea ? { respaldoArea: true } : {}) };
    },
    async tiposConsentimiento() {
      return listarTiposConsentimientoActivos(dbServicio);
    }
  };
}
