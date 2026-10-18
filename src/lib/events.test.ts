/**
 * Eventos de negocio · la fila enviada a `eventos_negocio` usa las columnas reales.
 *
 * Qué prueba (sin red ni BD):
 *   1. `construirFilaEvento` traduce tipo_evento → evento, metadata → metadatos y pone creado_en;
 *      nunca envía `fecha_evento`, `tipo_evento` ni `metadata` (no existen → PGRST204).
 *   2. Todas las claves de la fila están en la lista de columnas reales de las migraciones.
 *   3. `trackEvent` hace el POST a /rest/v1/eventos_negocio con ese cuerpo (fetch de mentira).
 * Para qué: que el tracking del explorador no vuelva a perder eventos por nombres de columna viejos.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

// Configuración falsa (no son secretos reales): el cliente Supabase se crea perezosamente con
// estos valores y la petición cae en el fetch de mentira.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://postgrest.prueba.local';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'clave-de-prueba-no-real';

// Columnas reales de public.eventos_negocio (migraciones 20260830103000 y 20261018160000 + diccionario).
const COLUMNAS_REALES = new Set([
  'id', 'evento', 'persona_id', 'oportunidad_id', 'universidad_id', 'programa_id', 'oferta_id',
  'metadatos', 'generado_por', 'creado_en', 'visitante_id'
]);

// Navegador mínimo: getCurrentVisitorId lee window + localStorage.
const VISITANTE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
(globalThis as any).window = {};
(globalThis as any).localStorage = { getItem: () => VISITANTE, setItem: () => {}, removeItem: () => {} };

// Fetch de mentira: guarda método, URL y cuerpo de cada petición y responde 201 vacío.
const peticiones: { metodo: string; url: string; cuerpo: unknown }[] = [];
globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  peticiones.push({ metodo: init?.method ?? 'GET', url: String(entrada), cuerpo: init?.body ? JSON.parse(String(init.body)) : null });
  return new Response(null, { status: 201 });
}) as typeof fetch;

const { construirFilaEvento, trackEvent } = await import('./events');

test('eventos: la fila usa evento/metadatos/creado_en y no las columnas inexistentes', () => {
  const ahora = new Date('2026-10-18T14:00:00Z');
  const fila = construirFilaEvento(VISITANTE, { tipo_evento: 'filtro_aplicado', oferta_id: 'o1', metadata: { filtro: 'ciudad' } }, ahora);
  assert.deepEqual(fila, {
    visitante_id: VISITANTE,
    evento: 'filtro_aplicado',
    oferta_id: 'o1',
    programa_id: null,
    universidad_id: null,
    metadatos: { filtro: 'ciudad' },
    creado_en: '2026-10-18T14:00:00.000Z'
  });
  for (const vieja of ['fecha_evento', 'tipo_evento', 'metadata']) assert.equal(vieja in fila, false, `no debe enviar ${vieja}`);
  for (const clave of Object.keys(fila)) assert.ok(COLUMNAS_REALES.has(clave), `columna inexistente: ${clave}`);
});

test('eventos: trackEvent hace POST a eventos_negocio con las columnas reales', async () => {
  peticiones.length = 0;
  await trackEvent({ tipo_evento: 'ficha_oferta_abierta', oferta_id: 'o2', programa_id: 'p2', universidad_id: 'u2' });
  assert.equal(peticiones.length, 1);
  const [p] = peticiones;
  assert.equal(p.metodo, 'POST');
  assert.match(p.url, /\/rest\/v1\/eventos_negocio/);
  const cuerpo = p.cuerpo as Record<string, unknown>;
  assert.equal(cuerpo.evento, 'ficha_oferta_abierta');
  assert.equal(cuerpo.visitante_id, VISITANTE);
  assert.equal('fecha_evento' in cuerpo, false);
  assert.equal(typeof cuerpo.creado_en, 'string');
  for (const clave of Object.keys(cuerpo)) assert.ok(COLUMNAS_REALES.has(clave), `columna inexistente: ${clave}`);
});

// Bloque: sin metadata se envía {} (metadatos es jsonb NOT NULL); null rompería el insert.
test('eventos: sin metadata, metadatos = {} y no null', () => {
  const fila = construirFilaEvento('v-1', { tipo_evento: 'busqueda' } as any, new Date('2026-10-18T10:00:00Z'));
  assert.deepEqual(fila.metadatos, {});
});
