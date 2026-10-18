/**
 * E1 · Frontend — Pruebas unitarias de la lógica pura de /admin/ia/multiproveedor.
 *
 * Qué prueba: validación del tope (0, vacío, «sin límite», > 1000, «5,50»), texto de la barra,
 * conteo de impacto («N agentes lo usan; M quedarían sin IA»), persistencia del borrador del
 * asistente (lista blanca, sin campos prohibidos, reanudar, JSON corrupto), reglas de avance
 * del asistente y del botón Encender, traducción de `campo` de la API, respaldos y parámetros.
 * Para qué: que las reglas que QA revisa en pantalla no dependan de la interfaz y no se rompan
 * en silencio. También verifica que el adaptador de ejemplo cumple el protocolo de confirmación.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AVISO_SIN_RESPALDO,
  MOTIVO_TOPE_MAXIMO,
  MOTIVO_TOPE_OBLIGATORIO,
  MOTIVO_UMBRAL,
  MODELO_POR_DEFECTO,
  calcularImpacto,
  campoDesdeApi,
  estadoPanel,
  estadoTope,
  formatoUsd,
  leerNumeroEs,
  porcentajeUsado,
  problemasRespaldos,
  textoBarraTope,
  textoImpacto,
  tieneCampoProhibido,
  validarClave,
  validarParametrosModelo,
  validarTope,
  validarUmbral
} from './logica';
import {
  CLAVE_BORRADOR,
  borradorNuevo,
  borradorParaApi,
  borrarBorrador,
  estadoBotonEncender,
  firmaModelo,
  firmaPrueba,
  guardarBorrador,
  leerBorrador,
  pasoMaximoNavegable,
  puedeIrAPaso,
  textoGuardadoHace,
  type AlmacenBorrador,
  type BorradorAsistente
} from './asistente';
import { clienteEjemplo } from './ejemplo';
import type { AgenteConVersiones } from './tipos';

/* ── Bloque 1 · Tope de gasto (D3, D4, T3). Para qué: nunca «sin límite», máximo USD 1000/día. ── */

function motivo(v: { ok: boolean } & ({ valor: unknown } | { motivo: string })): string | null {
  return 'motivo' in v ? v.motivo : null;
}

test('validarTope rechaza vacío, 0, negativo y «sin límite» con el motivo del contrato', () => {
  assert.equal(motivo(validarTope('')), MOTIVO_TOPE_OBLIGATORIO);
  assert.equal(motivo(validarTope('   ')), MOTIVO_TOPE_OBLIGATORIO);
  assert.equal(motivo(validarTope('0')), MOTIVO_TOPE_OBLIGATORIO);
  assert.equal(motivo(validarTope('0,00')), MOTIVO_TOPE_OBLIGATORIO);
  assert.equal(motivo(validarTope('-3')), MOTIVO_TOPE_OBLIGATORIO);
  for (const t of ['sin límite', 'Sin Limite', 'ilimitado', '∞']) {
    assert.match(motivo(validarTope(t)) ?? '', /No existe la opción «sin límite»/, t);
  }
  assert.match(motivo(validarTope('cinco')) ?? '', /Escribe solo el valor en dólares/);
});

test('validarTope acepta 5, «5,50» y «5.50»; rechaza > 1000 y más de 2 decimales', () => {
  assert.deepEqual(validarTope('5'), { ok: true, valor: 5 });
  assert.deepEqual(validarTope('5,50'), { ok: true, valor: 5.5 });
  assert.deepEqual(validarTope('5.50'), { ok: true, valor: 5.5 });
  assert.deepEqual(validarTope('1000'), { ok: true, valor: 1000 });
  assert.equal(motivo(validarTope('1000,01')), MOTIVO_TOPE_MAXIMO);
  assert.equal(motivo(validarTope('5000')), 'El tope máximo es USD 1000 al día');
  assert.equal(motivo(validarTope('5,555')), 'Usa máximo 2 decimales, por ejemplo 5,50.');
});

