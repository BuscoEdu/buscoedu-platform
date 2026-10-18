/**
 * Pruebas de la paginación estable del catálogo (Explorar · «Mostrar más»).
 * Qué prueban: con 50 filas de una carga masiva (creado_en repetido) y el orden estable
 * (creado_en desc + id asc) se llega a 50 de 50 sin duplicados ni saltos; el cálculo de «hay más»;
 * y, como regresión, que la lógica vieja (orden sin desempate + página = cargadas / 10) se queda corta.
 * Para qué: que el botón no vuelva a quedarse en 14 de 50.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORDEN_ESTABLE_OFERTAS, hayMasPaginas, paginaAPedir, paginasDesdeCantidad, rangoPagina, siguientePagina } from './paginacion-ofertas';

type Fila = { id: string; creado_en: string };
// 50 filas en grupos de 12 con el mismo creado_en (carga masiva): los empates cruzan el borde de las páginas de 10.
const FILAS: Fila[] = Array.from({ length: 50 }, (_, i) => ({ id: `of-${String(i + 1).padStart(2, '0')}`, creado_en: `2026-09-0${1 + Math.floor(i / 12)}T10:00:00Z` }));

// «Base de datos» simulada: ordena según `orden` y devuelve el rango. Sin desempate por id, los
// empates salen en un orden distinto en cada consulta (lo que puede hacer Postgres).
function consultar(orden: ReadonlyArray<{ columna: string; ascendente: boolean }>, desde: number, hasta: number, semilla: number) {
  let s = semilla;
  const azar = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const conId = orden.some((o) => o.columna === 'id');
  const ordenadas = FILAS.map((f) => ({ f, k: azar() }))
    .sort((a, b) => b.f.creado_en.localeCompare(a.f.creado_en) || (conId ? a.f.id.localeCompare(b.f.id) : a.k - b.k))
    .map((x) => x.f);
  return { items: ordenadas.slice(desde, hasta + 1), total: FILAS.length };
}

test('rangoPagina: base 0, inclusivo, y valores raros caen en la página 0', () => {
  assert.deepEqual(rangoPagina(0, 10), { desde: 0, hasta: 9 });
  assert.deepEqual(rangoPagina(4, 10), { desde: 40, hasta: 49 });
  assert.deepEqual(rangoPagina(-1, 10), { desde: 0, hasta: 9 });
  assert.deepEqual(rangoPagina(Number.NaN, 10), { desde: 0, hasta: 9 });
});

test('hayMasPaginas: según el total del servidor; una página vacía nunca dice que hay más', () => {
  assert.equal(hayMasPaginas(0, 10, 50), true);
  assert.equal(hayMasPaginas(40, 10, 50), false);
  assert.equal(hayMasPaginas(40, 9, 50), true);
  assert.equal(hayMasPaginas(50, 0, 50), false);
  assert.equal(hayMasPaginas(10, 0, 50), false);
});

test('el orden estable es creado_en desc + id asc', () => {
  assert.deepEqual(ORDEN_ESTABLE_OFERTAS.map((o) => `${o.columna}.${o.ascendente ? 'asc' : 'desc'}`), ['creado_en.desc', 'id.asc']);
});

test('CRITERIO Explorar: con 50 filas, «Mostrar más» llega a 50 de 50 sin duplicados ni saltos', () => {
  const tam = 10;
  const primera = consultar(ORDEN_ESTABLE_OFERTAS, 0, tam - 1, 1);
  let estado = { items: primera.items, paginasCargadas: 1, total: primera.total };
  const paginasPedidas = [0];
  let clics = 0;
  while (estado.items.length < estado.total && clics < 20) {
    clics++;
    const pagina = paginaAPedir(estado.paginasCargadas);
    paginasPedidas.push(pagina);
    const { desde, hasta } = rangoPagina(pagina, tam);
    const r = consultar(ORDEN_ESTABLE_OFERTAS, desde, hasta, 100 + clics);
    estado = siguientePagina(estado, { items: r.items, total: r.total, desde });
  }
  assert.equal(clics, 4);
  assert.deepEqual(paginasPedidas, [0, 1, 2, 3, 4]);
  assert.equal(estado.items.length, 50);
  assert.equal(new Set(estado.items.map((x) => x.id)).size, 50);
  assert.equal(estado.total, 50);
  // Mismo orden que el servidor de punta a punta: sin saltos.
  assert.deepEqual(estado.items.map((x) => x.id), consultar(ORDEN_ESTABLE_OFERTAS, 0, 49, 9).items.map((x) => x.id));
});

test('regresión: la lógica vieja (sin desempate y página = cargadas / 10) no llega a 50', () => {
  const tam = 10;
  const sinDesempate = [{ columna: 'creado_en', ascendente: false }];
  let items = consultar(sinDesempate, 0, tam - 1, 1).items;
  let total = 50;
  for (let clic = 1; clic <= 10 && items.length < total; clic++) {
    const pagina = Math.floor(items.length / tam);
    const r = consultar(sinDesempate, pagina * tam, pagina * tam + tam - 1, 100 + clic);
    const vistos = new Set(items.map((x) => x.id));
    const nuevas = r.items.filter((x) => !vistos.has(x.id));
    if (nuevas.length === 0) { total = items.length; break; }
    items = [...items, ...nuevas];
  }
  assert.ok(items.length < 50, `la lógica vieja llegó a ${items.length}`);
});

test('siguientePagina: una página con repetidos no corta el listado si el servidor dice que hay más', () => {
  const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' };
  const r = siguientePagina({ items: [a, b], paginasCargadas: 1, total: 6 }, { items: [b, c], total: 6, desde: 2 });
  assert.deepEqual(r.items.map((x) => x.id), ['a', 'b', 'c']);
  assert.equal(r.nuevas, 1);
  assert.equal(r.paginasCargadas, 2);
  assert.equal(r.hayMas, true);
  assert.equal(r.total, 6);
  // Última página: el total queda igual a lo mostrado y el botón desaparece.
  const fin = siguientePagina({ items: [a, b, c], paginasCargadas: 2, total: 6 }, { items: [], total: 6, desde: 4 });
  assert.equal(fin.hayMas, false);
  assert.equal(fin.total, 3);
});

test('paginaAPedir y paginasDesdeCantidad (sesión restaurada)', () => {
  assert.equal(paginaAPedir(0), 0);
  assert.equal(paginaAPedir(3), 3);
  assert.equal(paginaAPedir(Number.NaN), 0);
  assert.equal(paginasDesdeCantidad(20, 10), 2);
  assert.equal(paginasDesdeCantidad(14, 10), 2);
  assert.equal(paginasDesdeCantidad(0, 10), 0);
});
