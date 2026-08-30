export const DEMOWAPP_TIMEOUTS = {
  // Regla operativa Fase 7: 3 minutos sin respuesta => recordatorio.
  SILENCE_REMINDER_SECONDS: 3 * 60,
  // Regla operativa Fase 7: 2 minutos adicionales => cierre amable.
  CLOSE_AFTER_REMINDER_SECONDS: 2 * 60
} as const;

export const DEMOWAPP_CAPTURE_ORDER = [
  'nombre_confirmado',
  'interes_oferta_confirmado',
  'ciudad_interes',
  'modalidad_preferida',
  'nivel_academico_interes',
  'horizonte_inicio'
] as const;

export type DemoWappCaptureKey = (typeof DEMOWAPP_CAPTURE_ORDER)[number];
