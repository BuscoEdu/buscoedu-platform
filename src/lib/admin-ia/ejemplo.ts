/**
 * E1 · Frontend — Adaptador de DATOS DE EJEMPLO para el panel «IA multiproveedor».
 *
 * ⚠️ DATOS DE EJEMPLO. Nada de este archivo sale de la base de datos ni de un proveedor real.
 *
 * Qué hace: implementa `ClienteAdminIa` EN MEMORIA con el mismo contrato de
 * `docs/backend/README-e1-api.md` (formas, códigos de error, mensajes, confirmación con
 * `impacto_hash`, 409 `primero_prueba_la_conexion`, topes por canal…), con demoras simuladas.
 * Para qué: construir y revisar (QA, capturas) las pantallas mientras Backend implementa la
 * fase 2. Se reemplaza por `api.ts` en `cliente.ts` sin tocar las pantallas.
 *
 * Escenarios para revisar estados (solo este adaptador los entiende), con `?escenario=` en la URL:
 *   vacio → listas vacías · error → la consulta falla (500) · lento → tarda 12 s («Sigue cargando…»)
 *   sin_permiso → responde 403.
 * Prueba de conexión simulada: un modelo cuyo identificador contenga «invalida» falla por clave
 * inválida, «lento» por tiempo agotado y «saldo» por cuenta sin saldo; cualquier otro responde ✓.
 */

import { MOTIVO_LEGIBLE, type TipoErrorLLM } from '../../../lib/agentes/llm/errores';
import { PRESETS_PROVEEDOR, URLS_PERMITIDAS, validarUrlBase } from '../../../lib/agentes/llm/proveedores';
import type { ClienteAdminIa } from './cliente';
import { calcularImpacto, estadoPanel, estadoTope, TEXTO_PRECIO_ESTIMADO, TEXTO_SIN_COSTO } from './logica';
import type {
  AgenteConVersiones,
  AlertaApi,
  CapacidadesApi,
  DetalleProveedorApi,
  ErrorApi,
  EstadoClaveApi,
  EstadoGastoApi,
  EventoBitacora,
  EventoTopeApi,
  Impacto,
  ModeloApi,
  PrecioApi,
  PresetApi,
  ProveedorApi,
  PruebaApi,
  Resultado,
  UltimaPruebaApi
} from './tipos';

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 1 · Escenario, usuario y ayudas.
 * Qué hace: lee `?escenario=`, simula la red y arma errores con la forma del contrato.
 * Para qué: poder ver vacío ≠ error ≠ cargando ≠ sin permiso sin tocar código.
 * ──────────────────────────────────────────────────────────────────────────── */

type Escenario = 'normal' | 'vacio' | 'error' | 'lento' | 'sin_permiso';

function escenario(): Escenario {
  if (typeof window === 'undefined') return 'normal';
  const v = new URLSearchParams(window.location.search).get('escenario');
  return v === 'vacio' || v === 'error' || v === 'lento' || v === 'sin_permiso' ? v : 'normal';
}

/** Quien «hace» los cambios en los datos de ejemplo (en la API real sale de la sesión). */
const ACTOR = { id: 'u-ejemplo', nombre: 'Jhon Bejarano' };

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const ahoraIso = () => new Date().toISOString();

/** Error con la forma del contrato (§0). */
function err(http: number, codigo: string, mensaje: string, extra: Partial<ErrorApi> = {}): ErrorApi {
  return { tipo: 'error', http, codigo, mensaje, ...extra };
}

/** Envuelve una LECTURA con el escenario activo. `vacio` es lo que se devuelve en «vacio». */
async function leer<T>(datos: () => T | ErrorApi, vacio?: T): Promise<Resultado<T>> {
  const e = escenario();
  await esperar(e === 'lento' ? 12000 : 450);
  if (e === 'sin_permiso') return { tipo: 'sin_permiso' };
  if (e === 'error') return err(500, 'error_interno', 'El servidor no respondió (error simulado con datos de ejemplo).');
  if (e === 'vacio' && vacio !== undefined) return { tipo: 'ok', datos: vacio };
  const d = datos();
  return d && typeof d === 'object' && (d as ErrorApi).tipo === 'error' ? (d as ErrorApi) : { tipo: 'ok', datos: d as T };
}

