/**
 * BA-032 · Punto de entrada del canal WhatsApp real (Meta Cloud API).
 * Solo reexporta piezas puras; los adaptadores Supabase se importan directo desde la ruta.
 */
export * from './config';
export * from './firma';
export * from './webhook-parser';
export * from './ventana';
export * from './rate-limit';
export * from './comandos';
export * from './graph-client';
export * from './orquestador';
export * from './procesar-webhook';
export type * from './tipos';
