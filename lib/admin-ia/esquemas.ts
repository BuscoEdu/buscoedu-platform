/**
 * E1 · BA-036/037/038 — Validación de bodies de la API admin de IA (zod).
 *
 * Qué hace: define el esquema de cada body del contrato (README-e1-api) y convierte
 * el primer problema en un error 400 con `error`, `mensaje` en español y `campo`
 * (A5: el error va junto al campo). Los mensajes llevan la forma «codigo|mensaje».
 * Para qué: rechazar datos malos antes de tocar la BD, con el mismo formato siempre.
 * Módulo puro: sin alias `@/`.
 */

import { z } from 'zod';
import { fallo, type ResultadoApi } from './http';
import { PRESETS_PROVEEDOR } from '../agentes/llm/proveedores';

/** Mensaje codificado «codigo|texto» que `validar` separa. */
const m = (codigo: string, texto: string) => `${codigo}|${texto}`;
const rango = (min: number, max: number) => m('fuera_de_rango', `Debe estar entre ${min} y ${max}.`);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuid = () => z.string(m('campo_requerido', 'Este dato es obligatorio.')).regex(UUID, m('id_invalido', 'El identificador no es válido.'));

export const CODIGOS_PRESET = PRESETS_PROVEEDOR.map((p) => p.codigo) as [string, ...string[]];

/** Nombres de campos que NUNCA se aceptan dentro de un borrador (la clave va solo por P6). */
export const CLAVES_PROHIBIDAS = ['clave', 'api_key', 'apikey', 'token', 'secret', 'password'];

/** true si algún objeto anidado tiene una clave prohibida. */
export function contieneClaveProhibida(valor: unknown, profundidad = 0): boolean {
  if (profundidad > 10 || valor === null || typeof valor !== 'object') return false;
  if (Array.isArray(valor)) return valor.some((v) => contieneClaveProhibida(v, profundidad + 1));
  return Object.entries(valor as Record<string, unknown>).some(
    ([k, v]) => CLAVES_PROHIBIDAS.includes(k.toLowerCase()) || contieneClaveProhibida(v, profundidad + 1)
  );
}

// --- Proveedores (P3, P5, P6, P7, P10) ---------------------------------------
export const esquemaCrearProveedor = z.object({
  preset_codigo: z.enum(CODIGOS_PRESET, m('preset_invalido', 'Elige un proveedor de la lista.')),
  codigo: z.string().regex(/^[a-z0-9_]{3,40}$/, m('codigo_invalido', 'El código solo admite minúsculas, números y _ (3 a 40).')).optional(),
  nombre: z.string().trim().min(1, rango(1, 80)).max(80, rango(1, 80)).optional(),
  url_base: z.string().trim().max(300, m('url_no_permitida', 'Esa URL no está en la lista permitida.')).optional(),
  descripcion: z.string().max(500, rango(0, 500)).optional()
});

export const esquemaEditarProveedor = z.object({
  nombre: z.string().trim().min(1, rango(1, 80)).max(80, rango(1, 80)).optional(),
  descripcion: z.string().max(500, rango(0, 500)).nullable().optional(),
  url_base: z.string().trim().max(300).optional(),
  asistente: z
    .object({
      paso: z.number().int(rango(1, 5)).min(1, rango(1, 5)).max(5, rango(1, 5)),
      borrador: z.record(z.string(), z.unknown()).optional()
    })
    .optional()
});

export const esquemaClave = z.object({
  clave: z.string(m('clave_requerida', 'Pega la clave del proveedor.')).min(1, m('clave_requerida', 'Pega la clave del proveedor.'))
});

export const esquemaConfirmacion = z.object({
  confirmar: z.boolean().optional(),
  impacto_hash: z.string().max(200).optional()
});

