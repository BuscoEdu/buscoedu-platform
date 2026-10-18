/**
 * E1 · BA-036/037/038 — Respuestas y errores comunes de la API admin de IA.
 *
 * Qué hace:
 *   - Define el resultado de un handler `{ status, body }` sin depender de Next.
 *   - Arma éxitos `{ ok: true, ... }` y errores `{ ok: false, error, mensaje, campo?, detalles? }`.
 *   - Traduce excepciones: ErrorApi → su HTTP; ErrorDependenciaBd → 503
 *     `dependencia_bd_pendiente`; cualquier otra → 500 `error_interno` sin detalle.
 *   - `conSuperAdmin`: corre el handler solo si `autorizar` confirma super_admin (A9).
 * Para qué: que todos los endpoints respondan igual (contrato README-e1-api §0) y que
 * los tests prueben permisos y errores sin Next ni Supabase.
 * Módulo puro: sin alias `@/`.
 */

export interface ResultadoApi {
  status: number;
  body: Record<string, unknown>;
}

export interface Advertencia {
  codigo: string;
  mensaje: string;
}

/** Éxito con datos. */
export function exito(datos: Record<string, unknown> = {}, status = 200): ResultadoApi {
  return { status, body: { ok: true, ...datos } };
}

/** Error con código + mensaje en español sencillo. */
export function fallo(
  status: number,
  error: string,
  mensaje: string,
  extra: { campo?: string; detalles?: unknown; [k: string]: unknown } = {}
): ResultadoApi {
  const body: Record<string, unknown> = { ok: false, error, mensaje };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) body[k] = v;
  return { status, body };
}

/** Error de negocio que corta el handler con un HTTP concreto. */
export class ErrorApi extends Error {
  status: number;
  codigo: string;
  mensajeUsuario: string;
  extra: Record<string, unknown>;
  constructor(status: number, codigo: string, mensajeUsuario: string, extra: Record<string, unknown> = {}) {
    super(codigo);
    this.name = 'ErrorApi';
    this.status = status;
    this.codigo = codigo;
    this.mensajeUsuario = mensajeUsuario;
    this.extra = extra;
  }
}

/**
 * La BD todavía no tiene la tabla, columna o función que el endpoint necesita
 * (Necesidades de BD N1–N8). Se responde 503 y se nombra la dependencia.
 */
export class ErrorDependenciaBd extends Error {
  dependencia: string;
  constructor(dependencia: string) {
    super(`dependencia_bd_pendiente:${dependencia}`);
    this.name = 'ErrorDependenciaBd';
    this.dependencia = dependencia;
  }
}

/**
 * Códigos de PostgREST / Postgres que significan «el objeto no existe»:
 * tabla (42P01, PGRST205), columna (42703, PGRST204), función (42883, PGRST202).
 */
const CODIGOS_OBJETO_INEXISTENTE = new Set(['42P01', 'PGRST205', '42703', 'PGRST204', '42883', 'PGRST202']);

export function esObjetoInexistente(error: { code?: string | null } | null | undefined): boolean {
  return !!error && !!error.code && CODIGOS_OBJETO_INEXISTENTE.has(error.code);
}

export const MENSAJE_DEPENDENCIA_BD =
  'Esta función todavía no está disponible: falta un cambio en la base de datos. Avisa al equipo técnico.';

/** Convierte cualquier excepción en un resultado del contrato. Nunca filtra el detalle interno. */
export function resultadoDeError(err: unknown, avisar: (m: string) => void = (m) => console.warn(m)): ResultadoApi {
  if (err instanceof ErrorApi) return fallo(err.status, err.codigo, err.mensajeUsuario, err.extra);
  if (err instanceof ErrorDependenciaBd) {
    avisar(`[E1 admin IA] Dependencia de BD pendiente: ${err.dependencia}`);
    return fallo(503, 'dependencia_bd_pendiente', MENSAJE_DEPENDENCIA_BD, { detalles: { dependencia: err.dependencia } });
  }
  // Solo el nombre del error: nunca el mensaje (podría traer datos de la petición).
  avisar(`[E1 admin IA] Error interno: ${(err as Error)?.name || 'desconocido'}`);
  return fallo(500, 'error_interno', 'Algo salió mal. Intenta de nuevo en un momento.');
}

/** Resultado de `autorizar`: el actor (usuarios_internos.id) o un rechazo. */
export type Autorizacion = { ok: true; actorId: string } | { ok: false };

export const RESPUESTA_PROHIBIDO: ResultadoApi = fallo(403, 'forbidden', 'No tienes permiso para esta sección.');

/**
 * A9: corre `handler` solo si `autorizar` confirma super_admin. Si no, 403 sin datos ni conteos.
 * Cualquier excepción del handler sale con el formato del contrato.
 */
export async function conSuperAdmin(
  autorizar: () => Promise<Autorizacion>,
  handler: (actorId: string) => Promise<ResultadoApi>
): Promise<ResultadoApi> {
  let auth: Autorizacion;
  try {
    auth = await autorizar();
  } catch {
    return RESPUESTA_PROHIBIDO;
  }
  if (!auth.ok) return RESPUESTA_PROHIBIDO;
  try {
    return await handler((auth as Extract<Autorizacion, { ok: true }>).actorId);
  } catch (err) {
    return resultadoDeError(err);
  }
}
