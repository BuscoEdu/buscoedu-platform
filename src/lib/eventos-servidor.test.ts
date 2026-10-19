/**
 * POST /api/eventos · validación, cupos y escritura con service role (sin red ni BD).
 *
 * Qué prueba: lista permitida, UUID inválido, metadatos grandes o anidados, campos desconocidos,
 * origen ajeno (403), cupo (429), camino feliz (upsert de visitante + insert con la fila correcta)
 * y fallo de BD → 500 genérico sin detalles.
 * Para qué: que la ruta siga siendo fail-closed y no vuelva a perder eventos ni filtre datos de BD.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crearManejadorEventos, LimitadorVentana, type BdEventos, type ResultadoBd } from './eventos-servidor';
import { EVENTOS_PERMITIDOS } from './eventos-contrato';

const VISITANTE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OFERTA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AHORA = new Date('2026-10-19T10:00:00Z');

// BD de mentira: guarda cada llamada y responde el error configurado por tabla.
function bdFalsa(errores: Partial<Record<string, ResultadoBd['error']>> = {}) {
  const llamadas: { tabla: string; op: string; fila: Record<string, unknown>; opciones?: unknown }[] = [];
  const db: BdEventos = {
    from(tabla) {
      return {
        insert: async (fila) => (llamadas.push({ tabla, op: 'insert', fila }), { error: errores[tabla] ?? null }),
        upsert: async (fila, opciones) => (llamadas.push({ tabla, op: 'upsert', fila, opciones }), { error: errores[tabla] ?? null })
      };
    }
  };
  return { db, llamadas };
}

// Manejador con BD falsa, reloj fijo y log silencioso (los logs se guardan para revisarlos).
function manejador(opts: { errores?: Partial<Record<string, ResultadoBd['error']>>; maxIp?: number; maxVisitante?: number; obtenerDb?: () => BdEventos } = {}) {
  const { db, llamadas } = bdFalsa(opts.errores);
  const logs: unknown[] = [];
  const POST = crearManejadorEventos({
    obtenerDb: opts.obtenerDb ?? (() => db),
    ahora: () => AHORA,
    limitadorIp: new LimitadorVentana(opts.maxIp ?? 100, 60_000),
    limitadorVisitante: new LimitadorVentana(opts.maxVisitante ?? 100, 60_000),
    registrarError: (m, d) => logs.push([m, d])
  });
  return { POST, llamadas, logs };
}

// Petición same-origin por defecto (Origin = Host), como la manda el navegador.
function peticion(cuerpo: unknown, cabeceras: Record<string, string> = {}): Request {
  return new Request('https://buscoedu.test/api/eventos', {
    method: 'POST',
    headers: { host: 'buscoedu.test', origin: 'https://buscoedu.test', 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', ...cabeceras },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)
  });
}

async function codigo(res: Response) {
  return ((await res.json()) as { code: string }).code;
}

test('eventos-servidor: camino feliz → 204, asegura visitante e inserta la fila real', async () => {
  const { POST, llamadas } = manejador();
  const res = await POST(peticion({ evento: 'ficha_oferta_abierta', visitante_id: VISITANTE, oferta_id: OFERTA, programa_id: null, metadatos: { origen: 'explorar' } }));
  assert.equal(res.status, 204);
  assert.equal(llamadas.length, 2);
  assert.deepEqual(llamadas[0], {
    tabla: 'visitantes', op: 'upsert',
    fila: { id: VISITANTE, identificador_navegacion: VISITANTE, primer_acceso_en: AHORA.toISOString(), ultimo_acceso_en: AHORA.toISOString() },
    opciones: { onConflict: 'id', ignoreDuplicates: true }
  });
  assert.deepEqual(llamadas[1], {
    tabla: 'eventos_negocio', op: 'insert',
    fila: {
      visitante_id: VISITANTE, evento: 'ficha_oferta_abierta', oferta_id: OFERTA, programa_id: null, universidad_id: null,
      metadatos: { origen: 'explorar' }, generado_por: 'web', creado_en: '2026-10-19T10:00:00.000Z'
    }
  });
});

test('eventos-servidor: todos los eventos de la lista permitida pasan; sendBeacon (text/plain) también', async () => {
  const { POST } = manejador();
  for (const evento of EVENTOS_PERMITIDOS) {
    const res = await POST(peticion({ evento, visitante_id: VISITANTE }, { 'content-type': 'text/plain;charset=UTF-8' }));
    assert.equal(res.status, 204, evento);
  }
});

test('eventos-servidor: evento fuera de la lista permitida → 400 sin tocar la BD', async () => {
  const { POST, llamadas } = manejador();
  for (const evento of ['filtro_aplicado', 'busqueda', '', 42]) {
    const res = await POST(peticion({ evento, visitante_id: VISITANTE }));
    assert.equal(res.status, 400);
    assert.equal(await codigo(res), 'evento_no_permitido');
  }
  assert.equal(llamadas.length, 0);
});

test('eventos-servidor: visitante o ids que no son UUID → 400', async () => {
  const { POST, llamadas } = manejador();
  let res = await POST(peticion({ evento: 'naia_modal_abierto', visitante_id: 'no-uuid' }));
  assert.equal(res.status, 400);
  assert.equal(await codigo(res), 'visitante_invalido');
  res = await POST(peticion({ evento: 'naia_modal_abierto' }));
  assert.equal(await codigo(res), 'visitante_invalido');
  for (const campo of ['oferta_id', 'programa_id', 'universidad_id']) {
    res = await POST(peticion({ evento: 'ficha_oferta_abierta', visitante_id: VISITANTE, [campo]: "1' or 1=1" }));
    assert.equal(res.status, 400, campo);
    assert.equal(await codigo(res), 'id_invalido');
  }
  assert.equal(llamadas.length, 0);
});

test('eventos-servidor: metadatos grandes, anidados o no objeto → 400', async () => {
  const { POST, llamadas } = manejador();
  const casos: [unknown, string][] = [
    [{ intencion: 'x'.repeat(501) }, 'metadatos_muy_grandes'],
    [Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, 1])), 'metadatos_muy_grandes'],
    [Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`k${i}`, 'y'.repeat(300)])), 'metadatos_muy_grandes'],
    [{ anidado: { a: 1 } }, 'metadatos_invalidos'],
    [{ lista: [1, 2] }, 'metadatos_invalidos'],
    [['a'], 'metadatos_invalidos'],
    ['texto', 'metadatos_invalidos'],
    [{ 'Clave Rara': 1 }, 'metadatos_invalidos']
  ];
  for (const [metadatos, esperado] of casos) {
    const res = await POST(peticion({ evento: 'intencion_busqueda_enviada', visitante_id: VISITANTE, metadatos }));
    assert.equal(res.status, 400);
    assert.equal(await codigo(res), esperado);
  }
  assert.equal(llamadas.length, 0);
});

test('eventos-servidor: campos desconocidos (creado_en, generado_por, persona_id…) → 400', async () => {
  const { POST, llamadas } = manejador();
  for (const extra of [{ creado_en: '2020-01-01' }, { generado_por: 'admin' }, { persona_id: OFERTA }, { tipo_evento: 'x' }]) {
    const res = await POST(peticion({ evento: 'naia_modal_abierto', visitante_id: VISITANTE, ...extra }));
    assert.equal(res.status, 400);
    assert.equal(await codigo(res), 'campo_no_permitido');
  }
  assert.equal(llamadas.length, 0);
});

test('eventos-servidor: JSON roto, cuerpo no objeto o demasiado grande → 400', async () => {
  const { POST } = manejador();
  assert.equal(await codigo(await POST(peticion('{no json'))), 'json_invalido');
  assert.equal(await codigo(await POST(peticion([1, 2]))), 'cuerpo_invalido');
  assert.equal(await codigo(await POST(peticion(null))), 'cuerpo_invalido');
  const grande = JSON.stringify({ evento: 'naia_modal_abierto', visitante_id: VISITANTE, relleno: 'z'.repeat(5000) });
  const res = await POST(peticion(grande));
  assert.equal(res.status, 400);
  assert.equal(await codigo(res), 'cuerpo_muy_grande');
});

test('eventos-servidor: otro origen o sin Origin → 403', async () => {
  const { POST, llamadas } = manejador();
  const cuerpo = { evento: 'naia_modal_abierto', visitante_id: VISITANTE };
  assert.equal((await POST(peticion(cuerpo, { origin: 'https://malicioso.test' }))).status, 403);
  assert.equal((await POST(peticion(cuerpo, { 'sec-fetch-site': 'cross-site' }))).status, 403);
  const sinOrigen = new Request('https://buscoedu.test/api/eventos', { method: 'POST', headers: { host: 'buscoedu.test' }, body: JSON.stringify(cuerpo) });
  assert.equal((await POST(sinOrigen)).status, 403);
  // Detrás del proxy de Vercel vale x-forwarded-host.
  assert.equal((await POST(peticion(cuerpo, { host: 'interno:3000', 'x-forwarded-host': 'buscoedu.test' }))).status, 204);
  assert.equal(llamadas.filter((l) => l.tabla === 'eventos_negocio').length, 1);
});

test('eventos-servidor: cupo por IP y por visitante → 429 con Retry-After', async () => {
  const cuerpo = { evento: 'naia_modal_abierto', visitante_id: VISITANTE };
  const porIp = manejador({ maxIp: 2 });
  assert.equal((await porIp.POST(peticion(cuerpo))).status, 204);
  assert.equal((await porIp.POST(peticion(cuerpo))).status, 204);
  const res = await porIp.POST(peticion(cuerpo));
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '60');
  assert.equal(await codigo(res), 'rate_limited');
  // Otra IP sigue pasando.
  assert.equal((await porIp.POST(peticion(cuerpo, { 'x-forwarded-for': '198.51.100.1' }))).status, 204);

  const porVisitante = manejador({ maxVisitante: 1 });
  assert.equal((await porVisitante.POST(peticion(cuerpo))).status, 204);
  assert.equal((await porVisitante.POST(peticion(cuerpo, { 'x-forwarded-for': '198.51.100.2' }))).status, 429);
});

test('eventos-servidor: fallo de BD o sin service role → 500 genérico, sin detalles', async () => {
  const errorBd = { code: '23503', message: 'insert or update on table "eventos_negocio" violates foreign key constraint secreto' };
  for (const opts of [
    { errores: { eventos_negocio: errorBd } },
    { errores: { visitantes: errorBd } },
    { obtenerDb: () => { throw new Error('Faltan variables de entorno del servidor: SUPABASE_SERVICE_ROLE_KEY'); } }
  ]) {
    const { POST, logs } = manejador(opts);
    const res = await POST(peticion({ evento: 'naia_modal_abierto', visitante_id: VISITANTE }));
    assert.equal(res.status, 500);
    const texto = await res.text();
    assert.deepEqual(JSON.parse(texto), { ok: false, code: 'error_interno', message: 'No se pudo registrar el evento.' });
    assert.doesNotMatch(texto, /23503|foreign|secreto|SERVICE_ROLE/);
    assert.equal(logs.length, 1);
    assert.doesNotMatch(JSON.stringify(logs), /secreto|SERVICE_ROLE/);
  }
});
