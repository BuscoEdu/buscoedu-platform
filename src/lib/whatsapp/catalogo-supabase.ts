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
import type { CatalogoWa, OfertaWa } from './tipos';

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
      url: urlFicha(nombrePrograma)
    });
  }
  return [...grupos.values()];
}

export function crearCatalogoSupabase(dbServicio: SupabaseClient): CatalogoWa {
  return {
    // Bloque: busca hasta 100 ofertas, agrupa por programa y devuelve hasta `max` programas + total real (C-12/C-52).
    // Si BD tiene más de 100 ofertas para la consulta, `total` = conteo exacto de ofertas (cota superior) y se loguea.
    async buscar(filtros, max) {
      const resultado = await obtenerOfertas(filtros, 0, OFERTAS_POR_CONSULTA_WA);
      if (!resultado.ok) return { ok: false };
      const programas = agruparPorPrograma(resultado.ofertas);
      const completo = resultado.total <= resultado.ofertas.length;
      if (!completo) console.info(JSON.stringify({ origen: 'wa_catalogo', evento: 'wa_total_aproximado', ofertas: resultado.total }));
      return {
        ok: true,
        ofertas: programas.slice(0, Math.max(1, max)),
        total: completo ? programas.length : resultado.total
      };
    },
    async tiposConsentimiento() {
      return listarTiposConsentimientoActivos(dbServicio);
    }
  };
}
