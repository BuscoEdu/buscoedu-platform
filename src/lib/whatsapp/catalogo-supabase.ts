/**
 * BA-032 · Catálogo para WhatsApp sobre la fuente única del portal.
 *
 * Reutiliza obtenerOfertas (BA-005): ya filtra activo + publicado + validado + vigente
 * y solo universidades aliadas. Aquí solo se adapta al formato OfertaWa con link a la web.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { etiquetaBeneficio } from '@/src/lib/etiquetas-beneficio';
import { listarTiposConsentimientoActivos } from '@/src/lib/leadcenter/tipos-consentimiento';
import { obtenerOfertas } from '@/src/lib/ofertas';
import { URL_WEB } from './mensajes';
import type { CatalogoWa } from './tipos';

// No existe URL por ficha en la web (el detalle es un modal); se enlaza a Explorar con la búsqueda.
export function urlFicha(nombrePrograma: string): string {
  return `${URL_WEB}/explorar?q=${encodeURIComponent(nombrePrograma.slice(0, 80))}`;
}

export function crearCatalogoSupabase(dbServicio: SupabaseClient): CatalogoWa {
  return {
    async buscar(filtros, max) {
      const resultado = await obtenerOfertas(filtros, 0, Math.min(Math.max(1, max), 8));
      if (!resultado.ok) return { ok: false };
      return {
        ok: true,
        ofertas: resultado.ofertas.slice(0, 8).map((item) => {
          const beneficio = etiquetaBeneficio(item.tipo_beneficio);
          const nombrePrograma = item.programa?.nombre || item.nombre;
          return {
            id: item.id,
            nombre: item.nombre,
            universidad: item.universidad?.nombre || 'Universidad aliada',
            ...(item.programa?.modalidad ? { modalidad: item.programa.modalidad } : {}),
            ...(item.programa?.nivel_academico ? { nivel: item.programa.nivel_academico } : {}),
            ...(item.sede?.ciudad ? { ciudad: item.sede.ciudad } : {}),
            ...(beneficio ? { beneficio } : {}),
            url: urlFicha(nombrePrograma)
          };
        })
      };
    },
    async tiposConsentimiento() {
      return listarTiposConsentimientoActivos(dbServicio);
    }
  };
}
