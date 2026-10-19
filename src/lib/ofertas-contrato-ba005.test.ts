/**
 * BA-005 · Contrato de `obtenerOfertas` después del orden estable + paginación (commit FE c5fb085).
 *
 * Qué prueba (sin red ni BD): se reemplaza `fetch` por un PostgREST de mentira que guarda cada URL
 * pedida y responde un catálogo en memoria con `Content-Range` (el conteo exacto). Así se valida la
 * consulta REAL que arma `src/lib/ofertas.ts` (orden, offset/limit) y la forma de la respuesta.
 *   1. Orden total `creado_en.desc,id.asc` (los empates de `creado_en` se desempatan por id).
 *   2. Paginación base 0: offset/limit correctos, sin duplicados ni huecos entre páginas, `hasMore`.
 *   3. Llamada por defecto (sin page/pageSize): página 0 de 20, igual que antes del cambio.
 *   4. Callers del contrato: NaIA (0, 10), WhatsApp (0, ≤8), Demo WApp (0, 5) y cifras del Home
 *      (recorre páginas de 100 hasta el total, sin truncar).
 * Para qué: que un cambio de orden/paginación no rompa en silencio a NaIA, WhatsApp ni Demo WApp.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

// Configuración falsa (no son secretos reales): el cliente Supabase se crea perezosamente con estos
// valores y todas sus peticiones caen en el fetch de mentira de abajo. La allowlist de aliadas por
// env evita la consulta a `universidades`.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://postgrest.prueba.local';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-de-prueba-no-real';
process.env.NEXT_PUBLIC_ALIADAS_IDS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// Catálogo en memoria: 50 ofertas, de a 10 con el MISMO creado_en (como una carga masiva). Es el
// caso que antes repetía/saltaba filas en «Mostrar más» (14 de 50).
interface FilaFalsa { id: string; creado_en: string; nombre_oferta: string; activo: boolean; vigente_desde: string; vigente_hasta: null; sede: { nombre: string; ciudad: { nombre: string } } }
function crearCatalogo(n: number): FilaFalsa[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(1000 + ((i * 37) % n)).padStart(12, '0')}`,
    creado_en: `2026-10-${String(10 + Math.floor(i / 10)).padStart(2, '0')}T00:00:00Z`,
    nombre_oferta: `Oferta ${i}`,
    activo: true,
    vigente_desde: '2026-01-01',
    vigente_hasta: null,
    sede: { nombre: 'Sede', ciudad: { nombre: i % 2 ? 'Bogotá' : 'Medellín' } }
  }));
}
let catalogo = crearCatalogo(50);
const urls: URL[] = [];

// Ordena como lo haría Postgres con el parámetro `order` de PostgREST (columna.dir, …).
function ordenarComoPostgrest(filas: FilaFalsa[], order: string | null): FilaFalsa[] {
  if (!order) return filas;
  const reglas = order.split(',').map((r) => { const [col, dir] = r.split('.'); return { col: col as keyof FilaFalsa, desc: dir === 'desc' }; });
  return [...filas].sort((a, b) => {
    for (const r of reglas) {
      const va = String(a[r.col]); const vb = String(b[r.col]);
      if (va !== vb) return (va < vb ? -1 : 1) * (r.desc ? -1 : 1);
    }
    return 0;
  });
}

// Fetch de mentira: solo atiende `ofertas_academicas`; responde la porción offset/limit pedida y
// el conteo exacto en Content-Range, como PostgREST con `count=exact`.
globalThis.fetch = (async (entrada: RequestInfo | URL) => {
  const url = new URL(String(entrada instanceof Request ? entrada.url : entrada));
  urls.push(url);
  if (!url.pathname.endsWith('/ofertas_academicas')) return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
  const ordenadas = ordenarComoPostgrest(catalogo, url.searchParams.get('order'));
  const offset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Number(url.searchParams.get('limit') ?? ordenadas.length);
  const pagina = ordenadas.slice(offset, offset + limit);
  const rango = pagina.length ? `${offset}-${offset + pagina.length - 1}` : '*';
  return new Response(JSON.stringify(pagina), {
    status: 200,
    headers: { 'content-type': 'application/json', 'content-range': `${rango}/${ordenadas.length}` }
  });
}) as typeof fetch;

const { obtenerOfertas } = await import('./ofertas');
const { crearCatalogoSupabase } = await import('./whatsapp/catalogo-supabase');
const { buscarOfertasCorredor } = await import('./demowapp/buscar-ofertas-corredor');
const { getCifrasCatalogo } = await import('./cifras-catalogo');

// Última consulta principal enviada a `ofertas_academicas` (para revisar order/offset/limit).
function ultimaConsultaOfertas(): URL {
  const u = [...urls].reverse().find((x) => x.pathname.endsWith('/ofertas_academicas'));
  assert.ok(u, 'se esperaba una consulta a ofertas_academicas');
  return u;
}

test('BA-005 orden: la consulta pide creado_en.desc,id.asc y se respetan los empates', async () => {
  catalogo = crearCatalogo(50);
  const r = await obtenerOfertas({}, 0, 50);
  assert.equal(r.ok, true);
  assert.equal(ultimaConsultaOfertas().searchParams.get('order'), 'creado_en.desc,id.asc');
  // Mismo orden que el esperado: creado_en descendente y, a igual fecha, id ascendente.
  const esperado = ordenarComoPostgrest(catalogo, 'creado_en.desc,id.asc').map((f) => f.id);
  assert.deepEqual(r.ofertas.map((o) => o.id), esperado);
});

test('BA-005 paginación: 5 páginas de 10 cubren las 50 sin duplicados y hasMore cierra en la última', async () => {
  catalogo = crearCatalogo(50);
  const vistos = new Set<string>();
  for (let page = 0; page < 5; page += 1) {
    const r = await obtenerOfertas({}, page, 10);
    assert.equal(r.ok, true);
    const q = ultimaConsultaOfertas().searchParams;
    assert.equal(q.get('offset'), String(page * 10));
    assert.equal(q.get('limit'), '10');
    assert.equal(r.page, page);
    assert.equal(r.pageSize, 10);
    assert.equal(r.total, 50);
    assert.equal(r.hasMore, page < 4);
    for (const o of r.ofertas) {
      assert.equal(vistos.has(o.id), false, `oferta repetida entre páginas: ${o.id}`);
      vistos.add(o.id);
    }
  }
  assert.equal(vistos.size, 50);
  // Página fuera de rango: éxito vacío, sin «hay más» (no confundir con error).
  const fuera = await obtenerOfertas({}, 9, 10);
  assert.deepEqual({ ok: fuera.ok, n: fuera.ofertas.length, total: fuera.total, hasMore: fuera.hasMore }, { ok: true, n: 0, total: 50, hasMore: false });
});

test('BA-005 por defecto: sin page/pageSize devuelve la página 0 de 20 con la forma de siempre', async () => {
  catalogo = crearCatalogo(50);
  const r = await obtenerOfertas();
  const q = ultimaConsultaOfertas().searchParams;
  assert.equal(q.get('offset'), '0');
  assert.equal(q.get('limit'), '20');
  assert.deepEqual(Object.keys(r).sort(), ['hasMore', 'ofertas', 'ok', 'page', 'pageSize', 'total']);
  assert.deepEqual({ ok: r.ok, n: r.ofertas.length, total: r.total, page: r.page, pageSize: r.pageSize, hasMore: r.hasMore }, { ok: true, n: 20, total: 50, page: 0, pageSize: 20, hasMore: true });
  // Valores inválidos siguen cayendo a los defaults (0 y 20), como antes.
  const raro = await obtenerOfertas({}, -3, Number.NaN);
  assert.deepEqual({ page: raro.page, pageSize: raro.pageSize }, { page: 0, pageSize: 20 });
});

test('BA-005 NaIA: obtenerOfertas(filtros, 0, 10) trae 10 y el total completo para «Mostrar más»', async () => {
  catalogo = crearCatalogo(50);
  const r = await obtenerOfertas({}, 0, 10);
  assert.equal(r.ok, true);
  assert.equal(r.ofertas.length, 10);
  assert.equal(r.total, 50);
  assert.equal(r.hasMore, true);
});

test('BA-005 WhatsApp: el catálogo pide 100 ofertas, agrupa por programa y devuelve máx. `max` con total real (C-52)', async () => {
  catalogo = crearCatalogo(50);
  const wa = crearCatalogoSupabase({} as never);
  const r = await wa.buscar({}, 20);
  assert.equal(ultimaConsultaOfertas().searchParams.get('limit'), '100');
  assert.equal(ultimaConsultaOfertas().searchParams.get('order'), 'creado_en.desc,id.asc');
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.ok(r.ofertas.length <= 20);
    assert.ok((r.total ?? 0) >= r.ofertas.length);
    assert.ok(r.ofertas.every((o) => o.url.startsWith('http') && o.universidad));
  }
  const tres = await wa.buscar({}, 3);
  assert.ok(tres.ok && tres.ofertas.length <= 3);
});

test('BA-005 Demo WApp: el corredor pide 5 y conserva el total real del catálogo', async () => {
  catalogo = crearCatalogo(50);
  const r = await buscarOfertasCorredor({});
  assert.equal(ultimaConsultaOfertas().searchParams.get('limit'), '5');
  assert.deepEqual({ ok: r.ok, n: r.ofertas.length, total: r.total }, { ok: true, n: 5, total: 50 });
});

test('BA-005 cifras del Home: recorre páginas de 100 hasta el total (sin truncar a 20)', async () => {
  catalogo = crearCatalogo(150);
  urls.length = 0;
  const r = await getCifrasCatalogo();
  assert.deepEqual(r, { programas: 150, ciudades: 2 });
  const offsets = urls.filter((u) => u.pathname.endsWith('/ofertas_academicas')).map((u) => u.searchParams.get('offset'));
  assert.deepEqual(offsets, ['0', '100']);
});
