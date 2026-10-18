/**
 * BA-032 · Ventana de atención de 24 horas.
 *
 * Solo se responde si el último mensaje entrante del usuario tiene menos de 24 h.
 * Fuera de ventana no se envía nada: en el MVP no usamos plantillas.
 */

export const VENTANA_ATENCION_MS = 24 * 60 * 60 * 1000;

export function dentroDeVentana24h(ultimoEntranteMs: number | null | undefined, ahoraMs: number): boolean {
  if (typeof ultimoEntranteMs !== 'number' || !Number.isFinite(ultimoEntranteMs)) return false;
  const edad = ahoraMs - ultimoEntranteMs;
  // Toleramos 5 minutos de desfase de reloj hacia el futuro; más que eso es sospechoso.
  if (edad < -5 * 60 * 1000) return false;
  return edad < VENTANA_ATENCION_MS;
}
