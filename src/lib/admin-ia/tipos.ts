/**
 * E1 · BA-036/037/038 (Frontend) — Tipos del panel «IA multiproveedor».
 *
 * Qué define: las formas de datos EXACTAS del contrato `docs/backend/README-e1-api.md`
 * (commit 824ac4d): proveedores (P1–P10), modelos/despliegues (M1–M8), modelo por agente
 * (B-1…B-6), topes por canal, consumo y alertas (T1–T6), el objeto de impacto (§0.2) y el
 * formato de error común (§0).
 * Para qué: que las pantallas dependan de ESTAS interfaces. El adaptador real (`api.ts`) y el de
 * datos de ejemplo (`ejemplo.ts`) devuelven lo mismo, así que cambiar uno por otro es una línea.
 *
 * Módulo puro: sin React, sin Supabase y sin alias `@/`, para testearlo con `node --test`.
 * Cuando un campo no está en el contrato y Frontend lo necesita, va marcado «SUPUESTO».
 */

// Tipos reales de BA-034 (lib/agentes/llm). Se reutilizan para no duplicar contratos.
import type { TipoAdaptador } from '../../../lib/agentes/llm/tipos';
import type { TipoErrorLLM } from '../../../lib/agentes/llm/errores';

export type { TipoAdaptador, TipoErrorLLM };

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 1 · Resultado uniforme y errores (§0 «Formato de error»).
 * Qué define: éxito, error (HTTP + código + mensaje en español + campo) y sin permiso (403).
 * Para qué: separar error ≠ sin permiso ≠ éxito y pintar `mensaje` junto a `campo` (A5).
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ErrorApi {
  tipo: 'error';
  /** Código HTTP (0 si no hubo respuesta: red caída). */
  http: number;
  /** Código estable del contrato, p. ej. `tope_invalido`, `primero_prueba_la_conexion`. */
  codigo: string;
  /** Mensaje en español sencillo que manda la API (o uno de Frontend si la API no lo trae). */
  mensaje: string;
  /** Campo del formulario al que pertenece el error, p. ej. `parametros.temperature`. */
  campo?: string;
  detalles?: unknown;
  /** En 409 `confirmacion_requerida` / `impacto_cambio` la API devuelve el impacto (§0.2). */
  impacto?: Impacto;
}

export type Resultado<T> = { tipo: 'ok'; datos: T } | ErrorApi | { tipo: 'sin_permiso' };

/** Aviso no bloqueante que acompaña una respuesta (P6 `probar_de_nuevo`, B-2 `sin_respaldo`, M5 `proveedor_apagado`). */
export interface Advertencia {
  codigo: string;
  mensaje: string;
}

/** Error de un campo del formulario (A5, D3, D4): se pinta junto al campo con aria-describedby. */
export type ErroresCampo<K extends string> = Partial<Record<K, string>>;

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 2 · Estados del panel e impacto (§0.1, §0.2).
 * ──────────────────────────────────────────────────────────────────────────── */

/** `estado_panel` del contrato (P5: «configurado» no es lo mismo que «en uso»). */
export type EstadoPanel = 'borrador' | 'configurado' | 'probado' | 'encendido' | 'error';

/** Agente afectado por apagar algo; `queda_con` = primer modelo encendido que le queda, o null. */
export interface AgenteAfectado {
  agente_id: string;
  agente_codigo: string;
  agente_nombre: string;
  version_id: string;
  numero_version: string;
  rol: 'principal' | 'respaldo';
  queda_con: { despliegue_id: string; nombre: string } | null;
}

/** Objeto de impacto (§0.2), igual para modelo, proveedor y revocación de clave. */
export interface Impacto {
  objetivo: { tipo: 'proveedor' | 'despliegue' | 'clave'; id: string; nombre: string };
  agentes_afectados: number;
  agentes_sin_ia: number;
  /** «3 agentes lo usan; 1 quedaría sin IA.» */
  mensaje: string;
  agentes: AgenteAfectado[];
  borradores_afectados: number;
  /** Se reenvía al confirmar; si cambió, la API responde 409 `impacto_cambio`. */
  impacto_hash: string;
}

