/**
 * Eventos de negocio · fila de `eventos_negocio` y cliente que envía a POST /api/eventos.
 *
 * Qué prueba (sin red ni BD):
 *   1. `construirFilaEvento` traduce tipo_evento → evento, metadata → metadatos y pone creado_en y
 *      generado_por; nunca envía `fecha_evento`, `tipo_evento` ni `metadata` (no existen → PGRST204).
 *   2. Todas las claves de la fila están en la lista de columnas reales de las migraciones.
 *   3. `trackEvent` hace POST a /api/eventos (keepalive) y ya NO llama a /rest/v1 con la clave anon.
 *   4. `trackEvent` se traga errores de red y respuestas no 2xx (nunca lanza).
 * Para qué: que el tracking de Explorar/NaIA no vuelva a perder eventos por columnas viejas ni por RLS.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

// Columnas reales de public.eventos_negocio (migraciones 20260830103000 y 20261018160000 + diccionario).
const COLUMNAS_REALES = new Set([
  'id', 'evento', 'persona_id', 'oportunidad_id', 'universidad_id', 'programa_id', 'oferta_id',
  'metadatos', 'generado_por', 'creado_en', 'visitante_id'
]);

// Navegador mínimo: getCurrentVisitorId lee window + localStorage.
const VISITANTE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
(globalThis as any).window = {};
(globalThis as any).localStorage = { getItem: () => VISITANTE, setItem: () => {}, removeItem: () => {} };

// Fetch de mentira: guarda método, URL, init y cuerpo; el modo cambia la respuesta.
let modo: 'ok' | 'error_red' | 'http_500' = 'ok';
const peticiones: { metodo: string; url: string; init?: RequestInit; cuerpo: unknown }[] = [];
globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  peticiones.push({ metodo: init?.method ?? 'GET', url: String(entrada), init, cuerpo: init?.body ? JSON.parse(String(init.body)) : null });
  if (modo === 'error_red') throw new TypeError('Failed to fetch');
  return new Response(null, { status: modo === 'http_500' ? 500 : 204 });
}) as typeof fetch;

const { construirFilaEvento, trackEvent, trackSearchIntention, RUTA_EVENTOS } = await import('./events');

test('eventos: la fila usa evento/metadatos/creado_en/generado_por y no las columnas inexistentes', () => {
  const ahora = new Date('2026-10-18T14:00:00Z');
  const fila = construirFilaEvento(VISITANTE, { tipo_evento: 'ficha_oferta_abierta', oferta_id: 'o1', metadata: { filtro: 'ciudad' } }, ahora, 'web');
  assert.deepEqual(fila, {
    visitante_id: VISITANTE,
    evento: 'ficha_oferta_abierta',
    oferta_id: 'o1',
    programa_id: null,
    universidad_id: null,
    metadatos: { filtro: 'ciudad' },
    generado_por: 'web',
    creado_en: '2026-10-18T14:00:00.000Z'
  });
  for (const vieja of ['fecha_evento', 'tipo_evento', 'metadata']) assert.equal(vieja in fila, false, `no debe enviar ${vieja}`);
  for (const clave of Object.keys(fila)) assert.ok(COLUMNAS_REALES.has(clave), `columna inexistente: ${clave}`);
});

// Bloque: sin metadata se envía {} (metadatos es jsonb NOT NULL); null rompería el insert.
test('eventos: sin metadata, metadatos = {} y no null; generado_por por defecto null', () => {
  const fila = construirFilaEvento('v-1', { tipo_evento: 'busqueda' } as any, new Date('2026-10-18T10:00:00Z'));
  assert.deepEqual(fila.metadatos, {});
  assert.equal(fila.generado_por, null);
});

test('eventos: trackEvent hace POST a /api/eventos con keepalive y sin tocar /rest/v1', async () => {
  modo = 'ok';
  peticiones.length = 0;
  await trackEvent({ tipo_evento: 'ficha_oferta_abierta', oferta_id: 'o2', programa_id: 'p2', universidad_id: undefined });
  assert.equal(peticiones.length, 1);
  const [p] = peticiones;
  assert.equal(RUTA_EVENTOS, '/api/eventos');
  assert.equal(p.metodo, 'POST');
  assert.equal(p.url, '/api/eventos');
  assert.doesNotMatch(p.url, /\/rest\/v1/);
  assert.equal(p.init?.keepalive, true);
  // Sin clave anon ni Authorization en la petición del navegador.
  const cabeceras = new Headers(p.init?.headers);
  assert.equal(cabeceras.has('apikey'), false);
  assert.equal(cabeceras.has('authorization'), false);
  // Cuerpo = contrato del endpoint: sin creado_en/generado_por (los pone el servidor) y sin ids vacíos.
  assert.deepEqual(p.cuerpo, { evento: 'ficha_oferta_abierta', visitante_id: VISITANTE, oferta_id: 'o2', programa_id: 'p2' });
});

test('eventos: trackSearchIntention recorta la intención a 500 caracteres (tope del servidor)', async () => {
  modo = 'ok';
  peticiones.length = 0;
  trackSearchIntention('a'.repeat(900));
  await new Promise((r) => setImmediate(r));
  const cuerpo = peticiones[0].cuerpo as { evento: string; metadatos: { intencion: string } };
  assert.equal(cuerpo.evento, 'intencion_busqueda_enviada');
  assert.equal(cuerpo.metadatos.intencion.length, 500);
});

test('eventos: trackEvent nunca lanza (error de red o HTTP 500)', async () => {
  const avisos = console.warn;
  console.warn = () => {};
  try {
    for (const m of ['error_red', 'http_500'] as const) {
      modo = m;
      await assert.doesNotReject(trackEvent({ tipo_evento: 'naia_modal_abierto' }));
    }
  } finally {
    console.warn = avisos;
    modo = 'ok';
  }
});