test('validarUmbral solo acepta enteros de 1 a 99 %', () => {
  assert.deepEqual(validarUmbral('80'), { ok: true, valor: 80 });
  assert.deepEqual(validarUmbral('80 %'), { ok: true, valor: 80 });
  for (const u of ['0', '100', '', '50,5', 'ochenta']) assert.equal(motivo(validarUmbral(u)), MOTIVO_UMBRAL, u);
});

test('barra del tope: «USD 3,20 de 5,00 (64 %)», % y estado', () => {
  assert.equal(textoBarraTope(3.2, 5), 'USD 3,20 de 5,00 (64 %)');
  assert.equal(formatoUsd(1234.5), '1.234,50');
  assert.equal(porcentajeUsado(1, 0), 0);
  assert.equal(estadoTope(3.2, 5, 80), 'normal');
  assert.equal(estadoTope(4.3, 5, 80), 'alerta');
  assert.equal(estadoTope(1, 5, 80, 2), 'alerta');
  assert.equal(estadoTope(5, 5, 80), 'cortado');
  assert.ok(Number.isNaN(leerNumeroEs('5,5,5')));
});

/* ── Bloque 2 · Impacto (A8, §0.2). Para qué: el diálogo dice exactamente quién queda sin IA. ── */

const AGENTES: AgenteConVersiones[] = [
  {
    id: 'a1', codigo: 'naia_web', nombre: 'NaIA web', version_activa_id: 'v1',
    versiones: [{ id: 'v1', numero_version: 'v7', estado: 'publicada', publicada_en: '2026-10-01T00:00:00Z', despliegue_id: 'm-abacus', respaldos_ids: ['m-xai'], requiere: { json: false, herramientas: false } }]
  },
  {
    id: 'a2', codigo: 'naia_wa', nombre: 'NaIA WhatsApp', version_activa_id: 'v2',
    versiones: [
      { id: 'v2', numero_version: 'v3', estado: 'publicada', publicada_en: '2026-10-01T00:00:00Z', despliegue_id: 'm-xai', respaldos_ids: [], requiere: { json: false, herramientas: false } },
      { id: 'v2b', numero_version: 'v4', estado: 'borrador', publicada_en: null, despliegue_id: 'm-xai', respaldos_ids: [], requiere: { json: false, herramientas: false } }
    ]
  },
  {
    id: 'a3', codigo: 'clasificador', nombre: 'Clasificador', version_activa_id: 'v3',
    versiones: [{ id: 'v3', numero_version: 'v2', estado: 'publicada', publicada_en: '2026-10-01T00:00:00Z', despliegue_id: 'm-xai', respaldos_ids: ['m-openai'], requiere: { json: true, herramientas: false } }]
  }
];
const MODELOS = [
  { id: 'm-abacus', nombre: 'NaIA Abacus', encendido: true },
  { id: 'm-xai', nombre: 'Grok 4', encendido: true },
  { id: 'm-openai', nombre: 'GPT-4.1 mini', encendido: false }
];

test('textoImpacto usa singular y plural del contrato', () => {
  assert.equal(textoImpacto(3, 2), '3 agentes lo usan; 2 quedarían sin IA.');
  assert.equal(textoImpacto(1, 1), '1 agente lo usa; 1 quedaría sin IA.');
  assert.equal(textoImpacto(2, 0), '2 agentes lo usan; 0 quedarían sin IA.');
});

