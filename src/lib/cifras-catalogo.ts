/**
 * Cifras del Home tomadas del mismo catálogo que lista Explorar.
 * programas = total de `obtenerOfertas` sin filtros extra.
 * ciudades = ciudades distintas de esas mismas ofertas.
 * 0, conteo ausente o error → null (el front no pinta la sección).
 */

import { obtenerOfertas, type FiltrosOferta } from './ofertas';

export type CifrasCatalogo = {
  programas: number;
  ciudades: number;
};

type OfertaConCiudad = {
  sede?: { ciudad?: string | null } | null;
};

export type PaginaCifras =
  | {
      ok: true;
      total: number | null;
      hasMore: boolean;
      ofertas: OfertaConCiudad[];
    }
  | { ok: false };

type LectorCatalogo = (
  filtros: FiltrosOferta,
  page: number,
  pageSize: number
) => Promise<PaginaCifras>;

/** Misma página que aguanta el catálogo público sin inventar un corte. */
const TAMANO_PAGINA = 100;

/** Tope para no publicar un conteo a medias si la paginación no cierra. */
const MAX_PAGINAS = 30;

function ciudadDe(oferta: OfertaConCiudad): string {
  const ciudad = oferta.sede?.ciudad;
  return typeof ciudad === 'string' ? ciudad.trim() : '';
}

/**
 * Recorre el catálogo de Explorar (filtros vacíos) y resume programas y ciudades.
 * Si una página falla, el total no es un número o da 0, devuelve null.
 */
export async function contarCifrasCatalogo(leer: LectorCatalogo): Promise<CifrasCatalogo | null> {
  try {
    return await resumirPaginas(leer);
  } catch (error) {
    console.error('Error en getCifrasCatalogo:', error);
    return null;
  }
}

async function resumirPaginas(leer: LectorCatalogo): Promise<CifrasCatalogo | null> {
  const ciudades = new Set<string>();
  let total = 0;

  for (let page = 0; page < MAX_PAGINAS; page += 1) {
    const resultado = await leer({}, page, TAMANO_PAGINA);
    if (!resultado.ok) return null;
    if (typeof resultado.total !== 'number' || !Number.isFinite(resultado.total) || resultado.total <= 0) {
      return null;
    }

    total = resultado.total;
    for (const oferta of resultado.ofertas) {
      const ciudad = ciudadDe(oferta);
      if (ciudad) ciudades.add(ciudad);
    }

    const cubiertas = page * TAMANO_PAGINA + resultado.ofertas.length;
    const paginaVacia = resultado.ofertas.length === 0;
    if (paginaVacia) return null;
    if (!resultado.hasMore || cubiertas >= total) {
      if (ciudades.size === 0) return null;
      return { programas: total, ciudades: ciudades.size };
    }
  }

  return null;
}

/**
 * Cifras públicas del Home. Reutiliza `obtenerOfertas`, que ya aplica
 * activa + publicada + validada + vigente + aliadas.
 */
export async function getCifrasCatalogo(): Promise<CifrasCatalogo | null> {
  return contarCifrasCatalogo(obtenerOfertas);
}
