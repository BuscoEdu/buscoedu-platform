/**
 * STUB TEMPORAL · presentación de resultados y ficha (dueño: Frontend). Reemplazar por la versión de FE.
 *
 * Qué: implementación mínima del contrato que llama el orquestador, solo para compilar y probar el flujo.
 * Por qué: FE es dueño de este archivo; BE no define aquí copy ni estilo final.
 * Contrato que usa BE (no cambiar sin avisar):
 *   armarResultados(ofertasAgrupadas, total, pagina, consulta?) → { cuerpo, filas, botonTexto, seccion, pie? }
 *     - pagina en base 0; filas de programa con id `oferta:{id}` numeradas desde pagina*8+1;
 *     - si hay más programas: fila extra id `menu:mas` («Ver más»); máx 10 filas.
 *   armarFicha(oferta) → { cuerpo, botones } con ids `lista:{id}`, `aplicar:{id}`, `menu:volver`.
 */

import type { BotonRespuesta, FilaLista } from './graph-client';
import type { OfertaAgrupadaWa } from './tipos';

export const PROGRAMAS_POR_PAGINA = 8;

// Bloque: corte por palabra con «…» (título de fila ≤24, límite Meta).
function cortar(texto: string, max: number): string {
  const t = (texto || '').trim();
  if (t.length <= max) return t;
  const base = t.slice(0, max - 1);
  const espacio = base.lastIndexOf(' ');
  return `${(espacio > max / 2 ? base.slice(0, espacio) : base).trim()}…`;
}

// Bloque: lista única de resultados (T09 v1.1): body corto, sin URLs; link único en el pie.
export function armarResultados(
  ofertasAgrupadas: OfertaAgrupadaWa[],
  total: number,
  pagina: number,
  consulta = ''
): { cuerpo: string; filas: FilaLista[]; botonTexto: string; seccion: string; pie?: string } {
  const desde = pagina * PROGRAMAS_POR_PAGINA;
  const k = ofertasAgrupadas.length;
  const para = consulta ? ` para «${consulta.slice(0, 40)}»` : '';
  const cabeza = total > k ? `Encontré ${total} programas vigentes${para}. Te muestro ${k} de ${total} 👇` : `Encontré ${total} programas vigentes${para} 👇`;
  const filas: FilaLista[] = ofertasAgrupadas.slice(0, PROGRAMAS_POR_PAGINA).map((o, i) => {
    const ciudades = o.ciudades || [];
    const lugar = ciudades.length > 1 ? `${ciudades[0]} +${ciudades.length - 1} ciudades` : ciudades[0] || o.ciudad || '';
    return {
      id: `oferta:${o.id}`,
      titulo: cortar(`${desde + i + 1}. ${o.nombre}`, 24),
      descripcion: cortar([o.universidad, o.modalidad, lugar].filter(Boolean).join(' · '), 72)
    };
  });
  if (desde + k < total) filas.push({ id: 'menu:mas', titulo: 'Ver más', descripcion: 'Siguientes programas' });
  const pie = consulta ? `buscoedu.com/explorar?q=${encodeURIComponent(consulta.slice(0, 20))}` : undefined;
  return {
    cuerpo: `${cabeza}\nToca *Ver programas* o escribe el número.`,
    filas: filas.slice(0, 10),
    botonTexto: 'Ver programas',
    seccion: 'Programas vigentes',
    ...(pie && pie.length <= 60 ? { pie } : {})
  };
}

// Bloque: ficha elegida (T09b) con 3 botones.
export function armarFicha(oferta: OfertaAgrupadaWa): { cuerpo: string; botones: BotonRespuesta[] } {
  const lugar = (oferta.ciudades || []).join(', ') || oferta.ciudad || '';
  const detalle = [oferta.universidad, oferta.modalidad, oferta.nivel, lugar].filter(Boolean).join(' · ');
  const beneficio = oferta.beneficio
    ? `\nBeneficio: ${oferta.beneficio}. Lo otorga la universidad; confirma los requisitos con ella o con un asesor.`
    : '';
  const cuerpo = `*${oferta.nombre}*\n${detalle}${beneficio}\nPrecio no disponible. Puedes consultarlo con la universidad o con un asesor.\nFicha: ${oferta.url}`;
  return {
    cuerpo: cuerpo.slice(0, 600),
    botones: [
      { id: `lista:${oferta.id}`, titulo: 'Guardar en Mi lista' },
      { id: `aplicar:${oferta.id}`, titulo: 'Aplicar' },
      { id: 'menu:volver', titulo: 'Ver otros' }
    ]
  };
}
