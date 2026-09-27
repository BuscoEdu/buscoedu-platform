/**
 * Error de ejecución del Centro de Agentes IA.
 *
 * Vive aparte del executor para que la resolución de canal y las rutas
 * puedan lanzarlo sin importar el motor completo (evita ciclos).
 */
export class AgenteEjecucionError extends Error {
  constructor(message: string, public readonly codigo: string) {
    super(message);
    this.name = 'AgenteEjecucionError';
  }
}