// --- Modelos (M2, M3) ---------------------------------------------------------
const esquemaParametros = z.object({
  temperature: z.number(rango(0, 2)).min(0, rango(0, 2)).max(2, rango(0, 2)).optional(),
  max_tokens: z.number(rango(1, 8192)).int(rango(1, 8192)).min(1, rango(1, 8192)).max(8192, rango(1, 8192)).optional(),
  timeout_ms: z.number(rango(1000, 60000)).int(rango(1000, 60000)).min(1000, rango(1000, 60000)).max(60000, rango(1000, 60000)).optional()
});

const esquemaPreciosModelo = z.object({
  entrada_usd_1k: z.number(m('precio_invalido', 'Los precios son obligatorios y no pueden ser negativos.')).min(0, m('precio_invalido', 'Los precios son obligatorios y no pueden ser negativos.')).max(100, rango(0, 100)),
  salida_usd_1k: z.number(m('precio_invalido', 'Los precios son obligatorios y no pueden ser negativos.')).min(0, m('precio_invalido', 'Los precios son obligatorios y no pueden ser negativos.')).max(100, rango(0, 100)),
  es_estimado: z.boolean().optional()
});

const esquemaCapacidades = z.object({ json: z.boolean().optional(), herramientas: z.boolean().optional() });

const nombreEnv = z.string().regex(/^(LLM_[A-Z0-9_]+|ABACUS_NAIA_[A-Z0-9_]+)$/, m('variable_no_permitida', 'Por seguridad el nombre debe empezar por LLM_ o ABACUS_NAIA_.'));

const modeloId = z.string().trim().min(1, rango(1, 120)).max(120, rango(1, 120)).regex(/^[A-Za-z0-9._:/@-]+$/, m('modelo_invalido', 'El identificador del modelo tiene caracteres no permitidos.'));

export const esquemaCrearModelo = z.object({
  proveedor_id: uuid(),
  nombre: z.string(m('campo_requerido', 'Este dato es obligatorio.')).trim().min(1, rango(1, 80)).max(80, rango(1, 80)),
  modelo: modeloId.optional(),
  parametros: esquemaParametros.optional(),
  precios: esquemaPreciosModelo,
  capacidades: esquemaCapacidades.optional(),
  abacus: z.object({ identificador_externo: nombreEnv.optional(), referencia_secreto: nombreEnv.optional() }).optional(),
  referencia_secreto: nombreEnv.optional()
});

export const esquemaEditarModelo = z.object({
  nombre: z.string().trim().min(1, rango(1, 80)).max(80, rango(1, 80)).optional(),
  modelo: modeloId.optional(),
  parametros: esquemaParametros.optional(),
  precios: esquemaPreciosModelo.optional(),
  capacidades: esquemaCapacidades.optional(),
  abacus: z.object({ identificador_externo: nombreEnv.optional(), referencia_secreto: nombreEnv.optional() }).optional(),
  referencia_secreto: nombreEnv.optional()
});

export const esquemaPrecio = z.object({
  proveedor_codigo: z.string(m('campo_requerido', 'Este dato es obligatorio.')).min(1, m('campo_requerido', 'Este dato es obligatorio.')),
  modelo: z.string(m('datos_incompletos', 'Modelo y versión son obligatorios.')).trim().min(1, m('datos_incompletos', 'Modelo y versión son obligatorios.')).max(120),
  entrada_usd_1k: esquemaPreciosModelo.shape.entrada_usd_1k,
  salida_usd_1k: esquemaPreciosModelo.shape.salida_usd_1k,
  version: z.string().trim().min(1, rango(1, 40)).max(40, rango(1, 40)).optional(),
  fuente: z.string().max(200).optional(),
  es_estimado: z.boolean().optional()
});

// --- Modelo por agente (B-2, B-3, B-6) ---------------------------------------
export const esquemaModeloVersion = z.object({
  despliegue_id: uuid(),
  respaldos_ids: z.array(uuid()).max(5, m('demasiados_respaldos', 'Puedes agregar hasta 5 respaldos.')).optional()
});