test('calcularImpacto: apagar xAI → 3 lo usan, 2 sin IA, 1 borrador, queda_con correcto', () => {
  const imp = calcularImpacto({ tipo: 'proveedor', id: 'p-xai', nombre: 'xAI' }, ['m-xai'], AGENTES, MODELOS);
  assert.equal(imp.agentes_afectados, 3);
  assert.equal(imp.agentes_sin_ia, 2);
  assert.equal(imp.borradores_afectados, 1);
  assert.equal(imp.mensaje, '3 agentes lo usan; 2 quedarían sin IA.');
  const web = imp.agentes.find((a) => a.agente_id === 'a1')!;
  assert.equal(web.rol, 'respaldo');
  assert.equal(web.queda_con?.despliegue_id, 'm-abacus');
  // El respaldo de OpenAI está apagado: el clasificador queda sin IA.
  assert.equal(imp.agentes.find((a) => a.agente_id === 'a3')!.queda_con, null);
  // Hash estable para el mismo conjunto; distinto si cambia.
  assert.equal(imp.impacto_hash, calcularImpacto(imp.objetivo, ['m-xai'], AGENTES, MODELOS).impacto_hash);
  assert.notEqual(imp.impacto_hash, calcularImpacto(imp.objetivo, ['m-abacus'], AGENTES, MODELOS).impacto_hash);
});

test('calcularImpacto: un modelo que nadie usa no afecta a nadie', () => {
  const imp = calcularImpacto({ tipo: 'despliegue', id: 'm-openai', nombre: 'GPT' }, ['m-nadie'], AGENTES, MODELOS);
  assert.equal(imp.agentes_afectados, 0);
  assert.equal(imp.mensaje, '0 agentes lo usan; 0 quedarían sin IA.');
});

/* ── Bloque 3 · Borrador del asistente (A2). Para qué: reanudar al recargar sin guardar nunca la clave. ── */

function almacenMemoria(): AlmacenBorrador & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => void datos.set(k, v), removeItem: (k) => void datos.delete(k) };
}

/** Borrador con los pasos 1–3 completos (proveedor creado, clave guardada, modelo guardado). */
function borradorListo(): BorradorAsistente {
  const b = borradorNuevo();
  b.proveedor_codigo = 'xai';
  b.proveedor_id = 'p-1';
  b.credencial = { configurada: true, origen: 'vault', actualizada_en: '2026-10-18T10:00:00Z', revocada_en: null };
  b.modelos = { ...MODELO_POR_DEFECTO, nombre: 'Grok 4', modelo: 'grok-4', costo_usd_1k_entrada: '0,003', costo_usd_1k_salida: '0,015' };
  b.despliegue_id = 'm-1';
  b.modelo_guardado_firma = firmaModelo(b);
  return b;
}

test('guardar y leer el borrador: reanuda en el mismo paso con «Guardado hace N s»', () => {
  const alm = almacenMemoria();
  const b = { ...borradorListo(), paso: 'probar' as const };
  const guardado = guardarBorrador(alm, b, 1_000_000);
  assert.equal(guardado.guardado_en, 1_000_000);
  const leido = leerBorrador(alm)!;
  assert.equal(leido.paso, 'probar');
  assert.equal(leido.proveedor_id, 'p-1');
  assert.equal(textoGuardadoHace(leido.guardado_en, 1_005_400), 'Guardado hace 5 s');
  assert.equal(textoGuardadoHace(leido.guardado_en, 1_000_000 + 3 * 60_000), 'Guardado hace 3 min');
  assert.equal(textoGuardadoHace(null, 0), 'Sin guardar todavía');
  borrarBorrador(alm);
  assert.equal(leerBorrador(alm), null);
});

test('el borrador guarda solo la lista blanca: nunca clave/api_key/token', () => {
  const alm = almacenMemoria();
  const sucio = { ...borradorListo(), clave: 'sk-secreto-123', api_key: 'x', token: 'y' } as unknown as BorradorAsistente;
  guardarBorrador(alm, sucio, 1);
  const crudo = alm.datos.get(CLAVE_BORRADOR)!;
  assert.ok(!crudo.includes('sk-secreto-123'));
  assert.equal(tieneCampoProhibido(JSON.parse(crudo)), false);
  assert.equal(tieneCampoProhibido(borradorParaApi(sucio).borrador), false);
  assert.equal(borradorParaApi(sucio).paso, 1);
  assert.equal('guardado_en' in borradorParaApi(sucio).borrador, false);
  assert.equal(tieneCampoProhibido({ a: [{ Password: 1 }] }), true);
});

