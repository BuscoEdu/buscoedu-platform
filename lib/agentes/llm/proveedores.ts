/**
 * BA-034 — Catálogo de proveedores y lista permitida de URLs (brief E1 §2 y A2; spec §8.2 y §8.4).
 *
 * Qué hace:
 *   - Define los proveedores que el asistente ofrece (OpenAI, xAI, Anthropic, Gemini,
 *     Abacus, OpenRouter y «Otro compatible») con su tipo de adaptador y URL precargada.
 *   - Valida que la URL base de un despliegue esté en la lista permitida EN CÓDIGO.
 *   - Valida el nombre de la variable de entorno de respaldo (`^LLM_[A-Z0-9_]+$`, `ABACUS_NAIA_*`).
 *   - Convierte filas de BD (`despliegues_ia` + `proveedores_ia`) en `DespliegueLLM`.
 * Para qué: que un admin no pueda mandar una clave a una URL propia ni apuntar a
 * `SUPABASE_SERVICE_ROLE_KEY`, y que todo lo desconocido se rechace (fail-closed).
 */

import { ErrorLLM } from './errores';
import type { DespliegueLLM, PreciosModelo, TipoAdaptador } from './tipos';

/** Preset del asistente «Agregar proveedor» (paso 1, A2). */
export interface PresetProveedor {
  codigo: string;
  nombre: string;
  tipo_adaptador: TipoAdaptador;
  /** URL que se precarga. null = Abacus (endpoint fijo dentro de AbacusAdapter). */
  url_base: string | null;
}

/** Proveedores ofrecidos por el asistente. `abacus_ai` es el código que ya existe en prod. */
export const PRESETS_PROVEEDOR: readonly PresetProveedor[] = [
  { codigo: 'abacus_ai', nombre: 'Abacus.AI', tipo_adaptador: 'abacus', url_base: null },
  { codigo: 'openai', nombre: 'OpenAI', tipo_adaptador: 'openai', url_base: 'https://api.openai.com/v1' },
  { codigo: 'xai', nombre: 'xAI (Grok)', tipo_adaptador: 'xai', url_base: 'https://api.x.ai/v1' },
  { codigo: 'anthropic', nombre: 'Anthropic (Claude)', tipo_adaptador: 'anthropic', url_base: 'https://api.anthropic.com/v1' },
  {
    codigo: 'google',
    nombre: 'Google Gemini',
    tipo_adaptador: 'google',
    url_base: 'https://generativelanguage.googleapis.com/v1beta'
  },
  {
    codigo: 'openrouter',
    nombre: 'OpenRouter',
    tipo_adaptador: 'openai_compatible',
    url_base: 'https://openrouter.ai/api/v1'
  },
  // «Otro compatible»: el admin elige una URL, pero solo de URLS_PERMITIDAS.openai_compatible.
  { codigo: 'otro_compatible', nombre: 'Otro compatible con OpenAI', tipo_adaptador: 'openai_compatible', url_base: null }
];

/**
 * Lista permitida de URLs base por tipo de adaptador (spec §8.4). Solo se cambia en código.
 * Abacus no tiene URL configurable: su endpoint está fijo en AbacusAdapter.
 */
export const URLS_PERMITIDAS: Readonly<Record<TipoAdaptador, readonly string[]>> = {
  abacus: [],
  openai: ['https://api.openai.com/v1'],
  xai: ['https://api.x.ai/v1'],
  anthropic: ['https://api.anthropic.com/v1'],
  google: ['https://generativelanguage.googleapis.com/v1beta'],
  openai_compatible: [
    'https://openrouter.ai/api/v1',
    'https://api.openai.com/v1',
    'https://api.x.ai/v1',
    'https://api.groq.com/openai/v1',
    'https://api.together.xyz/v1',
    'https://api.mistral.ai/v1',
    'https://api.deepseek.com/v1'
  ]
};

const TIPOS_VALIDOS = new Set<TipoAdaptador>(['abacus', 'openai', 'openai_compatible', 'anthropic', 'google', 'xai']);

/** Nombre de variable de entorno aceptable como respaldo de clave (spec §8.4). */
const NOMBRE_ENV_PERMITIDO = /^(LLM_[A-Z0-9_]+|ABACUS_NAIA_[A-Z0-9_]+)$/;

export function nombreEnvPermitido(nombre: string | null | undefined): boolean {
  return typeof nombre === 'string' && NOMBRE_ENV_PERMITIDO.test(nombre);
}

/** Normaliza una URL para compararla: sin barra final ni espacios. */
function normalizarUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * ¿La URL está permitida para este tipo? Comparación exacta (sin barra final).
 * Devuelve el motivo si se rechaza, para explicarlo en el asistente (A2).
 */
