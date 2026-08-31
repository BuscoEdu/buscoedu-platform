/**
 * Punto de entrada público del motor del Centro de Agentes IA.
 */

export * from './tipos';
export { AbacusAdapter } from './AbacusAdapter';
export type { ResultadoAdaptador } from './AbacusAdapter';
export { AgenteExecutor, agenteExecutor, AgenteEjecucionError } from './AgenteExecutor';