/** Envuelve una ESCRITURA (403 en «sin_permiso»; el resto sigue normal). */
async function escribir<T>(ms: number, f: () => T | ErrorApi): Promise<Resultado<T>> {
  await esperar(ms);
  if (escenario() === 'sin_permiso') return { tipo: 'sin_permiso' };
  const d = f();
  return d && typeof d === 'object' && (d as ErrorApi).tipo === 'error' ? (d as ErrorApi) : { tipo: 'ok', datos: d as T };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 2 · Datos de ejemplo en memoria.
 * Qué hace: 5 proveedores en estados distintos, sus modelos, 3 agentes con versiones, 2 canales
 * con su tope y alertas.
 * Para qué: que la tabla muestre Configurado / Probado / Encendido / Error y que apagar xAI dé
 * «3 agentes lo usan; 2 quedarían sin IA.».
 * ──────────────────────────────────────────────────────────────────────────── */

interface ProveedorInterno {
  id: string;
  codigo: string;
  nombre: string;
  preset_codigo: string;
  url_base: string | null;
  encendido: boolean;
  clave: EstadoClaveApi;
  circuito_abierto_hasta: string | null;
  asistente: { paso: number; completo: boolean; borrador?: Record<string, unknown> | null };
  actualizado_en: string;
}

interface ModeloInterno extends Omit<ModeloApi, 'estado_panel' | 'usado_por'> {}

function preset(codigo: string) {
  const p = PRESETS_PROVEEDOR.find((x) => x.codigo === codigo);
  if (!p) throw new Error(`preset desconocido: ${codigo}`);
  return p;
}

function clave(configurada: boolean, en: string | null, por: string | null): EstadoClaveApi {
  return { configurada, origen: configurada ? 'vault' : null, actualizada_en: en, revocada_en: null, actualizada_por: por };
}

function prueba(exitosa: boolean, ms: number, modelo: string | null, en: string, motivo: string | null = null): UltimaPruebaApi {
  return { exitosa, vigente: exitosa, latencia_ms: ms, modelo_respondio: modelo, motivo, probado_en: en };
}

const CAP = (json: boolean, herramientas: boolean): CapacidadesApi => ({ json, herramientas });
const PARAMS = { temperature: 0.4, max_tokens: 800, timeout_ms: 20000 };

let proveedores: ProveedorInterno[] = [
  { id: 'p-abacus', codigo: 'abacus_ai', nombre: preset('abacus_ai').nombre, preset_codigo: 'abacus_ai', url_base: null, encendido: true, clave: clave(true, '2026-10-02T09:15:00-05:00', 'Jhon Bejarano'), circuito_abierto_hasta: null, asistente: { paso: 5, completo: true }, actualizado_en: '2026-10-02T09:15:00-05:00' },
  { id: 'p-xai', codigo: 'xai', nombre: preset('xai').nombre, preset_codigo: 'xai', url_base: preset('xai').url_base, encendido: true, clave: clave(true, '2026-10-15T16:02:00-05:00', 'Equipo BuscoEdu'), circuito_abierto_hasta: null, asistente: { paso: 5, completo: true }, actualizado_en: '2026-10-15T16:10:00-05:00' },
  { id: 'p-openai', codigo: 'openai', nombre: preset('openai').nombre, preset_codigo: 'openai', url_base: preset('openai').url_base, encendido: false, clave: clave(true, '2026-10-16T11:20:00-05:00', 'Jhon Bejarano'), circuito_abierto_hasta: null, asistente: { paso: 5, completo: false }, actualizado_en: '2026-10-16T11:22:00-05:00' },
  { id: 'p-anthropic', codigo: 'anthropic', nombre: preset('anthropic').nombre, preset_codigo: 'anthropic', url_base: preset('anthropic').url_base, encendido: false, clave: clave(true, '2026-10-17T10:05:00-05:00', 'Equipo BuscoEdu'), circuito_abierto_hasta: null, asistente: { paso: 4, completo: false }, actualizado_en: '2026-10-17T10:06:00-05:00' },
  { id: 'p-google', codigo: 'google', nombre: preset('google').nombre, preset_codigo: 'google', url_base: preset('google').url_base, encendido: false, clave: clave(true, '2026-10-18T08:30:00-05:00', 'Jhon Bejarano'), circuito_abierto_hasta: null, asistente: { paso: 4, completo: false }, actualizado_en: '2026-10-18T08:30:00-05:00' }
];

let modelos: ModeloInterno[] = [
  // Abacus como lo manda la API real (P4, BE 15ab441): `modelo` en null y las referencias del
  // despliegue en `abacus` (solo nombres de variables). El respaldo tiene una referencia sin guardar.
  { id: 'm-abacus-naia', proveedor_id: 'p-abacus', proveedor_codigo: 'abacus_ai', nombre: 'Abacus NaIA', modelo: null, abacus: { identificador_externo: 'ABACUS_NAIA_DEPLOYMENT_ID', referencia_secreto: 'ABACUS_NAIA_DEPLOYMENT_TOKEN' }, encendido: true, parametros: PARAMS, capacidades: CAP(false, false), precio_vigente: { entrada_usd_1k: 0.002, salida_usd_1k: 0.01, version: 'estimado-2026-10', es_estimado: true, modelo: '*' }, ultima_prueba: prueba(true, 612, 'naia', '2026-10-18T07:40:00-05:00') },
  { id: 'm-abacus-respaldo', proveedor_id: 'p-abacus', proveedor_codigo: 'abacus_ai', nombre: 'Abacus NaIA · respaldo', modelo: null, abacus: { identificador_externo: 'ABACUS_NAIA_DEPLOYMENT_ID_RESPALDO', referencia_secreto: null }, encendido: false, parametros: PARAMS, capacidades: CAP(false, false), precio_vigente: null, ultima_prueba: null },
  { id: 'm-xai-grok4', proveedor_id: 'p-xai', proveedor_codigo: 'xai', nombre: 'xAI · grok-4', modelo: 'grok-4', encendido: true, parametros: PARAMS, capacidades: CAP(true, true), precio_vigente: { entrada_usd_1k: 0.003, salida_usd_1k: 0.015, version: '2026-10', es_estimado: false, modelo: 'grok-4' }, ultima_prueba: prueba(true, 820, 'grok-4', '2026-10-18T06:55:00-05:00') },
  { id: 'm-openai-41mini', proveedor_id: 'p-openai', proveedor_codigo: 'openai', nombre: 'OpenAI · gpt-4.1-mini', modelo: 'gpt-4.1-mini', encendido: false, parametros: PARAMS, capacidades: CAP(true, true), precio_vigente: { entrada_usd_1k: 0.0004, salida_usd_1k: 0.0016, version: '2026-10', es_estimado: false, modelo: 'gpt-4.1-mini' }, ultima_prueba: prueba(true, 731, 'gpt-4.1-mini', '2026-10-16T11:22:00-05:00') },
  { id: 'm-anthropic-haiku', proveedor_id: 'p-anthropic', proveedor_codigo: 'anthropic', nombre: 'Anthropic · claude-haiku-4-5', modelo: 'claude-haiku-4-5', encendido: false, parametros: PARAMS, capacidades: CAP(true, true), precio_vigente: null, ultima_prueba: prueba(false, 288, null, '2026-10-17T10:06:00-05:00', MOTIVO_LEGIBLE.autenticacion) },
  { id: 'm-google-flash', proveedor_id: 'p-google', proveedor_codigo: 'google', nombre: 'Gemini · 2.5 flash', modelo: 'gemini-2.5-flash', encendido: false, parametros: PARAMS, capacidades: CAP(true, false), precio_vigente: { entrada_usd_1k: 0.0003, salida_usd_1k: 0.0025, version: '2026-10', es_estimado: false, modelo: 'gemini-2.5-flash' }, ultima_prueba: null }
];

const NINGUNA = CAP(false, false);
let agentes: AgenteConVersiones[] = [
  {
    id: 'ag-naia-web', codigo: 'naia_asesora_educativa', nombre: 'NaIA · Asesora web', version_activa_id: 'v-naia-web-7',
    versiones: [
      { id: 'v-naia-web-7', numero_version: 'v7', estado: 'publicada', publicada_en: '2026-10-10T09:00:00-05:00', despliegue_id: 'm-abacus-naia', respaldos_ids: ['m-xai-grok4'], requiere: NINGUNA },
      { id: 'v-naia-web-6', numero_version: 'v6', estado: 'desactivada', publicada_en: '2026-09-20T09:00:00-05:00', despliegue_id: 'm-abacus-naia', respaldos_ids: [], requiere: NINGUNA }
    ]
  },
  {
    id: 'ag-naia-wa', codigo: 'naia_whatsapp', nombre: 'NaIA · WhatsApp', version_activa_id: 'v-naia-wa-3',
    versiones: [
      { id: 'v-naia-wa-4', numero_version: 'v4', estado: 'borrador', publicada_en: null, despliegue_id: 'm-xai-grok4', respaldos_ids: [], requiere: CAP(true, false) },
      { id: 'v-naia-wa-3', numero_version: 'v3', estado: 'publicada', publicada_en: '2026-10-15T17:00:00-05:00', despliegue_id: 'm-xai-grok4', respaldos_ids: [], requiere: CAP(true, false) }
    ]
  },
  {
    id: 'ag-clasificador', codigo: 'clasificador_intencion', nombre: 'Clasificador de intención', version_activa_id: 'v-clasif-2',
    versiones: [{ id: 'v-clasif-2', numero_version: 'v2', estado: 'publicada', publicada_en: '2026-10-12T10:00:00-05:00', despliegue_id: 'm-xai-grok4', respaldos_ids: ['m-openai-41mini'], requiere: CAP(true, false) }]
  }
];

const bitacora: Record<string, EventoBitacora[]> = {
  'p-xai': [
    { accion: 'probar', actor: { id: 'u2', nombre: 'Equipo BuscoEdu' }, creado_en: '2026-10-18T06:55:00-05:00', valor_nuevo: '✓ 820 ms · respondió grok-4' },
    { accion: 'encender', actor: ACTOR, creado_en: '2026-10-15T16:10:00-05:00', valor_anterior: 'Apagado', valor_nuevo: 'Encendido' },
    { accion: 'editar', actor: ACTOR, creado_en: '2026-10-15T16:04:00-05:00', valor_anterior: { temperature: 0.7 }, valor_nuevo: { temperature: 0.4 } },
    { accion: 'clave_reemplazar', actor: { id: 'u2', nombre: 'Equipo BuscoEdu' }, creado_en: '2026-10-15T16:02:00-05:00' },
    { accion: 'crear', actor: ACTOR, creado_en: '2026-10-15T15:58:00-05:00', valor_nuevo: 'xAI (Grok)' }
  ]
};

interface CanalInterno {
  canal_codigo: string;
  canal_nombre: string;
  tope: number;
  umbral: number;
  gasto: number;
  precio_estimado: boolean;
  intentos_sin_costo: number;
}

let canales: CanalInterno[] = [
  { canal_codigo: 'web', canal_nombre: 'NaIA web', tope: 5, umbral: 80, gasto: 3.2, precio_estimado: true, intentos_sin_costo: 0 },
  { canal_codigo: 'whatsapp', canal_nombre: 'WhatsApp (Demo WApp + WhatsApp real)', tope: 5, umbral: 80, gasto: 4.3, precio_estimado: true, intentos_sin_costo: 2 }
];

const bitacoraTopes: Record<string, EventoTopeApi[]> = {
  web: [
    { campo: 'tope_diario_usd', valor_anterior: 3, valor_nuevo: 5, actor: ACTOR, creado_en: '2026-10-17T18:30:00-05:00' },
    { campo: 'umbral_alerta_pct', valor_anterior: 90, valor_nuevo: 80, actor: ACTOR, creado_en: '2026-10-17T18:30:00-05:00' }
  ],
  whatsapp: []
};

let alertas: AlertaApi[] = [
  { id: 'al-1', canal_codigo: 'whatsapp', tipo: 'umbral', dia_bogota: '2026-10-18', gasto_usd: 4.1, tope_usd: 5, umbral_pct: 80, creado_en: '2026-10-18T07:15:00-05:00', vista_en: null },
  { id: 'al-2', canal_codigo: 'whatsapp', tipo: 'sin_costo', dia_bogota: '2026-10-18', gasto_usd: 4.3, tope_usd: 5, umbral_pct: 80, creado_en: '2026-10-18T07:40:00-05:00', vista_en: null }
];

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 3 · Cálculos derivados (como los haría la API).
 * Qué hace: estado_panel, uso por agentes, impacto y estado de gasto.
 * Para qué: que el adaptador de ejemplo responda con la misma lógica del contrato.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Versiones publicadas activas (lo que ven los estudiantes). */
function publicadas() {
  return agentes.flatMap((a) => a.versiones.filter((v) => v.id === a.version_activa_id));
}

function usadoPor(idsModelos: string[]) {
  const set = new Set(idsModelos);
  const vs = publicadas();
  return {
    principal: vs.filter((v) => v.despliegue_id && set.has(v.despliegue_id)).length,
    respaldo: vs.filter((v) => v.respaldos_ids.some((id) => set.has(id))).length
  };
}

// Como la API: `abacus` solo viaja en modelos de proveedores Abacus (en los demás, sin el campo).
function modeloApi(m: ModeloInterno): ModeloApi {
  const prov = proveedores.find((p) => p.id === m.proveedor_id);
  const { abacus, ...resto } = m;
  return {
    ...resto,
    ...(prov?.preset_codigo === 'abacus_ai' ? { abacus: abacus ?? { identificador_externo: null, referencia_secreto: null } } : {}),
    estado_panel: estadoPanel({
      claveConfigurada: !!prov?.clave.configurada,
      tieneModelos: true,
      pruebaVigenteExitosa: !!m.ultima_prueba?.exitosa && !!m.ultima_prueba?.vigente,
      ultimaPruebaFallo: !!m.ultima_prueba && !m.ultima_prueba.exitosa,
      circuitoAbierto: false,
      encendido: m.encendido
    }),
    usado_por: usadoPor([m.id])
  };
}

function modelosDe(proveedorId: string) {
  return modelos.filter((m) => m.proveedor_id === proveedorId);
}

function proveedorApi(p: ProveedorInterno): ProveedorApi {
  const ms = modelosDe(p.id);
  const ultima = ms.map((m) => m.ultima_prueba).filter((x): x is UltimaPruebaApi => !!x).sort((a, b) => b.probado_en.localeCompare(a.probado_en))[0] ?? null;
  return {
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    preset_codigo: p.preset_codigo,
    tipo_adaptador: preset(p.preset_codigo).tipo_adaptador,
    url_base: p.url_base,
    estado_panel: estadoPanel({
      claveConfigurada: p.clave.configurada,
      tieneModelos: ms.length > 0,
      pruebaVigenteExitosa: ms.some((m) => m.ultima_prueba?.exitosa && m.ultima_prueba.vigente),
      ultimaPruebaFallo: !!ultima && !ultima.exitosa,
      circuitoAbierto: !!p.circuito_abierto_hasta,
      encendido: p.encendido
    }),
    encendido: p.encendido,
    clave: { ...p.clave },
    ultima_prueba: ultima,
    salud: { circuito_abierto_hasta: p.circuito_abierto_hasta },
    modelos: ms.length,
    usado_por: usadoPor(ms.map((m) => m.id)),
    asistente: { paso: p.asistente.paso, completo: p.asistente.completo },
    actualizado_en: p.actualizado_en
  };
}

/** Modelos «encendidos de verdad»: modelo y proveedor encendidos. */
function encendidosReales() {
  return modelos.map((m) => ({ id: m.id, nombre: m.nombre, encendido: m.encendido && !!proveedores.find((p) => p.id === m.proveedor_id)?.encendido }));
}

function impactoDe(objetivo: Impacto['objetivo'], ids: string[]): Impacto {
  return calcularImpacto(objetivo, ids, agentes, encendidosReales());
}

function estadoGasto(c: CanalInterno): EstadoGastoApi {
  const pct = c.tope > 0 ? Math.round((c.gasto / c.tope) * 1000) / 10 : 0;
  const motivos: Array<'umbral' | 'sin_costo'> = [];
  if (pct >= c.umbral) motivos.push('umbral');
  if (c.intentos_sin_costo > 0) motivos.push('sin_costo');
  const avisos = [] as EstadoGastoApi['avisos'];
  if (c.precio_estimado) avisos.push({ codigo: 'precio_estimado', mensaje: TEXTO_PRECIO_ESTIMADO });
  if (c.intentos_sin_costo > 0) avisos.push({ codigo: 'sin_costo', mensaje: TEXTO_SIN_COSTO, accion: 'POST /api/admin/ia/precios' });
  return {
    canal_codigo: c.canal_codigo,
    canal_nombre: c.canal_nombre,
    tope_diario_usd: c.tope,
    umbral_alerta_pct: c.umbral,
    gasto_usd: c.gasto,
    pct_usado: pct,
    estado: estadoTope(c.gasto, c.tope, c.umbral, c.intentos_sin_costo),
    motivos_alerta: motivos,
    precio_estimado: c.precio_estimado,
    intentos_sin_costo: c.intentos_sin_costo,
    dia_bogota: '2026-10-18',
    reinicia_en: '2026-10-19T00:00:00-05:00',
    avisos,
    ayuda: { por_que: 'Evitar facturas sorpresa por errores, bucles o abuso.', para_que: 'Que la IA se detenga sola al llegar al tope y se reanude a las 00:00 de Bogotá.' }
  };
}

/** Agrega un evento a la bitácora de un proveedor (nunca con la clave). */
function anotar(proveedorId: string, accion: string, valor_anterior?: unknown, valor_nuevo?: unknown) {
  (bitacora[proveedorId] ??= []).unshift({ accion, actor: ACTOR, creado_en: ahoraIso(), valor_anterior, valor_nuevo });
}

/** Invalida las pruebas de un proveedor (P5 url, P6 clave). */
function invalidarPruebas(proveedorId: string) {
  modelos = modelos.map((m) => (m.proveedor_id === proveedorId && m.ultima_prueba ? { ...m, ultima_prueba: { ...m.ultima_prueba, vigente: false } } : m));
}

/** «Qué hacer» por motivo (tabla de M4). */
const QUE_HACER: Partial<Record<TipoErrorLLM, string>> = {
  autenticacion: 'Reemplaza la clave.',
  sin_saldo: 'Recarga saldo en el proveedor.',
  servidor: 'Intenta más tarde o revisa la URL.',
  timeout: 'Revisa que la URL esté en línea o sube el timeout.',
  limite_tasa: 'Espera unos minutos.',
  sin_clave: 'Guarda la clave.',
  proveedor_no_permitido: 'Elige un proveedor de la lista.',
  respuesta_invalida: 'Revisa el identificador del modelo.',
  contexto_excedido: 'Revisa el máximo de tokens.',
  politica_contenido: 'Contacta al proveedor.'
};

/** Valida un rango numérico como M2 (`fuera_de_rango` con `campo`). */
function rango(valor: unknown, min: number, max: number, campo: string): ErrorApi | null {
  if (typeof valor !== 'number' || Number.isNaN(valor)) return err(400, 'campo_requerido', 'Este dato es obligatorio.', { campo });
  if (valor < min || valor > max) return err(400, 'fuera_de_rango', `Debe estar entre ${min} y ${max}.`, { campo });
  return null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 4 · Implementación de ejemplo de `ClienteAdminIa` (mismo contrato que la API).
 * Qué hace: cada método simula su endpoint, con sus reglas y sus errores.
 * Para qué: que las pantallas se comporten igual que con la API real.
 * ──────────────────────────────────────────────────────────────────────────── */

export const clienteEjemplo: ClienteAdminIa = {
  esEjemplo: true,

  // P1 · presets (salen del código real de BA-034).
  listarPresets: () =>
    leer<PresetApi[]>(() =>
      PRESETS_PROVEEDOR.map((p) => ({
        codigo: p.codigo,
        nombre: p.nombre,
        tipo_adaptador: p.tipo_adaptador,
        url_base: p.url_base,
        urls_permitidas: [...(URLS_PERMITIDAS[p.tipo_adaptador] ?? [])],
        url_editable: p.codigo === 'otro_compatible',
        variable_env_sugerida: `LLM_${p.codigo.toUpperCase()}_API_KEY`
      }))
    ),

  // P2 · lista de proveedores.
  listarProveedores: () => leer(() => proveedores.map(proveedorApi), []),

  // P3 · crear (apagado). 409 codigo_existente con detalles.id para retomar.
  crearProveedor: (body) =>
    escribir(500, () => {
      const pr = PRESETS_PROVEEDOR.find((p) => p.codigo === body.preset_codigo);
      if (!pr) return err(400, 'preset_invalido', 'Elige un proveedor de la lista.', { campo: 'preset_codigo' });
      const codigo = body.codigo ?? (pr.codigo === 'otro_compatible' ? '' : pr.codigo);
      if (!/^[a-z0-9_]{3,40}$/.test(codigo)) return err(400, 'codigo_invalido', 'El código solo admite minúsculas, números y _ (3 a 40).', { campo: 'codigo' });
      let url = pr.url_base;
      if (pr.codigo === 'otro_compatible') {
        const v = validarUrlBase('openai_compatible', body.url_base);
        if (!v.ok) return err(400, 'url_no_permitida', 'Esa URL no está en la lista permitida. Por seguridad la clave solo se envía a proveedores conocidos.', { campo: 'url_base' });
        url = v.url;
      }
      const existe = proveedores.find((p) => p.codigo === codigo);
      if (existe) return err(409, 'codigo_existente', 'Ya existe un proveedor con ese código.', { campo: 'codigo', detalles: { id: existe.id } });
      const nuevo: ProveedorInterno = { id: `p-${codigo}-${Date.now()}`, codigo, nombre: body.nombre ?? pr.nombre, preset_codigo: pr.codigo, url_base: url, encendido: false, clave: clave(false, null, null), circuito_abierto_hasta: null, asistente: { paso: 2, completo: false }, actualizado_en: ahoraIso() };
      proveedores = [...proveedores, nuevo];
      anotar(nuevo.id, 'crear', undefined, nuevo.nombre);
      return proveedorApi(nuevo);
    }),

  // P4 · detalle con modelos, bitácora y asistente.
  obtenerProveedor: (id) =>
    leer<DetalleProveedorApi>(() => {
      const p = proveedores.find((x) => x.id === id);
      if (!p) return err(404, 'no_encontrado', 'No encontramos ese proveedor.');
      // P4 · `abacus` a nivel proveedor, como BE 15ab441: el primer modelo con alguna referencia
      // (o ambas en null); null en proveedores que no son Abacus.
      const ms = modelosDe(p.id).map(modeloApi);
      const abacus = p.preset_codigo === 'abacus_ai' ? ms.map((m) => m.abacus!).find((r) => r.identificador_externo || r.referencia_secreto) ?? { identificador_externo: null, referencia_secreto: null } : null;
      return { ...proveedorApi(p), abacus, modelos: ms, bitacora: [...(bitacora[p.id] ?? [])].slice(0, 50), asistente: { ...p.asistente } };
    }),

  // P5 · editar (incluye el borrador del asistente; rechaza campos llamados como una clave).
  actualizarProveedor: (id, body) =>
    escribir(250, () => {
      const p = proveedores.find((x) => x.id === id);
      if (!p) return err(404, 'no_encontrado', 'No encontramos ese proveedor.');
      const texto = JSON.stringify(body.asistente?.borrador ?? {});
      if (/"(clave|api_key|token|secret|password)"\s*:/i.test(texto)) return err(400, 'borrador_con_clave', 'La clave no se guarda en el borrador; usa el paso Clave.');
      if (body.asistente) p.asistente = { paso: body.asistente.paso, completo: false, borrador: body.asistente.borrador };
      if (body.nombre) p.nombre = body.nombre;
      return proveedorApi(p);
    }),

  // P6 · guardar o reemplazar la clave. El valor no se guarda en este adaptador ni se devuelve.
  guardarClave: (id, valor) =>
    escribir(600, () => {
      const p = proveedores.find((x) => x.id === id);
      if (!p) return err(404, 'proveedor_inexistente', 'No encontramos ese proveedor.');
      const largo = valor.trim().length;
      if (!largo) return err(400, 'clave_requerida', 'Pega la clave del proveedor.', { campo: 'clave' });
      if (largo < 8 || largo > 4096) return err(400, 'clave_invalida', 'La clave es demasiado corta o demasiado larga.', { campo: 'clave' });
      const reemplaza = p.clave.configurada;
      p.clave = clave(true, ahoraIso(), ACTOR.nombre);
      invalidarPruebas(p.id);
      anotar(p.id, reemplaza ? 'clave_reemplazar' : 'clave_guardar');
      return { clave: { ...p.clave }, advertencias: reemplaza ? [{ codigo: 'probar_de_nuevo', mensaje: 'Cambiaste la clave: prueba la conexión de nuevo.' }] : [] };
    }),

  // P7 · revocar con confirmación + impacto_hash.
  revocarClave: (id, c) =>
    escribir(500, () => {
      const p = proveedores.find((x) => x.id === id);
      if (!p) return err(404, 'proveedor_inexistente', 'No encontramos ese proveedor.');
      if (!p.clave.configurada) return err(409, 'sin_clave_en_vault', 'Este proveedor no tiene una clave guardada en Vault.');
      const imp = impactoDe({ tipo: 'clave', id: p.id, nombre: p.nombre }, modelosDe(p.id).map((m) => m.id));
      if (!c.confirmar) return err(409, 'confirmacion_requerida', 'Revisa el impacto y confirma.', { impacto: imp });
      if (c.impacto_hash !== imp.impacto_hash) return err(409, 'impacto_cambio', 'Cambió lo que se vería afectado. Revisa el aviso otra vez.', { impacto: imp });
      p.clave = { ...clave(false, p.clave.actualizada_en, p.clave.actualizada_por ?? null), revocada_en: ahoraIso() };
      p.encendido = false;
      invalidarPruebas(p.id);
      anotar(p.id, 'clave_revocar');
      return { clave: { ...p.clave } };
    }),

  // P8 · impacto de apagar el proveedor (todos sus modelos).
  impactoProveedor: (id) =>
    escribir(350, () => {
      const p = proveedores.find((x) => x.id === id);
      if (!p) return err(404, 'no_encontrado', 'No encontramos ese proveedor.');
      return impactoDe({ tipo: 'proveedor', id: p.id, nombre: p.nombre }, modelosDe(p.id).map((m) => m.id));
    }),

  // P9 · encender: clave + al menos un modelo con prueba vigente exitosa.
  encenderProveedor: (id) =>
    escribir(500, () => {
      const p = proveedores.find((x) => x.id === id);
      if (!p) return err(404, 'no_encontrado', 'No encontramos ese proveedor.');
      if (!p.clave.configurada) return err(409, 'falta_clave', 'Primero guarda la clave del proveedor.');
      if (!modelosDe(p.id).some((m) => m.ultima_prueba?.exitosa && m.ultima_prueba.vigente)) return err(409, 'primero_prueba_la_conexion', 'Primero prueba la conexión.');
      if (!p.encendido) {
        p.encendido = true;
        anotar(p.id, 'encender', 'Apagado', 'Encendido');
      }
      return proveedorApi(p);
    }),

  // P10 · apagar con confirmación + impacto_hash.
  apagarProveedor: (id, c) =>
    escribir(500, () => {
      const p = proveedores.find((x) => x.id === id);
      if (!p) return err(404, 'no_encontrado', 'No encontramos ese proveedor.');
      if (!p.encendido) return proveedorApi(p);
      const imp = impactoDe({ tipo: 'proveedor', id: p.id, nombre: p.nombre }, modelosDe(p.id).map((m) => m.id));
      if (!c.confirmar) return err(409, 'confirmacion_requerida', 'Revisa el impacto y confirma.', { impacto: imp });
      if (c.impacto_hash !== imp.impacto_hash) return err(409, 'impacto_cambio', 'Cambió lo que se vería afectado. Revisa el aviso otra vez.', { impacto: imp });
      p.encendido = false;
      anotar(p.id, 'apagar', 'Encendido', 'Apagado');
      return proveedorApi(p);
    }),

  // M1 · modelos de un proveedor.
  listarModelos: (proveedorId) => leer(() => modelosDe(proveedorId).map(modeloApi), []),

  // M2 · crear modelo (apagado), con los mismos errores por `campo` del contrato.
  crearModelo: (body) =>
    escribir(600, () => {
      const p = proveedores.find((x) => x.id === body.proveedor_id);
      if (!p) return err(404, 'proveedor_inexistente', 'No encontramos ese proveedor.');
      const esAbacus = p.preset_codigo === 'abacus_ai';
      if (!body.nombre?.trim()) return err(400, 'campo_requerido', 'Este dato es obligatorio.', { campo: 'nombre' });
      if (!esAbacus && !body.modelo?.trim()) return err(400, 'campo_requerido', 'Este dato es obligatorio.', { campo: 'modelo' });
      if (body.modelo && !/^[A-Za-z0-9._:/@-]{1,120}$/.test(body.modelo)) return err(400, 'modelo_invalido', 'El identificador del modelo tiene caracteres no permitidos.', { campo: 'modelo' });
      const r =
        rango(body.parametros?.temperature, 0, 2, 'parametros.temperature') ??
        rango(body.parametros?.max_tokens, 1, 8192, 'parametros.max_tokens') ??
        rango(body.parametros?.timeout_ms, 1000, 60000, 'parametros.timeout_ms');
      if (r) return r;
      for (const campo of ['entrada_usd_1k', 'salida_usd_1k'] as const) {
        const v = body.precios?.[campo];
        if (typeof v !== 'number' || !(v >= 0) || v > 100) return err(400, 'precio_invalido', 'Los precios son obligatorios y no pueden ser negativos.', { campo: `precios.${campo}` });
      }
      const nuevo: ModeloInterno = {
        id: `m-${p.codigo}-${Date.now()}`,
        proveedor_id: p.id,
        proveedor_codigo: p.codigo,
        nombre: body.nombre.trim(),
        // Como la API: sin `modelo` queda en null (Abacus se identifica por su despliegue).
        modelo: body.modelo?.trim() || null,
        abacus: p.preset_codigo === 'abacus_ai' ? { identificador_externo: body.abacus?.identificador_externo ?? null, referencia_secreto: body.abacus?.referencia_secreto ?? null } : undefined,
        encendido: false,
        parametros: { ...body.parametros },
        capacidades: { json: !!body.capacidades?.json, herramientas: !!body.capacidades?.herramientas },
        precio_vigente: { entrada_usd_1k: body.precios.entrada_usd_1k, salida_usd_1k: body.precios.salida_usd_1k, version: `panel-${Date.now()}`, es_estimado: !!body.precios.es_estimado, modelo: body.modelo?.trim() || '*' },
        ultima_prueba: null
      };
      modelos = [...modelos, nuevo];
      anotar(p.id, 'crear', undefined, `Modelo ${nuevo.nombre}`);
      return modeloApi(nuevo);
    }),

  // M3 · editar modelo (cambiar `modelo` invalida la prueba; encendido → 409).
  actualizarModelo: (id, body) =>
    escribir(450, () => {
      const m = modelos.find((x) => x.id === id);
      if (!m) return err(404, 'no_encontrado', 'No encontramos ese modelo.');
      if (body.modelo !== undefined && body.modelo !== m.modelo) {
        if (m.encendido) return err(409, 'apaga_o_crea_otro_modelo', 'Este modelo está en uso. Crea otro modelo y asígnalo al agente con Probar → Publicar.', { campo: 'modelo' });
        m.modelo = body.modelo;
        if (m.ultima_prueba) m.ultima_prueba = { ...m.ultima_prueba, vigente: false };
      }
      if (body.nombre) m.nombre = body.nombre;
      if (body.parametros) {
        const r =
          rango(body.parametros.temperature, 0, 2, 'parametros.temperature') ??
          rango(body.parametros.max_tokens, 1, 8192, 'parametros.max_tokens') ??
          rango(body.parametros.timeout_ms, 1000, 60000, 'parametros.timeout_ms');
        if (r) return r;
        m.parametros = { ...body.parametros };
      }
      if (body.capacidades) m.capacidades = { ...m.capacidades, ...body.capacidades };
      if (body.precios) m.precio_vigente = { entrada_usd_1k: body.precios.entrada_usd_1k, salida_usd_1k: body.precios.salida_usd_1k, version: `panel-${Date.now()}`, es_estimado: !!body.precios.es_estimado, modelo: m.modelo };
      anotar(m.proveedor_id, 'editar', undefined, `Modelo ${m.nombre}`);
      return modeloApi(m);
    }),

  // M4 · probar (200 aunque falle). Funciona con todo apagado.
  probarModelo: (id) =>
    escribir(900, () => {
      const m = modelos.find((x) => x.id === id);
      if (!m) return err(404, 'no_encontrado', 'No encontramos ese modelo.');
      const p = proveedores.find((x) => x.id === m.proveedor_id);
      const falla: TipoErrorLLM | null = !p?.clave.configurada ? 'sin_clave' : /invalida/i.test(m.modelo) ? 'autenticacion' : /lento/i.test(m.modelo) ? 'timeout' : /saldo/i.test(m.modelo) ? 'sin_saldo' : null;
      const pr: PruebaApi = falla
        ? { exitosa: false, latencia_ms: falla === 'timeout' ? 15002 : 310, modelo_respondio: null, motivo_codigo: falla, motivo: MOTIVO_LEGIBLE[falla], que_hacer: QUE_HACER[falla] ?? null, probado_en: ahoraIso() }
        : { exitosa: true, latencia_ms: 640 + ((m.modelo.length * 37) % 400), modelo_respondio: m.modelo, motivo_codigo: null, motivo: null, que_hacer: null, probado_en: ahoraIso() };
      m.ultima_prueba = { exitosa: pr.exitosa, vigente: pr.exitosa, latencia_ms: pr.latencia_ms, modelo_respondio: pr.modelo_respondio, motivo: pr.motivo, probado_en: pr.probado_en };
      anotar(m.proveedor_id, 'probar', undefined, pr.exitosa ? `✓ ${pr.latencia_ms} ms · respondió ${pr.modelo_respondio}` : `✗ ${pr.motivo}`);
      return { prueba: pr, puede_encender: pr.exitosa };
    }),

  // M5 · encender modelo: exige prueba vigente exitosa.
  encenderModelo: (id) =>
    escribir(450, () => {
      const m = modelos.find((x) => x.id === id);
      if (!m) return err(404, 'no_encontrado', 'No encontramos ese modelo.');
      if (!(m.ultima_prueba?.exitosa && m.ultima_prueba.vigente)) return err(409, 'primero_prueba_la_conexion', 'Primero prueba la conexión.');
      m.encendido = true;
      anotar(m.proveedor_id, 'encender', 'Apagado', `Modelo ${m.nombre} encendido`);
      const p = proveedores.find((x) => x.id === m.proveedor_id);
      return { item: modeloApi(m), advertencias: p?.encendido ? [] : [{ codigo: 'proveedor_apagado', mensaje: 'El proveedor está apagado: este modelo no se usará hasta encenderlo.' }] };
    }),

  // M6 · apagar modelo con el mismo protocolo de confirmación.
  apagarModelo: (id, c) =>
    escribir(450, () => {
      const m = modelos.find((x) => x.id === id);
      if (!m) return err(404, 'no_encontrado', 'No encontramos ese modelo.');
      if (!m.encendido) return modeloApi(m);
      const imp = impactoDe({ tipo: 'despliegue', id: m.id, nombre: m.nombre }, [m.id]);
      if (!c.confirmar) return err(409, 'confirmacion_requerida', 'Revisa el impacto y confirma.', { impacto: imp });
      if (c.impacto_hash !== imp.impacto_hash) return err(409, 'impacto_cambio', 'Cambió lo que se vería afectado. Revisa el aviso otra vez.', { impacto: imp });
      m.encendido = false;
      anotar(m.proveedor_id, 'apagar', 'Encendido', `Modelo ${m.nombre} apagado`);
      return modeloApi(m);
    }),

  // M7 · impacto de apagar un modelo.
  impactoModelo: (id) =>
    escribir(350, () => {
      const m = modelos.find((x) => x.id === id);
      if (!m) return err(404, 'no_encontrado', 'No encontramos ese modelo.');
      return impactoDe({ tipo: 'despliegue', id: m.id, nombre: m.nombre }, [m.id]);
    }),

  // M8 · precios (historial y nueva versión).
  listarPrecios: (proveedorId) =>
    leer<PrecioApi[]>(() =>
      modelosDe(proveedorId)
        .filter((m) => m.precio_vigente)
        .map((m) => ({ id: `pr-${m.id}`, modelo: m.precio_vigente!.modelo, version: m.precio_vigente!.version, entrada_usd_1k: m.precio_vigente!.entrada_usd_1k, salida_usd_1k: m.precio_vigente!.salida_usd_1k, es_estimado: m.precio_vigente!.es_estimado, vigente_desde: '2026-10-01T00:00:00-05:00', vigente_hasta: null, fuente: m.precio_vigente!.es_estimado ? 'semilla BA-038' : 'panel' })),
      []
    ),
  registrarPrecio: (body) =>
    escribir(500, () => {
      if (!body.modelo || (body.version !== undefined && !body.version)) return err(400, 'datos_incompletos', 'Modelo y versión son obligatorios.');
      if (!(body.entrada_usd_1k >= 0) || !(body.salida_usd_1k >= 0)) return err(400, 'precio_invalido', 'Los precios son obligatorios y no pueden ser negativos.');
      const ms = modelos.filter((m) => m.proveedor_codigo === body.proveedor_codigo && (body.modelo === '*' || m.modelo === body.modelo));
      if (!ms.length) return err(404, 'proveedor_inexistente', 'No encontramos ese proveedor.');
      ms.forEach((m) => (m.precio_vigente = { entrada_usd_1k: body.entrada_usd_1k, salida_usd_1k: body.salida_usd_1k, version: body.version ?? `panel-${Date.now()}`, es_estimado: body.es_estimado, modelo: body.modelo }));
      canales = canales.map((c) => ({ ...c, intentos_sin_costo: 0 }));
      return { precio_id: `pr-${Date.now()}`, reemplaza_precio_id: null };
    }),

  // Agentes + versiones (rutas existentes en la API real).
  listarAgentes: () => leer(() => agentes.map((a) => ({ ...a, versiones: a.versiones.map((v) => ({ ...v, respaldos_ids: [...v.respaldos_ids] })) })), []),

  // B-1 · modelos encendidos con prueba vigente, de proveedor encendido y con clave.
  modelosDisponibles: (requiere) =>
    leer(() =>
      modelos
        .filter((m) => {
          const p = proveedores.find((x) => x.id === m.proveedor_id);
          return m.encendido && m.ultima_prueba?.exitosa && m.ultima_prueba.vigente && p?.encendido && p.clave.configurada && (requiere ?? []).every((c) => m.capacidades[c]);
        })
        .map((m) => ({ ...modeloApi(m), proveedor_nombre: proveedores.find((x) => x.id === m.proveedor_id)!.nombre })),
      []
    ),

  // B-2 · asignar principal + respaldos (solo borradores).
  asignarModelo: (versionId, body) =>
    escribir(550, () => {
      const a = agentes.find((x) => x.versiones.some((v) => v.id === versionId));
      const v = a?.versiones.find((x) => x.id === versionId);
      if (!a || !v) return err(404, 'no_encontrado', 'No encontramos esa versión.');
      if (v.estado !== 'borrador') return err(409, 'version_inmutable_publicada', 'Esta versión ya está publicada. Duplícala para cambiar el modelo.');
      if (body.respaldos_ids.length > 5) return err(400, 'fuera_de_rango', 'Puedes tener máximo 5 respaldos.', { campo: 'respaldos_ids' });
      const todos = [body.despliegue_id, ...body.respaldos_ids];
      if (new Set(todos).size !== todos.length) return err(400, 'duplicados', 'No repitas modelos en la cadena.', { campo: 'respaldos_ids' });
      const disponibles = encendidosReales().filter((m) => m.encendido && modelos.find((x) => x.id === m.id)?.ultima_prueba?.vigente).map((m) => m.id);
      const fuera = todos.filter((id) => !disponibles.includes(id));
      if (fuera.length) return err(409, 'modelo_no_disponible', 'Ese modelo no está encendido y probado.', { detalles: { ids: fuera } });
      v.despliegue_id = body.despliegue_id;
      v.respaldos_ids = [...body.respaldos_ids];
      const incompatibles = body.respaldos_ids
        .map((id) => ({ despliegue_id: id, falta: (['json', 'herramientas'] as const).filter((c) => v.requiere[c] && !modelos.find((m) => m.id === id)?.capacidades[c]) }))
        .filter((x) => x.falta.length);
      return {
        item: { version_id: v.id, despliegue_id: body.despliegue_id, respaldos_ids: [...body.respaldos_ids] },
        advertencias: body.respaldos_ids.length ? [] : [{ codigo: 'sin_respaldo', mensaje: 'Sin respaldo: si el modelo falla, NaIA pasa a una persona' }],
        compatibilidad: { requiere: { ...v.requiere }, respaldos_incompatibles: incompatibles.map((x) => ({ despliegue_id: x.despliegue_id, falta: [...x.falta] })) }
      };
    }),

  // B-3 · duplicar una versión en un borrador nuevo.
  duplicarVersion: (versionId, numero) =>
    escribir(500, () => {
      const a = agentes.find((x) => x.versiones.some((v) => v.id === versionId));
      const v = a?.versiones.find((x) => x.id === versionId);
      if (!a || !v) return err(404, 'no_encontrado', 'No encontramos esa versión.');
      if (!numero.trim() || numero.length > 20) return err(400, 'campo_requerido', 'Escribe un número de versión (1 a 20 caracteres).', { campo: 'numero_version' });
      if (a.versiones.some((x) => x.numero_version === numero)) return err(409, 'numero_version_existente', 'Ya existe una versión con ese número.', { campo: 'numero_version' });
      const nueva = { ...v, id: `v-${a.id}-${Date.now()}`, numero_version: numero, estado: 'borrador', publicada_en: null, respaldos_ids: [...v.respaldos_ids] };
      a.versiones = [nueva, ...a.versiones];
      return { ...nueva };
    }),

  // B-5 · publicar (bloquea respaldo_incompatible y modelo_no_disponible).
  publicarVersion: (versionId) =>
    escribir(700, () => {
      const a = agentes.find((x) => x.versiones.some((v) => v.id === versionId));
      const v = a?.versiones.find((x) => x.id === versionId);
      if (!a || !v) return err(404, 'no_encontrado', 'No encontramos esa versión.');
      for (const id of v.respaldos_ids) {
        const m = modelos.find((x) => x.id === id);
        const falta = (['json', 'herramientas'] as const).filter((c) => v.requiere[c] && !m?.capacidades[c]);
        if (falta.length) {
          return err(409, 'respaldo_incompatible', `El respaldo «${m?.nombre ?? id}» no soporta ${falta.map((c) => (c === 'json' ? 'modo JSON' : 'herramientas')).join(' ni ')}, que este agente usa. Quítalo o elige otro.`, { detalles: [{ despliegue_id: id, falta }] });
        }
      }
      a.versiones = a.versiones.map((x) => (x.id === a.version_activa_id ? { ...x, estado: 'desactivada' } : x));
      v.estado = 'publicada';
      v.publicada_en = ahoraIso();
      a.version_activa_id = v.id;
      return { ...v };
    }),

  // B-6 · volver a una versión que ya estuvo publicada (nota obligatoria).
  restaurarVersion: (versionId, nota) =>
    escribir(600, () => {
      const a = agentes.find((x) => x.versiones.some((v) => v.id === versionId));
      const v = a?.versiones.find((x) => x.id === versionId);
      if (!a || !v) return err(404, 'no_encontrado', 'No encontramos esa versión.');
      if (nota.trim().length < 5 || nota.length > 500) return err(400, 'campo_requerido', 'Escribe una nota de 5 a 500 caracteres: por qué vuelves a esta versión.', { campo: 'nota' });
      if (a.version_activa_id === v.id) return { anterior_version_id: null };
      const anterior = a.version_activa_id;
      a.versiones = a.versiones.map((x) => (x.id === anterior ? { ...x, estado: 'desactivada' } : x));
      v.estado = 'publicada';
      a.version_activa_id = v.id;
      return { anterior_version_id: anterior };
    }),

  // T1 · topes por canal.
  listarTopes: () => leer(() => canales.map(estadoGasto), []),

  // T2 · tope + bitácora del canal.
  obtenerTope: (canal) =>
    leer(() => {
      const c = canales.find((x) => x.canal_codigo === canal);
      if (!c) return err(404, 'canal_inexistente', 'El número o canal no existe.');
      return { ...estadoGasto(c), bitacora: [...(bitacoraTopes[canal] ?? [])].slice(0, 20) };
    }),

  // T3 · guardar tope y/o umbral con las validaciones del contrato.
  guardarTope: (canal, body) =>
    escribir(550, () => {
      const c = canales.find((x) => x.canal_codigo === canal);
      if (!c) return err(404, 'canal_inexistente', 'El número o canal no existe.');
      if (body.tope_diario_usd === undefined && body.umbral_alerta_pct === undefined) return err(400, 'sin_cambios', 'No hay valores para guardar.');
      if (body.tope_diario_usd !== undefined) {
        const t = body.tope_diario_usd;
        if (typeof t !== 'number' || !Number.isFinite(t) || !(t > 0)) return err(400, 'tope_invalido', 'El tope es obligatorio y mayor que 0', { campo: 'tope_diario_usd' });
        if (t > 1000) return err(400, 'tope_maximo', 'El tope máximo es USD 1000 al día', { campo: 'tope_diario_usd' });
      }
      if (body.umbral_alerta_pct !== undefined) {
        const u = body.umbral_alerta_pct;
        if (!Number.isInteger(u) || u < 1 || u > 99) return err(400, 'umbral_invalido', 'El umbral de alerta debe estar entre 1 y 99 %', { campo: 'umbral_alerta_pct' });
      }
      const lista = (bitacoraTopes[canal] ??= []);
      if (body.tope_diario_usd !== undefined && body.tope_diario_usd !== c.tope) {
        lista.unshift({ campo: 'tope_diario_usd', valor_anterior: c.tope, valor_nuevo: body.tope_diario_usd, actor: ACTOR, creado_en: ahoraIso() });
        c.tope = body.tope_diario_usd;
      }
      if (body.umbral_alerta_pct !== undefined && body.umbral_alerta_pct !== c.umbral) {
        lista.unshift({ campo: 'umbral_alerta_pct', valor_anterior: c.umbral, valor_nuevo: body.umbral_alerta_pct, actor: ACTOR, creado_en: ahoraIso() });
        c.umbral = body.umbral_alerta_pct;
      }
      return estadoGasto(c);
    }),

  // T4 · consumo del día.
  consumo: (canal, dia) =>
    leer(() => {
      const c = canales.find((x) => x.canal_codigo === canal);
      if (!c) return err(404, 'canal_inexistente', 'El número o canal no existe.');
      if (dia && !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return err(400, 'dia_invalido', 'Usa una fecha AAAA-MM-DD de los últimos 90 días.', { campo: 'dia' });
      const esWeb = canal === 'web';
      return {
        canal_codigo: canal,
        dia_bogota: dia ?? '2026-10-18',
        total: { llamadas: esWeb ? 140 : 188, gasto_usd: c.gasto, tokens_entrada: esWeb ? 210000 : 280500, tokens_salida: esWeb ? 41000 : 56200, intentos_sin_costo: c.intentos_sin_costo, respaldo_usado: esWeb ? 3 : 0, sin_ia: esWeb ? 1 : 2, simulaciones: esWeb ? 12 : 30 },
        por_modelo: esWeb
          ? [{ proveedor_codigo: 'abacus_ai', modelo: 'naia', llamadas: 137, gasto_usd: 3.1, precio_version: 'estimado-2026-10', es_estimado: true }, { proveedor_codigo: 'xai', modelo: 'grok-4', llamadas: 3, gasto_usd: 0.1, precio_version: '2026-10', es_estimado: false }]
          : [{ proveedor_codigo: 'xai', modelo: 'grok-4', llamadas: 186, gasto_usd: 4.3, precio_version: '2026-10', es_estimado: false }, { proveedor_codigo: 'xai', modelo: 'grok-4-mini', llamadas: 2, gasto_usd: 0, precio_version: null, es_estimado: false }]
      };
    }),

  // T5 · alertas.
  listarAlertas: (estado, canal) => leer(() => alertas.filter((a) => (estado === 'todas' || !a.vista_en) && (!canal || a.canal_codigo === canal)), []),

  // T6 · marcar alerta vista (idempotente).
  marcarAlertaVista: (id) =>
    escribir(300, () => {
      const a = alertas.find((x) => x.id === id);
      if (!a) return err(404, 'no_encontrado', 'No encontramos esa alerta.');
      if (a.vista_en) return { sin_cambios: true };
      alertas = alertas.map((x) => (x.id === id ? { ...x, vista_en: ahoraIso() } : x));
      return { sin_cambios: false };
    })
};