/** Confirmación de apagar / revocar (P7, P10, M6). */
export interface Confirmacion {
  confirmar: boolean;
  impacto_hash?: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 3 · Proveedores (P1–P10).
 * ──────────────────────────────────────────────────────────────────────────── */

/** P1 · preset del paso «Elegir». */
export interface PresetApi {
  codigo: string;
  nombre: string;
  tipo_adaptador: TipoAdaptador;
  url_base: string | null;
  urls_permitidas: string[];
  url_editable: boolean;
  variable_env_sugerida?: string;
  ayuda?: { por_que: string; para_que: string };
}

/** Estado de la clave (de `fn_ia_estado_clave`). Nunca trae el valor (A3). */
export interface EstadoClaveApi {
  configurada: boolean;
  origen: 'vault' | 'env' | null;
  actualizada_en: string | null;
  revocada_en: string | null;
  /** SUPUESTO: el contrato da `actor` solo en la bitácora; el «por X» sale de su último evento de clave. */
  actualizada_por?: string | null;
}

/** Resumen de la última prueba (P2 / M1). */
export interface UltimaPruebaApi {
  exitosa: boolean;
  vigente: boolean;
  latencia_ms: number;
  modelo_respondio: string | null;
  motivo?: string | null;
  probado_en: string;
}

/** P2 · fila de la pantalla Proveedores. */
export interface ProveedorApi {
  id: string;
  codigo: string;
  nombre: string;
  preset_codigo: string;
  tipo_adaptador: TipoAdaptador;
  url_base: string | null;
  estado_panel: EstadoPanel;
  encendido: boolean;
  clave: EstadoClaveApi;
  ultima_prueba: UltimaPruebaApi | null;
  salud: { circuito_abierto_hasta: string | null };
  /** Número de modelos del proveedor. */
  modelos: number;
  usado_por: { principal: number; respaldo: number };
  asistente: { paso: number; completo: boolean };
  actualizado_en: string;
}

/** P9 / P10 · respuesta del interruptor del proveedor (la API devuelve solo id + estado). */
export interface InterruptorApi {
  id: string;
  encendido: boolean;
  sin_cambios?: boolean;
  aplica_en_s?: number;
}

/** P4 · evento de bitácora (claves + configuración), siempre sin la clave. */
export interface EventoBitacora {
  accion: string;
  actor: { id: string; nombre: string };
  creado_en: string;
  valor_anterior?: unknown;
  valor_nuevo?: unknown;
}

/** P4 · detalle del proveedor. */
export interface DetalleProveedorApi extends Omit<ProveedorApi, 'modelos'> {
  modelos: ModeloApi[];
  bitacora: EventoBitacora[];
  asistente: { paso: number; completo: boolean; borrador?: Record<string, unknown> | null };
}

/** P3 · body para crear el proveedor (paso 1). */
export interface CrearProveedorBody {
  preset_codigo: string;
  codigo?: string;
  nombre?: string;
  url_base?: string;
  descripcion?: string;
}

/** P5 · body editable (el borrador NUNCA lleva campos llamados clave/api_key/token/secret/password). */
export interface ActualizarProveedorBody {
  nombre?: string;
  descripcion?: string;
  url_base?: string;
  asistente?: { paso: number; borrador: Record<string, unknown> };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 4 · Modelos / despliegues (M1–M8).
 * ──────────────────────────────────────────────────────────────────────────── */

export interface CapacidadesApi {
  json: boolean;
  herramientas: boolean;
}

export interface PrecioVigenteApi {
  entrada_usd_1k: number;
  salida_usd_1k: number;
  version: string;
  /** true → Frontend muestra la etiqueta «precio estimado». */
  es_estimado: boolean;
  modelo: string;
}

/** M1 · un modelo de un proveedor. */
export interface ModeloApi {
  id: string;
  proveedor_id: string;
  proveedor_codigo: string;
  nombre: string;
  modelo: string;
  encendido: boolean;
  estado_panel: EstadoPanel;
  parametros: { temperature: number; max_tokens: number; timeout_ms: number };
  capacidades: CapacidadesApi;
  precio_vigente: PrecioVigenteApi | null;
  ultima_prueba: UltimaPruebaApi | null;
  usado_por: { principal: number; respaldo: number };
}

/** B-1 · modelo disponible para un agente (encendido + prueba vigente + proveedor encendido). */
export interface ModeloDisponibleApi extends ModeloApi {
  proveedor_nombre: string;
}

/** M2 · body para crear un modelo (paso 3). M3 acepta los mismos campos, opcionales. */
export interface CrearModeloBody {
  proveedor_id: string;
  nombre: string;
  modelo?: string;
  parametros: { temperature: number; max_tokens: number; timeout_ms: number };
  precios: { entrada_usd_1k: number; salida_usd_1k: number; es_estimado?: boolean };
  capacidades?: Partial<CapacidadesApi>;
  abacus?: { identificador_externo: string; referencia_secreto: string };
}

export type ActualizarModeloBody = Partial<Omit<CrearModeloBody, 'proveedor_id'>>;

/** M4 · resultado de «Probar conexión» (200 aunque falle: el resultado es un dato). */
export interface PruebaApi {
  exitosa: boolean;
  latencia_ms: number;
  modelo_respondio: string | null;
  motivo_codigo: TipoErrorLLM | null;
  motivo: string | null;
  que_hacer: string | null;
  probado_en: string;
}

export interface RespuestaPrueba {
  prueba: PruebaApi;
  puede_encender: boolean;
}

/** M8 · versión de precio. */
export interface PrecioApi {
  id: string;
  modelo: string;
  version: string;
  entrada_usd_1k: number;
  salida_usd_1k: number;
  es_estimado: boolean;
  vigente_desde: string;
  vigente_hasta: string | null;
  fuente: string | null;
}

export interface RegistrarPrecioBody {
  proveedor_codigo: string;
  modelo: string;
  entrada_usd_1k: number;
  salida_usd_1k: number;
  version?: string;
  fuente?: string;
  es_estimado: boolean;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 5 · Modelo por agente (B-1…B-6).
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Agente con sus versiones, armado con rutas que YA existen:
 * `GET /api/admin/ia/agentes` + `GET /api/admin/ia/versiones?agente_id=`.
 * SUPUESTO: el contrato E1 no define un endpoint agregado; esta forma la arma `api.ts`.
 */
export interface VersionAgente {
  id: string;
  numero_version: string;
  estado: 'borrador' | 'publicada' | 'desactivada' | string;
  publicada_en: string | null;
  /** `configuracion_snapshot.despliegue_id` y `.despliegues_respaldo_ids` (lo que lee BA-034). */
  despliegue_id: string | null;
  respaldos_ids: string[];
  /** Capacidades que la versión usa (B3): json si tiene `contrato_salida`, herramientas si tiene herramientas. SUPUESTO. */
  requiere: CapacidadesApi;
}

export interface AgenteConVersiones {
  id: string;
  codigo: string;
  nombre: string;
  version_activa_id: string | null;
  versiones: VersionAgente[];
}

export interface AsignarModeloBody {
  despliegue_id: string;
  respaldos_ids: string[];
}

/** B-2 · respuesta. */
export interface RespuestaAsignarModelo {
  item: { version_id: string; despliegue_id: string; respaldos_ids: string[] };
  advertencias: Advertencia[];
  compatibilidad: { requiere: CapacidadesApi; respaldos_incompatibles: Array<{ despliegue_id: string; falta: Array<keyof CapacidadesApi> }> };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 6 · Tope de gasto por CANAL, consumo y alertas (T1–T6).
 * En E1 el «número» es el canal (`web`, `whatsapp`); `whatsapp` lo comparten Demo WApp y el
 * WhatsApp real. El corte por línea queda para E2 (README-e1-api §4, N9).
 * ──────────────────────────────────────────────────────────────────────────── */

export interface AvisoGasto {
  codigo: 'precio_estimado' | 'sin_costo' | string;
  mensaje: string;
  accion?: string;
}

/** Estado de gasto de un canal (T1 item / T2 / T3 item). */
export interface EstadoGastoApi {
  canal_codigo: string;
  canal_nombre: string;
  tope_diario_usd: number;
  umbral_alerta_pct: number;
  gasto_usd: number;
  pct_usado: number;
  estado: 'normal' | 'alerta' | 'cortado';
  motivos_alerta: Array<'umbral' | 'sin_costo'>;
  precio_estimado: boolean;
  intentos_sin_costo: number;
  dia_bogota: string;
  reinicia_en: string;
  avisos: AvisoGasto[];
  ayuda: { por_que: string; para_que: string };
}

/** T2 · cambio de tope en la bitácora (D1: quién, cuándo, anterior → nuevo). */
export interface EventoTopeApi {
  campo: 'tope_diario_usd' | 'umbral_alerta_pct' | string;
  valor_anterior: number | null;
  valor_nuevo: number | null;
  actor: { id: string; nombre: string };
  creado_en: string;
}

export interface DetalleTopeApi extends EstadoGastoApi {
  bitacora: EventoTopeApi[];
}

export interface GuardarTopeBody {
  tope_diario_usd?: number;
  umbral_alerta_pct?: number;
}

/** T4 · consumo del día. */
export interface ConsumoApi {
  canal_codigo: string;
  dia_bogota: string;
  total: {
    llamadas: number;
    gasto_usd: number;
    tokens_entrada: number;
    tokens_salida: number;
    intentos_sin_costo: number;
    respaldo_usado: number;
    sin_ia: number;
    simulaciones: number;
  };
  por_modelo: Array<{ proveedor_codigo: string; modelo: string; llamadas: number; gasto_usd: number; precio_version: string | null; es_estimado: boolean }>;
}

/** T5 · alerta de gasto. */
export interface AlertaApi {
  id: string;
  canal_codigo: string;
  tipo: 'umbral' | 'corte' | 'sin_costo';
  dia_bogota: string;
  gasto_usd: number;
  tope_usd: number;
  umbral_pct: number;
  creado_en: string;
  vista_en: string | null;
}
