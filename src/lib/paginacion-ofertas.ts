/**
 * Paginación estable del catálogo de ofertas (Explorar y NaIA) — módulo puro, testeable con node --test.
 *
 * Qué hace:
 *   - rangoPagina: convierte página (base 0) + tamaño en el rango [desde, hasta] de PostgREST.
 *   - hayMasPaginas: calcula «hay más» con el total del servidor, sin depender de lo deduplicado.
 *   - siguientePagina: integra una página nueva al listado (sin duplicados) y avanza el contador
 *     de páginas PEDIDAS al servidor, que es lo que define el siguiente rango.
 * Para qué: el botón «Mostrar más» se quedaba en 14 de 50. Causas: (1) la consulta solo ordenaba
 * por `creado_en`, y en una carga masiva muchas filas comparten ese valor, así que el orden entre
 * empates cambiaba en cada consulta y el rango devolvía filas repetidas y se saltaba otras; (2) la
 * página siguiente se calculaba con el número de ofertas ya deduplicadas (14 → página 1 otra vez),
 * y una página repetida cortaba el total. Ahora el orden es total (`creado_en` desc + `id` asc) y la
 * página siguiente sale del contador de páginas pedidas.
 */

/** Orden total del catálogo: más recientes primero y, a igual fecha, por id (desempate único). */
export const ORDEN_ESTABLE_OFERTAS = [
  { columna: 'creado_en', ascendente: false },
  { columna: 'id', ascendente: true }
] as const;

/** Rango inclusivo [desde, hasta] para `.range()` de una página base 0. */
export function rangoPagina(pagina: number, tamano: number): { desde: number; hasta: number } {
  const p = Number.isFinite(pagina) && pagina > 0 ? Math.floor(pagina) : 0;
  const t = Number.isFinite(tamano) && tamano > 0 ? Math.floor(tamano) : 1;
  const desde = p * t;
  return { desde, hasta: desde + t - 1 };
}

/**
 * ¿Quedan filas en el servidor después de esta página?
 * `desde` = primer índice pedido, `recibidas` = filas que llegaron, `total` = conteo exacto.
 * Una página vacía nunca dice «hay más» (evita un bucle de clics sin resultados).
 */
export function hayMasPaginas(desde: number, recibidas: number, total: number): boolean {
  return recibidas > 0 && desde + recibidas < total;
}

/** Estado mínimo del listado para pedir la siguiente página. */
export interface EstadoPaginacion<T extends { id: string }> {
  items: T[];
  /** Páginas ya pedidas con éxito al servidor (no es items.length / tamaño). */
  paginasCargadas: number;
  total: number;
}

/**
 * Integra la página `pagina` recibida: agrega solo ids nuevos (en el orden del servidor), suma una
 * página pedida y recalcula el total. Si el servidor dice que no hay más, el total queda igual a lo
 * mostrado (el botón desaparece); si dice que sí, se conserva su total aunque la página trajera
 * repetidos, para no cortar el listado antes de tiempo.
 */
export function siguientePagina<T extends { id: string }>(
  estado: EstadoPaginacion<T>,
  pagina: { items: T[]; total: number; desde: number }
): EstadoPaginacion<T> & { nuevas: number; hayMas: boolean } {
  const vistos = new Set(estado.items.map((x) => x.id));
  const nuevas = pagina.items.filter((x) => {
    if (vistos.has(x.id)) return false;
    vistos.add(x.id);
    return true;
  });
  const items = [...estado.items, ...nuevas];
  const hayMas = hayMasPaginas(pagina.desde, pagina.items.length, pagina.total);
  return {
    items,
    paginasCargadas: estado.paginasCargadas + 1,
    total: hayMas ? Math.max(pagina.total, items.length) : items.length,
    nuevas: nuevas.length,
    hayMas
  };
}

/** Página (base 0) que toca pedir ahora: la siguiente a las ya pedidas. */
export function paginaAPedir(paginasCargadas: number): number {
  return Number.isFinite(paginasCargadas) && paginasCargadas > 0 ? Math.floor(paginasCargadas) : 0;
}

/** Páginas que equivalen a un listado restaurado de sesión (sin duplicados, orden estable). */
export function paginasDesdeCantidad(cantidad: number, tamano: number): number {
  return cantidad > 0 && tamano > 0 ? Math.ceil(cantidad / tamano) : 0;
}
