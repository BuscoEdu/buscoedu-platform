/**
 * BA-032 · Configuración del canal WhatsApp real (Meta Cloud API).
 *
 * Todo se lee de variables de entorno y todo es fail-closed:
 * - sin META_WA_VERIFY_TOKEN → la verificación GET responde 403;
 * - sin META_APP_SECRET → todo POST responde 401;
 * - sin allowlist de piloto y sin WA_REAL_HABILITADO='true' → no se responde a nadie;
 * - WA_LEAD_CONVERSION_ENABLED distinto de 'true' exacto → nunca se convierte a lead.
 *
 * Este módulo nunca imprime valores de secretos: solo expone si existen.
 */

export type EntornoLectura = Record<string, string | undefined>;

// Versión de Graph API por defecto. graph.facebook.com aceptó v26.0 el 2026-10-17
// (v27.0 respondió "Unknown path"). Se puede fijar con META_GRAPH_API_VERSION.
export const VERSION_GRAPH_POR_DEFECTO = 'v26.0';

// Regla de Producto: el piloto cerrado admite como máximo 5 celulares.
export const MAX_NUMEROS_PILOTO = 5;

const PATRON_E164 = /^\+[1-9]\d{7,14}$/;
const PATRON_VERSION = /^v\d{2,3}\.\d$/;

export interface ConfigWhatsApp {
  token: string;
  phoneNumberId: string;
  wabaId: string;
  appSecret: string;
  verifyToken: string;
  versionGraph: string;
  timeoutMs: number;
  /** Apertura al público. Solo con catálogo real de aliadas cargado. */
  realHabilitado: boolean;
  /** Piloto cerrado: celulares E.164 que sí reciben respuesta. */
  pilotoNumeros: string[];
  /** true si la variable de piloto existe pero es inválida (se trata como vacía). */
  pilotoInvalido: boolean;
  /** Interruptor de conversión a lead (oportunidad / transferencia facturable). */
  leadConversionHabilitada: boolean;
  /** Mensajes entrantes por número y por minuto antes de dejar de responder. */
  limiteMensajesPorMinuto: number;
}

// Bloque: lectura estricta de booleanos. Solo el string exacto 'true' enciende.
export function esVerdaderoEstricto(valor: string | undefined): boolean {
  return valor === 'true';
}

/**
 * Bloque: allowlist del piloto. Lista separada por comas en E.164.
 * Cualquier entrada inválida o más de 5 números invalida la lista completa
 * (preferimos no responder a nadie antes que responder a quien no toca).
 */
export function leerAllowlistPiloto(valor: string | undefined): { numeros: string[]; invalida: boolean } {
  if (!valor || !valor.trim()) return { numeros: [], invalida: false };
  const partes = valor
    .split(',')
    .map((parte) => parte.trim().replace(/[\s-]/g, ''))
    .filter(Boolean);
  if (partes.length === 0) return { numeros: [], invalida: false };
  if (partes.length > MAX_NUMEROS_PILOTO) return { numeros: [], invalida: true };
  if (partes.some((parte) => !PATRON_E164.test(parte))) return { numeros: [], invalida: true };
  return { numeros: Array.from(new Set(partes)), invalida: false };
}

export function leerConfigWhatsApp(env: EntornoLectura = process.env): ConfigWhatsApp {
  const piloto = leerAllowlistPiloto(env.WA_PILOTO_NUMEROS);
  const version = (env.META_GRAPH_API_VERSION || '').trim();
  const timeout = Number(env.META_WA_TIMEOUT_MS);
  const limite = Number(env.WA_RATE_LIMIT_POR_MINUTO);
  return {
    token: env.META_WA_TOKEN || '',
    phoneNumberId: env.META_WA_PHONE_NUMBER_ID || '',
    wabaId: env.META_WABA_ID || '',
    appSecret: env.META_APP_SECRET || '',
    verifyToken: env.META_WA_VERIFY_TOKEN || '',
    versionGraph: PATRON_VERSION.test(version) ? version : VERSION_GRAPH_POR_DEFECTO,
    timeoutMs: Number.isFinite(timeout) && timeout >= 1000 && timeout <= 20000 ? timeout : 8000,
    realHabilitado: esVerdaderoEstricto(env.WA_REAL_HABILITADO),
    pilotoNumeros: piloto.numeros,
    pilotoInvalido: piloto.invalida,
    leadConversionHabilitada: esVerdaderoEstricto(env.WA_LEAD_CONVERSION_ENABLED),
    limiteMensajesPorMinuto: Number.isFinite(limite) && limite >= 1 && limite <= 120 ? Math.floor(limite) : 20
  };
}

/**
 * Bloque: ¿a este número se le puede responder?
 * - Público abierto (WA_REAL_HABILITADO='true') → sí, a cualquiera.
 * - Si no, solo a los celulares de la allowlist del piloto.
 * - Allowlist vacía, ausente o inválida y flag apagado → a nadie.
 */
export function numeroPuedeRecibirRespuesta(config: ConfigWhatsApp, e164: string): boolean {
  if (config.realHabilitado) return true;
  if (config.pilotoNumeros.length === 0) return false;
  return config.pilotoNumeros.includes(e164);
}

/** Bloque: ¿hay credenciales suficientes para enviar por Graph API? (sin exponerlas) */
export function puedeEnviar(config: ConfigWhatsApp): boolean {
  return Boolean(config.token && config.phoneNumberId);
}
