/**
 * BA-034 — Circuito compartido del proceso (C4).
 * Qué hace: una sola instancia para todas las peticiones de esta instancia del servidor.
 * Para qué: que los 3 errores seguidos se cuenten entre mensajes distintos.
 */
import { crearCircuito } from './circuito';

export const circuitoCompartido = crearCircuito();
