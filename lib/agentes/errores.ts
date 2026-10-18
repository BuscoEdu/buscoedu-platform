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