test('borrador corrupto, de otra versión o con paso inalcanzable', () => {
  const alm = almacenMemoria();
  alm.setItem(CLAVE_BORRADOR, '{no es json');
  assert.equal(leerBorrador(alm), null);
  alm.setItem(CLAVE_BORRADOR, JSON.stringify({ version: 2 }));
  assert.equal(leerBorrador(alm), null);
  // Guardado en «encender» pero sin clave → vuelve al primer paso pendiente (clave).
  const b = { ...borradorListo(), credencial: null, paso: 'encender' as const };
  alm.setItem(CLAVE_BORRADOR, JSON.stringify(b));
  assert.equal(leerBorrador(alm)!.paso, 'clave');
});

/* ── Bloque 4 · Avance del asistente y botón Encender (P1, A7). ── */

test('no se puede saltar pasos: sin proveedor solo «Elegir»', () => {
  const b = borradorNuevo();
  assert.equal(pasoMaximoNavegable(b), 0);
  assert.equal(puedeIrAPaso('clave', b), false);
  b.proveedor_codigo = 'xai';
  assert.equal(puedeIrAPaso('clave', b), false, 'falta crear el proveedor (P3)');
  b.proveedor_id = 'p-1';
  assert.equal(puedeIrAPaso('clave', b), true);
  assert.equal(puedeIrAPaso('modelos', b), false);
});

test('«Otro compatible» exige URL https válida', () => {
  const b = { ...borradorNuevo(), proveedor_codigo: 'otro_compatible', proveedor_id: 'p-9', url_base: 'http://inseguro.test' };
  assert.equal(puedeIrAPaso('clave', b), false);
});

test('Encender: deshabilitado con «Primero prueba la conexión» hasta una prueba vigente', () => {
  const b = borradorListo();
  assert.equal(puedeIrAPaso('encender', b), true, 'el paso se ve; lo que se bloquea es el botón');
  assert.deepEqual(estadoBotonEncender(b), { habilitado: false, motivo: 'Primero prueba la conexión' });
  b.prueba = { exitosa: false, latencia_ms: 900, modelo_respondio: null, motivo_codigo: 'autenticacion', motivo: 'Clave inválida', que_hacer: 'Revisa la clave', probado_en: '2026-10-18T10:01:00Z' };
  b.prueba_firma = firmaPrueba(b);
  assert.equal(estadoBotonEncender(b).habilitado, false, 'una prueba fallida no habilita');
  b.prueba = { ...b.prueba, exitosa: true, modelo_respondio: 'grok-4', motivo_codigo: null, motivo: null, que_hacer: null };
  assert.deepEqual(estadoBotonEncender(b), { habilitado: true });
  // Cambiar el modelo o reemplazar la clave invalida la prueba.
  const otroModelo = { ...b, modelos: { ...b.modelos, temperatura: '0,9' } };
  assert.equal(estadoBotonEncender(otroModelo).habilitado, false);
  const otraClave = { ...b, credencial: { ...b.credencial!, actualizada_en: '2026-10-18T11:00:00Z' } };
  assert.equal(estadoBotonEncender(otraClave).habilitado, false);
});

/* ── Bloque 5 · Formularios: errores por campo (API → campo), parámetros, clave, respaldos, estado. ── */

test('campoDesdeApi traduce el `campo` del contrato al campo del formulario', () => {
  assert.equal(campoDesdeApi('parametros.temperature'), 'temperatura');
  assert.equal(campoDesdeApi('precios.salida_usd_1k'), 'costo_usd_1k_salida');
  assert.equal(campoDesdeApi('abacus.referencia_secreto'), 'abacus_referencia');
  assert.equal(campoDesdeApi('tope_diario_usd'), 'tope_diario_usd');
  assert.equal(campoDesdeApi('desconocido'), null);
  assert.equal(campoDesdeApi(undefined), null);
});

