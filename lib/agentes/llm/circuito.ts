/**
 * BA-034 — Circuito por despliegue (brief E1 C4).
 *
 * Qué hace: cuenta errores seguidos de cada despliegue. Con 3 seguidos (parámetro),
 * el despliegue se salta durante 5 min (parámetro). Al vencer, se vuelve a intentar:
 * un éxito lo cierra; un nuevo error lo reabre de inmediato.
 * Para qué: no castigar al estudiante esperando a un modelo caído; usar el respaldo
 * o el mensaje C3 enseguida.
 * Limitación: vive en memoria del proceso (cada instancia serverless lleva su cuenta).
 */

export const UMBRAL_ERRORES_CIRCUITO = 3;
export const MINUTOS_CIRCUITO_ABIERTO = 5;

export interface CircuitoDespliegues {
  estaAbierto(despliegueId: string): boolean;
  registrarExito(despliegueId: string): void;
  registrarError(despliegueId: string): void;
  /** Hasta cuándo está abierto (ms epoch) o null. Para el panel (estado de salud). */
  abiertoHasta(despliegueId: string): number | null;
}

export function crearCircuito(
  opciones: { umbral?: number; minutos?: number; ahora?: () => number } = {}
): CircuitoDespliegues {
  const umbral = opciones.umbral ?? UMBRAL_ERRORES_CIRCUITO;
  const ventanaMs = (opciones.minutos ?? MINUTOS_CIRCUITO_ABIERTO) * 60_000;
  const ahora = opciones.ahora ?? Date.now;
  const estado = new Map<string, { errores: number; hasta: number }>();

  return {
    estaAbierto(id) {
      const e = estado.get(id);
      return !!e && e.errores >= umbral && ahora() < e.hasta;
    },
    registrarExito(id) {
      estado.delete(id);
    },
    registrarError(id) {
      const e = estado.get(id) ?? { errores: 0, hasta: 0 };
      e.errores += 1;
      if (e.errores >= umbral) e.hasta = ahora() + ventanaMs;
      estado.set(id, e);
    },
    abiertoHasta(id) {
      const e = estado.get(id);
      return e && e.errores >= umbral && ahora() < e.hasta ? e.hasta : null;
    }
  };
}
