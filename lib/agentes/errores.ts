/**
 * Error de ejecución del Centro de Agentes IA.
 *
 * Vive aparte del executor para que la resolución de canal y las rutas
 * puedan lanzarlo sin importar el motor completo (evita ciclos).
 */
export class AgenteEjecucionError extends Error {
  // BA-039: campo declarado aparte (antes era parameter property) para que
  // `node --experimental-strip-types` pueda cargar este archivo en los tests.
  // Mismo comportamiento: `codigo` sigue siendo público y de solo lectura.
  public readonly codigo: string;

  constructor(message: string, codigo: string) {
    super(message);
    this.codigo = codigo;
    this.name = 'AgenteEjecucionError';
  }
}

/**
 * BA-034 — Ningún modelo pudo responder (brief E1 C3 / D3).
 * Qué es: un `error_proveedor` (las rutas lo tratan como siempre) que además trae
 * el mensaje fijo para el estudiante y el evento `error_bot`.
 * Para qué: que la ruta muestre «En este momento no puedo responder…» en vez de
 * un silencio o una respuesta inventada.
 */
export class ErrorSinIa extends AgenteEjecucionError {
  public readonly mensaje_estudiante: string;
  public readonly evento = 'error_bot' as const;

  constructor(mensajeEstudiante: string, detalle: string) {
    super(`Sin IA disponible: ${detalle}`, 'error_proveedor');
    this.name = 'ErrorSinIa';
    this.mensaje_estudiante = mensajeEstudiante;
  }
}