test('validarParametrosModelo: obligatorios, rangos, enteros y nombres de env de Abacus', () => {
  const vacio = validarParametrosModelo({ ...MODELO_POR_DEFECTO }, { esAbacus: false });
  assert.ok(vacio.nombre && vacio.modelo && vacio.costo_usd_1k_entrada && vacio.costo_usd_1k_salida);
  assert.equal(vacio.temperatura, undefined, 'los valores por defecto son válidos');
  const malo = validarParametrosModelo({ ...MODELO_POR_DEFECTO, nombre: 'x', modelo: 'grok-4', temperatura: '3', max_tokens: '10,5', timeout_ms: '500', costo_usd_1k_entrada: '0', costo_usd_1k_salida: '0' }, { esAbacus: false });
  assert.equal(malo.temperatura, 'Debe estar entre 0 y 2.');
  assert.match(malo.max_tokens ?? '', /entero/);
  assert.equal(malo.timeout_ms, 'Debe estar entre 1.000 y 60.000.');
  const abacus = validarParametrosModelo({ ...MODELO_POR_DEFECTO, nombre: 'NaIA', costo_usd_1k_entrada: '0', costo_usd_1k_salida: '0', abacus_identificador: 'OTRA_VAR', abacus_referencia: 'LLM_X' }, { esAbacus: true });
  assert.match(abacus.abacus_identificador ?? '', /LLM_ o ABACUS_NAIA_/);
  assert.equal(abacus.abacus_referencia, undefined);
  assert.equal(abacus.modelo, undefined, 'en Abacus el modelo es opcional');
});

test('validarClave: forma mínima, sin espacios', () => {
  assert.equal('motivo' in validarClave(''), true);
  assert.equal('motivo' in validarClave('sk 123 456'), true);
  assert.equal('motivo' in validarClave('corta'), true);
  assert.deepEqual(validarClave('  xai-abcdefgh123  '), { ok: true, valor: 'xai-abcdefgh123' });
});

test('problemasRespaldos: máximo 5, repetidos, no disponibles e incompatibles (B3)', () => {
  const disp = [
    { id: 'm1', nombre: 'Grok 4', capacidades: { json: true, herramientas: true } },
    { id: 'm2', nombre: 'Haiku', capacidades: { json: false, herramientas: true } }
  ];
  const sinJson = { json: false, herramientas: false };
  assert.deepEqual(problemasRespaldos(sinJson, 'm1', [], disp), []);
  assert.deepEqual(problemasRespaldos(sinJson, 'm1', ['m2'], disp), []);
  assert.match(problemasRespaldos({ json: true, herramientas: false }, 'm1', ['m2'], disp)[0], /no soporta modo JSON/);
  assert.match(problemasRespaldos(sinJson, 'm1', ['m1'], disp)[0], /repite/);
  assert.match(problemasRespaldos(sinJson, 'm1', ['m9'], disp)[0], /no está encendido y probado/);
  assert.match(problemasRespaldos(sinJson, null, ['m1', 'm2', 'm1', 'm2', 'm1', 'm2'], disp)[0], /máximo 5/);
  assert.equal(AVISO_SIN_RESPALDO, 'Sin respaldo: si el modelo falla, NaIA pasa a una persona');
});

test('estadoPanel sigue el orden del contrato (error > encendido > probado > configurado > borrador)', () => {
  const base = { claveConfigurada: true, tieneModelos: true, pruebaVigenteExitosa: true, ultimaPruebaFallo: false, circuitoAbierto: false, encendido: true };
  assert.equal(estadoPanel(base), 'encendido');
  assert.equal(estadoPanel({ ...base, circuitoAbierto: true }), 'error');
  assert.equal(estadoPanel({ ...base, ultimaPruebaFallo: true }), 'error');
  assert.equal(estadoPanel({ ...base, encendido: false }), 'probado');
  assert.equal(estadoPanel({ ...base, encendido: false, pruebaVigenteExitosa: false }), 'configurado');
  assert.equal(estadoPanel({ ...base, encendido: false, pruebaVigenteExitosa: false, tieneModelos: false }), 'borrador');
});

