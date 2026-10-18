/**
 * BA-034 — Errores de la capa IA (spec §8.1 `ErrorLLM`).
 *
 * Qué hace: da un tipo estable a cada fallo de proveedor y traduce errores
 * del AI SDK / fetch / Abacus a esos tipos, sin incluir nunca la clave.
 * Para qué: decidir si se pasa al respaldo, contar errores para el circuito (C4)
 * y mostrar al admin un motivo en palabras sencillas (A6).
 */

export type TipoErrorLLM =
  | 'timeout'
  | 'limite_tasa'
  | 'autenticacion'
  | 'sin_saldo'
  | 'contexto_excedido'
  | 'politica_contenido'
  | 'servidor'
  | 'respuesta_invalida'
  // Fallos de configuración (fail-closed): no se llama al proveedor.
  | 'sin_clave'
  | 'proveedor_no_permitido'
  | 'proveedor_inactivo';

export class ErrorLLM extends Error {
  // Campo declarado aparte (no parameter property) para que strip-types lo cargue en tests.
  public readonly tipo: TipoErrorLLM;

  constructor(tipo: TipoErrorLLM, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorLLM';
    this.tipo = tipo;
  }
}

/** Motivo en palabras sencillas para el admin (A6). Nunca incluye datos de la petición. */
export const MOTIVO_LEGIBLE: Record<TipoErrorLLM, string> = {
  timeout: 'Tiempo agotado: el proveedor no respondió a tiempo.',
  limite_tasa: 'El proveedor está limitando las peticiones. Intenta en unos minutos.',
  autenticacion: 'Clave inválida o sin permiso para este modelo.',
  sin_saldo: 'La cuenta del proveedor no tiene saldo.',
  contexto_excedido: 'El mensaje es demasiado largo para este modelo.',
  politica_contenido: 'El proveedor bloqueó el contenido por su política.',
  servidor: 'El proveedor o su URL no están disponibles.',
  respuesta_invalida: 'El modelo respondió en un formato inesperado.',
  sin_clave: 'No hay clave configurada para este proveedor.',
  proveedor_no_permitido: 'El proveedor o su URL no están en la lista permitida.',
  proveedor_inactivo: 'El proveedor o el modelo están apagados.'
};

/**
 * Quita la clave de un texto antes de loguearlo o guardarlo (defensa extra, A3).
 * Si la clave es muy corta no se reemplaza (evita destrozar el texto), pero esas claves no se aceptan.
 */
export function sinClave(texto: string, clave?: string | null): string {
  if (!clave || clave.length < 8) return texto;
  return texto.split(clave).join('[clave]');
}

/**
 * Traduce cualquier error a un ErrorLLM.
 * Qué mira: `statusCode` (APICallError del AI SDK), nombres de timeout/abort y
 * el texto de Abacus ("estado 429", "timeout", "Faltan variables").
 * El mensaje resultante es genérico: no copia el cuerpo de la respuesta (podría traer datos).
 */
export function clasificarErrorLLM(err: unknown): ErrorLLM {
  if (err instanceof ErrorLLM) return err;
  const e = err as { name?: string; statusCode?: number; message?: string; lastError?: unknown } | null;
  // RetryError del AI SDK envuelve el último error.
  if (e?.lastError) return clasificarErrorLLM(e.lastError);

  const nombre = e?.name || '';
  const mensaje = typeof e?.message === 'string' ? e.message : '';
  let estado = typeof e?.statusCode === 'number' ? e.statusCode : undefined;
  if (estado === undefined) {
    const m = mensaje.match(/estado (\d{3})/);
    if (m) estado = Number(m[1]);
  }

  // Bloque 1: tiempo agotado / abortado.
  if (nombre === 'TimeoutError' || nombre === 'AbortError' || /timeout/i.test(mensaje)) {
    return new ErrorLLM('timeout', 'timeout');
  }
  // Bloque 2: claves faltantes (Abacus lanza este texto con nombres de variables, nunca valores).
  if (/Faltan variables de entorno/i.test(mensaje)) return new ErrorLLM('sin_clave', 'sin_clave');
  // Bloque 3: por código HTTP.
  if (estado === 401 || estado === 403) return new ErrorLLM('autenticacion', `http_${estado}`);
  if (estado === 402) return new ErrorLLM('sin_saldo', 'http_402');
  if (estado === 429) {
    return /quota|saldo|billing|credit/i.test(mensaje)
      ? new ErrorLLM('sin_saldo', 'http_429_cuota')
      : new ErrorLLM('limite_tasa', 'http_429');
  }
  if (estado === 413 || (estado === 400 && /context|token/i.test(mensaje))) {
    return new ErrorLLM('contexto_excedido', `http_${estado}`);
  }
  if (estado === 400 && /policy|safety|content/i.test(mensaje)) {
    return new ErrorLLM('politica_contenido', 'http_400_politica');
  }
  if (estado !== undefined && estado >= 500) return new ErrorLLM('servidor', `http_${estado}`);
  if (estado !== undefined) return new ErrorLLM('servidor', `http_${estado}`);
  // Bloque 4: red caída, DNS, etc.
  return new ErrorLLM('servidor', 'error_red_o_desconocido');
}