export const esquemaDuplicar = z.object({
  numero_version: z.string(m('campo_requerido', 'Este dato es obligatorio.')).trim().min(1, rango(1, 20)).max(20, rango(1, 20)),
  notas_cambio: z.string().max(1000).optional()
});

export const esquemaRestaurar = z.object({
  nota: z.string(m('nota_requerida', 'Escribe una nota de por qué vuelves a esta versión (5 a 500 caracteres).')).trim().min(5, m('nota_requerida', 'Escribe una nota de por qué vuelves a esta versión (5 a 500 caracteres).')).max(500, rango(5, 500)),
  confirmar: z.literal(true, m('confirmacion_requerida', 'Confirma que quieres volver a esta versión.'))
});

/**
 * Valida y devuelve los datos, o un 400 del contrato con el primer problema.
 * Un campo ausente obligatorio → `campo_requerido` (salvo que el esquema dé otro código).
 */
export function validar<T>(esquema: z.ZodType<T>, body: unknown): { ok: true; datos: T } | { ok: false; resultado: ResultadoApi } {
  const r = esquema.safeParse(body ?? {});
  if (r.success) return { ok: true, datos: r.data };
  const issue = r.error.issues[0];
  const campo = issue.path.map(String).join('.') || undefined;
  const [codigo, texto] = String(issue.message || '').includes('|')
    ? String(issue.message).split('|')
    : issue.code === 'invalid_type'
      ? ['campo_requerido', 'Este dato es obligatorio.']
      : ['dato_invalido', 'Revisa este dato.'];
  return { ok: false, resultado: fallo(400, codigo, texto, { campo }) };
}

// --- Tope diario (T3: D3, D4) -------------------------------------------------
export const TOPE_MAXIMO_USD = 1000;
export const MENSAJE_TOPE_INVALIDO = 'El tope es obligatorio y mayor que 0';
export const MENSAJE_UMBRAL_INVALIDO = 'El umbral de alerta debe estar entre 1 y 99 %';

/**
 * D3/D4 + máximo USD 1000 (decisión del Orquestador). Validación propia porque D3 pide
 * rechazar también «sin límite», vacío, null explícito, 0, negativos e Infinity.
 * Un campo ausente (undefined) = no cambiar.
 */
/** Mismo código y texto que `fn_ia_actualizar_tope` (BD también tiene CHECK ≤ 1000). */
export const MENSAJE_TOPE_MAXIMO = `El tope máximo es USD ${TOPE_MAXIMO_USD} al día`;

export function validarTope(body: unknown):
  | { ok: true; tope: number | null; umbral: number | null }
  | { ok: false; resultado: ResultadoApi } {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  let tope: number | null = null;
  let umbral: number | null = null;

  if ('tope_diario_usd' in b) {
    const v = b.tope_diario_usd;
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN;
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, resultado: fallo(400, 'tope_invalido', MENSAJE_TOPE_INVALIDO, { campo: 'tope_diario_usd' }) };
    }
    if (n > TOPE_MAXIMO_USD) {
      return {
        ok: false,
        resultado: fallo(400, 'tope_maximo', MENSAJE_TOPE_MAXIMO, { campo: 'tope_diario_usd' })
      };
    }
    tope = Math.round(n * 100) / 100;
    if (tope <= 0) return { ok: false, resultado: fallo(400, 'tope_invalido', MENSAJE_TOPE_INVALIDO, { campo: 'tope_diario_usd' }) };
  }
  if ('umbral_alerta_pct' in b) {
    const v = b.umbral_alerta_pct;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 99) {
      return { ok: false, resultado: fallo(400, 'umbral_invalido', MENSAJE_UMBRAL_INVALIDO, { campo: 'umbral_alerta_pct' }) };
    }
    umbral = v;
  }
  if (tope === null && umbral === null) {
    return { ok: false, resultado: fallo(400, 'sin_cambios', 'No hay valores para guardar.') };
  }
  return { ok: true, tope, umbral };
}