/* ── Bloque 6 · Adaptador de ejemplo: mismo protocolo que la API (P10, T3). ── */

test('ejemplo: apagar xAI pide confirmación con impacto y exige el impacto_hash', async () => {
  assert.equal(clienteEjemplo.esEjemplo, true);
  const sin = await clienteEjemplo.apagarProveedor('p-xai', { confirmar: false });
  assert.equal(sin.tipo, 'error');
  if (sin.tipo !== 'error') return;
  assert.equal(sin.http, 409);
  assert.equal(sin.codigo, 'confirmacion_requerida');
  assert.equal(sin.impacto?.mensaje, '3 agentes lo usan; 2 quedarían sin IA.');
  const malo = await clienteEjemplo.apagarProveedor('p-xai', { confirmar: true, impacto_hash: 'otro' });
  assert.equal(malo.tipo === 'error' && malo.codigo, 'impacto_cambio');
});

test('ejemplo: el tope rechaza 0 y > 1000 con el campo y el mensaje de T3', async () => {
  const cero = await clienteEjemplo.guardarTope('web', { tope_diario_usd: 0 });
  assert.equal(cero.tipo === 'error' && `${cero.codigo}|${cero.campo}|${cero.mensaje}`, 'tope_invalido|tope_diario_usd|El tope es obligatorio y mayor que 0');
  const alto = await clienteEjemplo.guardarTope('web', { tope_diario_usd: 1500 });
  assert.equal(alto.tipo === 'error' && `${alto.codigo}|${alto.mensaje}`, 'tope_maximo|El tope máximo es USD 1000 al día');
});

/* ── Bloque 7 · Adaptador REAL (fetch) con un `fetch` falso.
 * Para qué: comprobar rutas, 403 → sin permiso, errores HTTP + código + mensaje, y la normalización
 * de nulls que manda la API (2759bc2) sin levantar el servidor. ── */

import { clienteApi } from './api';

type Llamada = { url: string; metodo: string; body: unknown };
function fetchFalso(respuestas: Array<{ status: number; json: unknown }>): Llamada[] {
  const llamadas: Llamada[] = [];
  let i = 0;
  (globalThis as { fetch: unknown }).fetch = async (url: string, init: { method: string; body?: string }) => {
    llamadas.push({ url, metodo: init.method, body: init.body ? JSON.parse(init.body) : undefined });
    const r = respuestas[Math.min(i++, respuestas.length - 1)];
    return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.json } as unknown as Response;
  };
  return llamadas;
}

test('api real: 403 → sin_permiso y error con código + mensaje + campo', async () => {
  fetchFalso([{ status: 403, json: { ok: false, error: 'forbidden', mensaje: 'No tienes permiso para esta sección.' } }]);
  assert.deepEqual(await clienteApi.listarProveedores(), { tipo: 'sin_permiso' });
  const llamadas = fetchFalso([{ status: 400, json: { ok: false, error: 'tope_maximo', mensaje: 'El tope máximo es USD 1000 al día', campo: 'tope_diario_usd' } }]);
  const r = await clienteApi.guardarTope('whatsapp', { tope_diario_usd: 5000 });
  assert.equal(llamadas[0].url, '/api/admin/ia/topes/whatsapp');
  assert.equal(llamadas[0].metodo, 'PUT');
  assert.deepEqual(llamadas[0].body, { tope_diario_usd: 5000 });
  assert.equal(r.tipo === 'error' && `${r.http}|${r.codigo}|${r.campo}|${r.mensaje}`, '400|tope_maximo|tope_diario_usd|El tope máximo es USD 1000 al día');
});

test('api real: un mensaje crudo de BD en `error` nunca se usa como código', async () => {
  fetchFalso([{ status: 500, json: { ok: false, error: 'duplicate key value violates unique constraint "x"' } }]);
  const r = await clienteApi.listarAgentes();
  assert.equal(r.tipo === 'error' && r.codigo, 'http_500');
});

