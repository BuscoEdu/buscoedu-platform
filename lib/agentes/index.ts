/**
 * Punto de entrada público del motor del Centro de Agentes IA.
 */

export * from './tipos';
export { AbacusAdapter } from './AbacusAdapter';
export type { ResultadoAdaptador } from './AbacusAdapter';
export { AgenteEjecucionError, ErrorSinIa } from './errores';
export { AgenteExecutor } from './AgenteExecutor';
export { agenteExecutor } from './ejecutar-w1';
export {
  CODIGOS_ERROR_CANAL_FAIL_CLOSED,
  componenteContextoAplicaAlCanal,
  esErrorCanalFailClosed,
  estadoHttpErrorCanal,
  herramientaPermitidaEnCanal,
  resolverAgenteDelCanal,
  resolverCodigoCanalExplicito
} from './canales';
export type { CodigoCanalIa } from './canales';
// BA-039: contrato puro de canales activos (interfaz + caché) y resolución de voz desde BD.
export {
  CANAL_POR_DEFECTO,
  crearRegistroCanales,
  resolverCodigoCanal
} from './canalesActivos';
export type { FuenteCanalesIa, RegistroCanalesIa } from './canalesActivos';
export { resolverVozNaia, esTipoContextoVoz } from './vozDesdeBd';
export type { ComponenteVozFila, VozNaiaResuelta } from './vozDesdeBd';