export function validarUrlBase(tipo: TipoAdaptador, url: string | null | undefined): { ok: true; url: string } | { ok: false; motivo: string } {
  const lista = URLS_PERMITIDAS[tipo] || [];
  if (tipo === 'abacus') return { ok: true, url: '' };
  if (!url || !url.trim()) {
    return lista.length === 1 ? { ok: true, url: lista[0] } : { ok: false, motivo: 'Falta la URL del proveedor.' };
  }
  const limpia = normalizarUrl(url);
  if (!limpia.startsWith('https://')) return { ok: false, motivo: 'Solo se aceptan URLs https.' };
  if (!lista.includes(limpia)) {
    return {
      ok: false,
      motivo: 'Esa URL no está en la lista permitida. Por seguridad la clave solo se envía a proveedores conocidos.'
    };
  }
  return { ok: true, url: limpia };
}

/** Tipo de adaptador de un proveedor: primero el que diga la config técnica, luego el preset por código. */
export function resolverTipoAdaptador(
  proveedorCodigo: string,
  configuracionTecnica: Record<string, unknown> | null | undefined
): TipoAdaptador | null {
  const declarado = configuracionTecnica?.tipo_adaptador;
  if (typeof declarado === 'string' && TIPOS_VALIDOS.has(declarado as TipoAdaptador)) {
    return declarado as TipoAdaptador;
  }
  const preset = PRESETS_PROVEEDOR.find((p) => p.codigo === proveedorCodigo);
  return preset ? preset.tipo_adaptador : null;
}

/** Precios versionados desde la config técnica (paso Modelos, A5). Sin los tres datos válidos → null. */
export function leerPrecios(configuracionTecnica: Record<string, unknown> | null | undefined): PreciosModelo | null {
  const c = configuracionTecnica || {};
  const entrada = c.costo_usd_1k_entrada;
  const salida = c.costo_usd_1k_salida;
  const version = c.precio_version;
  if (typeof entrada !== 'number' || typeof salida !== 'number' || !(entrada >= 0) || !(salida >= 0)) return null;
  return { entrada_usd_1k: entrada, salida_usd_1k: salida, version: typeof version === 'string' && version ? version : 'sin_version' };
}

/** Fila mínima de BD para armar un despliegue (select del executor). */
export interface FilaDespliegue {
  id: string;
  activo?: boolean | null;
  estado?: string | null;
  modelo?: string | null;
  identificador_externo?: string | null;
  referencia_secreto?: string | null;
  configuracion_tecnica?: Record<string, unknown> | null;
  proveedores_ia?: { codigo?: string | null; activo?: boolean | null; estado?: string | null } | null;
}

/** Convierte una fila de BD en `DespliegueLLM` (sin validar aún: eso lo hace `validarDespliegue`). */
export function despliegueDesdeFila(fila: FilaDespliegue): DespliegueLLM {
  const config = (fila.configuracion_tecnica as Record<string, unknown> | null) ?? null;
  const proveedorCodigo = (fila.proveedores_ia?.codigo || '').trim();
  const urlConfig = typeof config?.url_base === 'string' ? config.url_base : null;
  return {
    id: fila.id,
    proveedor_codigo: proveedorCodigo,
    proveedor_activo: fila.proveedores_ia?.activo !== false && (fila.proveedores_ia?.estado ?? 'activo') === 'activo',
    despliegue_activo: fila.activo !== false && (fila.estado ?? 'activo') === 'activo',
    tipo_adaptador: proveedorCodigo ? resolverTipoAdaptador(proveedorCodigo, config) : null,
    modelo: typeof fila.modelo === 'string' && fila.modelo.trim() ? fila.modelo.trim() : (typeof config?.modelo === 'string' ? config.modelo : null),
    url_base: urlConfig,
    referencia_secreto: fila.referencia_secreto ?? null,
    identificador_externo: fila.identificador_externo ?? null,
    configuracion_tecnica: config,
    precios: leerPrecios(config)
  };
}

/**
 * Fail-closed antes de llamar: proveedor desconocido, apagado, sin modelo o con URL
 * fuera de la lista → ErrorLLM y ese despliegue no se usa.
 */
export function validarDespliegue(d: DespliegueLLM): { tipo: TipoAdaptador; url: string } {
  if (!d.proveedor_codigo || !d.tipo_adaptador) {
    throw new ErrorLLM('proveedor_no_permitido', 'proveedor_desconocido');
  }
  if (!d.proveedor_activo || !d.despliegue_activo) {
    throw new ErrorLLM('proveedor_inactivo', 'proveedor_o_despliegue_apagado');
  }
  if (d.tipo_adaptador === 'abacus') {
    if (!d.identificador_externo || !d.referencia_secreto) throw new ErrorLLM('sin_clave', 'abacus_sin_referencias');
    return { tipo: 'abacus', url: '' };
  }
  if (!d.modelo) throw new ErrorLLM('proveedor_no_permitido', 'sin_modelo');
  const url = validarUrlBase(d.tipo_adaptador, d.url_base);
  if (!url.ok) throw new ErrorLLM('proveedor_no_permitido', 'url_no_permitida');
  return { tipo: d.tipo_adaptador, url: url.url };
}
