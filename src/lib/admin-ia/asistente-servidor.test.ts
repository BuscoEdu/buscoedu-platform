/**
 * F2 (post-QA) · Pruebas de «retomar el asistente desde el servidor».
 * Qué prueban: qué proveedor se retoma (P2), cómo se arma el borrador y el paso desde P4, que
 * el paso del servidor no salte pasos incompletos, que el texto local del mismo proveedor se
 * conserve y la lista de descartados de este navegador.
 * Para qué: criterio «otro navegador, sin localStorage, retoma en el paso 2».
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  borradorDesdeServidor,
  borradorNuevo,
  descartarProveedor,
  elegirProveedorPorRetomar,
  leerDescartados,
  pasoDesdeNumero,
  pruebaVigente,
  type AlmacenBorrador
} from './asistente';
import type { DetalleProveedorApi, ModeloApi } from './tipos';

// Almacén en memoria (equivale a un navegador; uno nuevo = «otro navegador» sin localStorage).
function almacenMemoria(): AlmacenBorrador {
  const datos = new Map<string, string>();
  return { getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v), removeItem: (k) => void datos.delete(k) };
}

const CLAVE_NO = { configurada: false, origen: null, actualizada_en: null, revocada_en: null };
const CLAVE_SI = { configurada: true, origen: 'vault' as const, actualizada_en: '2026-10-18T10:00:00Z', revocada_en: null };

// Detalle P4 de un proveedor recién creado en el paso 1 (P3 deja asistente.paso = 2, sin borrador).
function detalle(extra: Partial<DetalleProveedorApi> = {}): DetalleProveedorApi {
  return {
    id: 'p-or', codigo: 'openrouter', nombre: 'OpenRouter', preset_codigo: 'openrouter', tipo_adaptador: 'openrouter' as DetalleProveedorApi['tipo_adaptador'],
    url_base: 'https://openrouter.ai/api/v1', estado_panel: 'borrador' as DetalleProveedorApi['estado_panel'], encendido: false, clave: CLAVE_NO,
    ultima_prueba: null, salud: { circuito_abierto_hasta: null }, usado_por: { principal: 0, respaldo: 0 }, actualizado_en: '2026-10-18T14:00:00Z',
    modelos: [], bitacora: [], asistente: { paso: 2, completo: false, borrador: null },
    ...extra
  } as DetalleProveedorApi;
}

function modelo(extra: Partial<ModeloApi> = {}): ModeloApi {
  return {
    id: 'm-or', proveedor_id: 'p-or', proveedor_codigo: 'openrouter', nombre: 'OpenRouter · gpt-4o-mini', modelo: 'openai/gpt-4o-mini', encendido: false,
    estado_panel: 'configurado' as ModeloApi['estado_panel'], parametros: { temperature: 0.4, max_tokens: 800, timeout_ms: 20000 },
    capacidades: { json: true, herramientas: false }, precio_vigente: { entrada_usd_1k: 0.00015, salida_usd_1k: 0.0006, version: 'v1', es_estimado: false } as ModeloApi['precio_vigente'],
    ultima_prueba: null, usado_por: { principal: 0, respaldo: 0 }, ...extra
  };
}

test('pasoDesdeNumero: 1–5 → id del paso; fuera de rango o nulo → null', () => {
  assert.equal(pasoDesdeNumero(1), 'elegir');
  assert.equal(pasoDesdeNumero(2), 'clave');
  assert.equal(pasoDesdeNumero(5), 'encender');
  assert.equal(pasoDesdeNumero(0), null);
  assert.equal(pasoDesdeNumero(6), null);
  assert.equal(pasoDesdeNumero(null), null);
  assert.equal(pasoDesdeNumero('2'), null);
});

test('elegirProveedorPorRetomar: apagado, sin completar, con paso, no descartado y el más reciente', () => {
  const lista = [
    { id: 'p-xai', encendido: true, asistente: { paso: 5, completo: true }, actualizado_en: '2026-10-18T15:00:00Z' },
    { id: 'p-viejo', encendido: false, asistente: { paso: 4, completo: false }, actualizado_en: '2026-10-10T10:00:00Z' },
    { id: 'p-or', encendido: false, asistente: { paso: 2, completo: false }, actualizado_en: '2026-10-18T14:00:00Z' },
    { id: 'p-sin-paso', encendido: false, asistente: { paso: null as unknown as number, completo: false }, actualizado_en: '2026-10-18T16:00:00Z' }
  ];
  assert.equal(elegirProveedorPorRetomar(lista), 'p-or');
  assert.equal(elegirProveedorPorRetomar(lista, ['p-or']), 'p-viejo');
  assert.equal(elegirProveedorPorRetomar(lista, ['p-or', 'p-viejo']), null);
  assert.equal(elegirProveedorPorRetomar([]), null);
});

test('CRITERIO F2: otro navegador sin localStorage retoma en el paso 2 (Clave) con el proveedor del servidor', () => {
  const almacen = almacenMemoria();
  const id = elegirProveedorPorRetomar([{ id: 'p-or', encendido: false, asistente: { paso: 2, completo: false }, actualizado_en: '2026-10-18T14:00:00Z' }], leerDescartados(almacen));
  assert.equal(id, 'p-or');
  const b = borradorDesdeServidor(detalle(), null);
  assert.equal(b.paso, 'clave');
  assert.equal(b.proveedor_id, 'p-or');
  assert.equal(b.proveedor_codigo, 'openrouter');
  assert.equal(b.credencial, null);
});

test('el paso del servidor no salta pasos incompletos: dice 4 pero falta la clave → Clave', () => {
  const b = borradorDesdeServidor(detalle({ asistente: { paso: 4, completo: false, borrador: null } }), null);
  assert.equal(b.paso, 'clave');
});

test('con clave y modelo guardados en el servidor, retoma en Probar con el formulario lleno', () => {
  const b = borradorDesdeServidor(detalle({ clave: CLAVE_SI, modelos: [modelo()], asistente: { paso: 4, completo: false, borrador: null } }), null);
  assert.equal(b.paso, 'probar');
  assert.equal(b.despliegue_id, 'm-or');
  assert.equal(b.modelos.modelo, 'openai/gpt-4o-mini');
  assert.equal(b.modelos.temperatura, '0,4');
  assert.equal(b.modelos.costo_usd_1k_entrada, '0,00015');
  assert.equal(pruebaVigente(b), false);
});

test('una prueba exitosa y vigente del servidor habilita Encender; una vencida no', () => {
  const vigente = modelo({ ultima_prueba: { exitosa: true, vigente: true, latencia_ms: 700, modelo_respondio: 'gpt-4o-mini', probado_en: '2026-10-18T14:05:00Z' } });
  const b = borradorDesdeServidor(detalle({ clave: CLAVE_SI, modelos: [vigente], asistente: { paso: 5, completo: false, borrador: null } }), null);
  assert.equal(b.paso, 'encender');
  assert.equal(pruebaVigente(b), true);
  const vencida = modelo({ ultima_prueba: { exitosa: true, vigente: false, latencia_ms: 700, modelo_respondio: 'gpt-4o-mini', probado_en: '2026-10-01T14:05:00Z' } });
  const c = borradorDesdeServidor(detalle({ clave: CLAVE_SI, modelos: [vencida], asistente: { paso: 5, completo: false, borrador: null } }), null);
  assert.equal(pruebaVigente(c), false);
});

test('en el mismo navegador conserva el texto local sin guardar del mismo proveedor; el paso lo da el servidor', () => {
  const local = { ...borradorNuevo(), proveedor_id: 'p-or', proveedor_codigo: 'openrouter', paso: 'elegir' as const };
  local.modelos = { ...local.modelos, nombre: 'Escribiendo…' };
  const b = borradorDesdeServidor(detalle(), local);
  assert.equal(b.paso, 'clave');
  assert.equal(b.modelos.nombre, 'Escribiendo…');
  // Un borrador local de OTRO proveedor no se mezcla.
  const ajeno = { ...borradorNuevo(), proveedor_id: 'p-otro', proveedor_codigo: 'xai' };
  assert.equal(borradorDesdeServidor(detalle(), ajeno).proveedor_codigo, 'openrouter');
});

test('usa asistente.borrador del servidor cuando no hay borrador local', () => {
  const guardado = { ...borradorNuevo(), proveedor_id: 'p-or', proveedor_codigo: 'openrouter', modelos: { ...borradorNuevo().modelos, nombre: 'Desde otro equipo' } };
  const b = borradorDesdeServidor(detalle({ asistente: { paso: 2, completo: false, borrador: guardado as unknown as Record<string, unknown> } }), null);
  assert.equal(b.modelos.nombre, 'Desde otro equipo');
  assert.equal(b.paso, 'clave');
});

test('descartados: se guardan por navegador, sin repetidos, y un JSON dañado no rompe', () => {
  const a = almacenMemoria();
  assert.deepEqual(leerDescartados(a), []);
  descartarProveedor(a, 'p-or');
  descartarProveedor(a, 'p-or');
  descartarProveedor(a, 'p-2');
  assert.deepEqual(leerDescartados(a), ['p-or', 'p-2']);
  a.setItem('buscoedu:e1:asistente-descartados:v1', '{no es json');
  assert.deepEqual(leerDescartados(a), []);
});
