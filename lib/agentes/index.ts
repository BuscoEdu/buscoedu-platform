/**
 * Punto de entrada público del motor del Centro de Agentes IA.
 */

export * from './tipos';
export { AbacusAdapter } from './AbacusAdapter';
export type { ResultadoAdaptador } from './AbacusAdapter';
export { AgenteEjecucionError } from './errores';
export { AgenteExecutor, agenteExecutor } from './AgenteExecutor';
export {
  CANALES_IA_SOPORTADOS,
  CODIGOS_ERROR_CANAL_FAIL_CLOSED,
  componenteContextoAplicaAlCanal,
  esErrorCanalFailClosed,
  estadoHttpErrorCanal,
  herramientaPermitidaEnCanal,
  resolverAgenteDelCanal,
  resolverCodigoCanalExplicito
} from './canales';
export type { CodigoCanalIa } from './canales';