test('api real: proveedor recién creado sin clave y bitácora sin actor quedan normalizados', async () => {
  fetchFalso([{ status: 201, json: { ok: true, item: { id: 'p1', nombre: 'xAI', clave: null } } }]);
  const c = await clienteApi.crearProveedor({ preset_codigo: 'xai' });
  assert.equal(c.tipo === 'ok' && c.datos.clave.configurada, false);
  fetchFalso([{ status: 200, json: { ok: true, item: { id: 'p1', clave: null, bitacora: [{ accion: 'clave_guardar', actor: null, creado_en: '2026-10-18T10:00:00Z' }] } } }]);
  const d = await clienteApi.obtenerProveedor('p1');
  assert.equal(d.tipo === 'ok' && d.datos.bitacora[0].actor.nombre, 'Sistema');
  assert.deepEqual(d.tipo === 'ok' && d.datos.modelos, []);
});

test('api real: apagar con confirmación manda el impacto_hash y devuelve el impacto del 409', async () => {
  const impacto = { mensaje: '3 agentes lo usan; 2 quedarían sin IA.', impacto_hash: 'h1' };
  const llamadas = fetchFalso([{ status: 409, json: { ok: false, error: 'confirmacion_requerida', mensaje: 'Revisa el impacto y confirma.', impacto } }]);
  const r = await clienteApi.apagarProveedor('p-x', { confirmar: false });
  assert.equal(llamadas[0].url, '/api/admin/ia/proveedores/p-x/apagar');
  assert.equal(r.tipo === 'error' && r.impacto?.impacto_hash, 'h1');
  const l2 = fetchFalso([{ status: 200, json: { ok: true, item: { id: 'p-x', encendido: false }, aplica_en_s: 60 } }]);
  const ok = await clienteApi.apagarProveedor('p-x', { confirmar: true, impacto_hash: 'h1' });
  assert.deepEqual(l2[0].body, { confirmar: true, impacto_hash: 'h1' });
  assert.equal(ok.tipo === 'ok' && ok.datos.encendido, false);
});

test('api real: T1 rellena cifras null y T6 marca la alerta', async () => {
  fetchFalso([{ status: 200, json: { ok: true, items: [{ canal_codigo: 'web', canal_nombre: 'NaIA web', tope_diario_usd: null, gasto_usd: null, estado: null }] } }]);
  const t = await clienteApi.listarTopes();
  assert.equal(t.tipo === 'ok' && `${t.datos[0].tope_diario_usd}|${t.datos[0].gasto_usd}|${t.datos[0].estado}`, '0|0|normal');
  const l = fetchFalso([{ status: 200, json: { ok: true, item: { id: 'al-1', vista: true }, sin_cambios: true } }]);
  const v = await clienteApi.marcarAlertaVista('al-1');
  assert.equal(l[0].url, '/api/admin/ia/alertas/al-1/vista');
  assert.equal(v.tipo === 'ok' && v.datos.sin_cambios, true);
});

/* ── Bloque 8 · Punto de cambio: la API real por defecto; el ejemplo nunca en producción. ── */

import { clienteAdminIa, usarAdaptadorDeEjemplo } from './cliente';

test('cliente: por defecto usa la API real y se niega a usar el ejemplo en producción', () => {
  assert.equal(clienteAdminIa.esEjemplo, false);
  const antes = process.env.NODE_ENV;
  (process.env as Record<string, string>).NODE_ENV = 'production';
  assert.throws(() => usarAdaptadorDeEjemplo(clienteEjemplo), /prohibido_en_produccion/);
  assert.equal(clienteAdminIa.esEjemplo, false);
  (process.env as Record<string, string | undefined>).NODE_ENV = antes;
  assert.throws(() => usarAdaptadorDeEjemplo(clienteApi), /solo_adaptador_de_ejemplo/);
});
