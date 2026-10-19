/**
 * Lote WA-fix-1 · capa de datos `obtenerOfertas` (sin red ni BD: fetch de mentira estilo PostgREST).
 * Prueba: RPC `buscar_ofertas_publicas` (mock), fallback PostgREST con `!inner` (URL corta, sin listas
 * de ~755 ids), offset más allá del total, log sin PII, ciudad ≠ virtual y formato de precio.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://postgrest.prueba.local';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-de-prueba-no-real';
process.env.NEXT_PUBLIC_ALIADAS_IDS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

// Bloque: estado del PostgREST de mentira (cada test lo ajusta).
const estado = {
  rpc: 'ok' as 'ok' | 'ausente' | 'vacio',
  respaldo: false,
  principal: 'ok' as 'ok' | 'uri_larga',
  precios: [] as Array<Record<string, unknown>>
};
const urls: URL[] = [];
const cuerpos: Array<Record<string, unknown>> = [];
const json = (d: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json', ...extra } });
const OF = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const fila = (n: number) => ({ id: OF(n), nombre_oferta: `Oferta ${n}`, activo: true, vigente_desde: '2026-01-01', vigente_hasta: null, programa_id: `p${n}`, programa: { nombre_oficial: `Programa ${n}`, codigo_snies: n === 2 ? '' : `10${n}`, area: { nombre: 'Ingeniería' } } });

globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(String(entrada instanceof Request ? entrada.url : entrada));
  urls.push(url);
  if (url.pathname.endsWith('/rpc/buscar_ofertas_publicas')) {
    cuerpos.push(JSON.parse(String(init?.body || '{}')));
    if (estado.rpc === 'ausente') return json({ code: 'PGRST202', message: 'Could not find the function' }, 404);
    if (estado.rpc === 'vacio') return json([]);
    return json([3, 1, 2].map((n) => ({ oferta_id: OF(n), fue_respaldo_area: estado.respaldo, total_count: 42 })));
  }
  if (url.pathname.endsWith('/ciudades')) return json([{ id: 'c-bogota' }]);
  if (url.pathname.endsWith('/modalidades')) return json([{ id: 'm-virtual' }]);
  if (url.pathname.endsWith('/areas_conocimiento')) return json([{ id: 'a-ing' }]);
  if (url.pathname.endsWith('/precios_oferta')) return json(estado.precios);
  if (url.pathname.endsWith('/ofertas_academicas')) {
    if (estado.principal === 'uri_larga') return json({ code: null, message: 'URI too long' }, 414);
    return json([fila(1), fila(2), fila(3)], 200, { 'content-range': '0-2/3' });
  }
  return json([]);
}) as typeof fetch;

const { obtenerOfertas, argumentosRpc, esModalidadVirtual, ciudadAplica, textoPrecio, elegirPrecio, ETIQUETAS_PERIODICIDAD } = await import('./ofertas');

const reiniciar = () => { urls.length = 0; cuerpos.length = 0; estado.rpc = 'ok'; estado.respaldo = false; estado.principal = 'ok'; estado.precios = []; };

test('S5/S6 · RPC mock: args (texto AND, ciudad id, límite ≤200), orden de la RPC y total_count', async () => {
  reiniciar();
  const r = await obtenerOfertas({ programa_o_area: 'Ingeniería Sistemas', modalidad: 'virtual', ciudad: 'Bogotá' }, 0, 500, { terminosTodos: ['Ingeniería', 'Sistemas'] });
  assert.equal(r.ok, true);
  assert.deepEqual(cuerpos[0], { p_texto: 'Ingeniería Sistemas', p_modalidad: 'virtual', p_ciudad_id: 'c-bogota', p_nivel: null, p_area_id: null, p_limit: 200, p_offset: 0 });
  assert.deepEqual(r.ofertas.map((o) => o.id), [OF(3), OF(1), OF(2)]);
  assert.equal(r.total, 42);
  assert.equal(r.ok && r.fue_respaldo_area, false);
  // Detalle con in() de los ids de la RPC (URL corta).
  const det = urls.find((u) => u.pathname.endsWith('/ofertas_academicas'))!;
  assert.match(det.searchParams.get('id') || '', /^in\./);
});

test('S5 · fue_respaldo_area de la RPC llega al resultado', async () => {
  reiniciar();
  estado.respaldo = true;
  const r = await obtenerOfertas({ programa_o_area: 'antropologia' });
  assert.equal(r.ok && r.fue_respaldo_area, true);
});

test('offset más allá del total: 0 filas sin total_count → ok, total 0, sin error', async () => {
  reiniciar();
  estado.rpc = 'vacio';
  const r = await obtenerOfertas({ programa_o_area: 'psicologia' }, 9, 20);
  assert.equal(r.ok, true);
  assert.equal(r.total, 0);
  assert.equal(r.hasMore, false);
  assert.deepEqual(r.ofertas, []);
});

test('RPC ausente → log rpc_ausente y fallback PostgREST con !inner, sin listas largas de programa_id', async () => {
  reiniciar();
  estado.rpc = 'ausente';
  const logs: string[] = [];
  const original = console.error;
  console.error = (m: string) => logs.push(m);
  try {
    const r = await obtenerOfertas({ programa_o_area: 'ingeniería', ciudad: 'Bogotá', modalidad: 'presencial' });
    assert.equal(r.ok, true);
  } finally { console.error = original; }
  assert.ok(logs.some((l) => JSON.parse(l).evento === 'rpc_ausente'));
  const u = urls.find((x) => x.pathname.endsWith('/ofertas_academicas') && x.searchParams.has('programa.or'))!;
  assert.ok(u, 'filtro de texto sobre el programa embebido');
  assert.match(u.searchParams.get('select') || '', /programas_academicos!inner/);
  assert.match(u.searchParams.get('select') || '', /sedes!inner/);
  assert.equal(u.searchParams.get('sede.ciudad_id'), 'in.(c-bogota)');
  assert.ok(!u.searchParams.has('programa_id'));
  assert.ok(u.toString().length < 2000);
});

test('S6 · log del fallo con código, estado y mensaje recortado (sin filtros del usuario)', async () => {
  reiniciar();
  estado.rpc = 'ausente';
  estado.principal = 'uri_larga';
  const logs: string[] = [];
  const original = console.error;
  console.error = (m: string) => logs.push(m);
  try {
    const r = await obtenerOfertas({ programa_o_area: 'secreto123' });
    assert.equal(r.ok, false);
  } finally { console.error = original; }
  const fallo = logs.map((l) => JSON.parse(l)).find((l) => l.evento === 'ofertas_query_failed');
  assert.equal(fallo.status, 414);
  assert.equal(fallo.mensaje, 'URI too long');
  assert.ok(!logs.join(' ').includes('secreto123'));
});

test('S6 · solo «virtual» ignora la ciudad; a distancia / dual / híbrida filtran', () => {
  assert.equal(esModalidadVirtual('virtual'), true);
  assert.equal(esModalidadVirtual('A distancia'), false);
  assert.equal(esModalidadVirtual('Dual'), false);
  assert.equal(ciudadAplica({ ciudad: 'Bogotá', modalidad: 'virtual' }), false);
  assert.equal(ciudadAplica({ ciudad: 'Bogotá', modalidad: 'híbrida' }), true);
  assert.equal(ciudadAplica({ ciudad: 'Bogotá', modalidad: 'A distancia' }), true);
  assert.equal(argumentosRpc({}, {}, null, 999, -5).p_limit, 200);
  assert.equal(argumentosRpc({}, {}, null, 999, -5).p_offset, 0);
});

// Bloque: fixtures de precio (formato final del Orquestador).
const HOY = '2026-10-19';
const base = { moneda: 'COP', estado_validacion: 'validado', es_precio_activo: true, descripcion_condiciones: null, vigente_desde: '2026-01-01', vigente_hasta: null };

test('precio · 3 fixtures (semestral, anual, mensual con «/») + periodo no mapeado', () => {
  assert.equal(textoPrecio(elegirPrecio([{ ...base, valor: '4316000.00', periodicidad: 'semestral' }], HOY)), 'Precio: $4.316.000 COP por semestre');
  assert.equal(textoPrecio(elegirPrecio([{ ...base, valor: 12500000, periodicidad: 'anual' }], HOY)), 'Precio: $12.500.000 COP por año');
  assert.equal(textoPrecio(elegirPrecio([{ ...base, valor: '890000.00', periodicidad: 'mensual/periodo_academico' }], HOY)), 'Precio: $890.000 COP por mes');
  const raro = textoPrecio(elegirPrecio([{ ...base, valor: 1000000, periodicidad: 'periodo_academico' }], HOY));
  assert.equal(raro, 'Precio: $1.000.000 COP');
  assert.doesNotMatch(raro, /\.00(?!\d)|periodo_academico/);
  assert.equal(ETIQUETAS_PERIODICIDAD.semestral, 'por semestre');
  assert.equal(textoPrecio(elegirPrecio([{ ...base, valor: 300000, periodicidad: 'trimestral' }], HOY)), 'Precio: $300.000 COP por trimestre');
  assert.equal(textoPrecio(elegirPrecio([{ ...base, valor: 300000, periodicidad: 'cuatrimestral' }], HOY)), 'Precio: $300.000 COP por cuatrimestre');
  assert.doesNotMatch(raro, /[()]/);
});

test('precio · MARCA:/pendiente/sin filas → T17; se lee aparte y se adjunta a la oferta', async () => {
  assert.equal(textoPrecio(elegirPrecio([{ ...base, valor: 5, periodicidad: 'semestral', descripcion_condiciones: 'MARCA: confirmar' }], HOY)), 'Precio no disponible. Puedes consultarlo con la universidad o con un asesor.');
  assert.equal(textoPrecio(elegirPrecio([], HOY)), 'Precio no disponible. Puedes consultarlo con la universidad o con un asesor.');
  reiniciar();
  estado.precios = [{ ...base, oferta_id: OF(1), valor: '4316000.00', periodicidad: 'semestral' }];
  const r = await obtenerOfertas({});
  const lista = r.ofertas as Array<{ id: string; texto_precio?: string; precio?: { visible: boolean; valor?: number; moneda?: string; periodicidad?: string } }>;
  const o1 = lista.find((o) => o.id === OF(1))!;
  const o2 = lista.find((o) => o.id === OF(2))!;
  assert.equal(o1.texto_precio, 'Precio: $4.316.000 COP por semestre');
  assert.equal(o2.precio?.visible, false);
  // Se exponen ambos: `precio` {valor, moneda, periodicidad} y `texto_precio`.
  assert.deepEqual(o1.precio, { visible: true, valor: 4316000, moneda: 'COP', periodicidad: 'semestral' });
  assert.ok(urls.some((u) => u.pathname.endsWith('/precios_oferta')));
});

test('S14 · codigo_snies se pide en el select y llega a la oferta y al catálogo WA (vacío → sin código)', async () => {
  reiniciar();
  const r = await obtenerOfertas({});
  const u = urls.find((x) => x.pathname.endsWith('/ofertas_academicas'))!;
  assert.match(u.searchParams.get('select') || '', /codigo_snies/);
  const lista = r.ofertas as Array<{ id: string; programa?: { codigo_snies?: string } }>;
  assert.equal(lista.find((o) => o.id === OF(1))?.programa?.codigo_snies, '101');
  assert.equal(lista.find((o) => o.id === OF(2))?.programa?.codigo_snies, undefined);
  const { agruparPorPrograma } = await import('./whatsapp/catalogo-supabase');
  const wa = agruparPorPrograma(r.ofertas);
  assert.equal(wa.find((o) => o.id === OF(1))?.snies, '101');
  assert.equal(wa.find((o) => o.id === OF(2))?.snies, undefined);
});
