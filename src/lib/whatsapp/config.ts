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
  /** Piloto cerrado: BSUID (usuarios con nombre de usuario sin teléfono visible) que sí reciben respuesta. */
  pilotoUserIds: string[];
  /** true si la variable de piloto existe pero es inválida (se trata como vacía). */
  pilotoInvalido: boolean;
  /** Interruptor de conversión a lead (oportunidad / transferencia facturable). */
  leadConversionHabilitada: boolean;
  /** Mensajes entrantes por número y por minuto antes de dejar de responder. */
  limiteMensajesPorMinuto: number;
  /**
   * Simulación de preview (C-55): WA_SIMULACION='true' y VERCEL_ENV distinto de 'production'.
   * La salida va al log (no a Meta), la conversión a lead queda apagada y los datos se marcan como QA.
   * En producción es siempre false (fail-closed), aunque la variable exista.
   */
  simulacion: boolean;
}

// Bloque: lectura estricta de booleanos. Solo el string exacto 'true' enciende.
export function esVerdaderoEstricto(valor: string | undefined): boolean {
  return valor === 'true';
}

/**
 * Bloque: formato de BSUID (business-scoped user id) según la doc oficial de Meta
 * (https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids):
 * código de país ISO 3166 alfa-2 + '.' + hasta 128 alfanuméricos (p. ej. US.13491208655302741918).
 * El BSUID "principal" (parent) trae '.ENT.' en medio (p. ej. US.ENT.11815799212886844830).
 */
export const PATRON_USER_ID = /^[A-Z]{2}(?:\.ENT)?\.[A-Za-z0-9]{1,128}$/;

/** Bloque: prefijo explícito para entradas de allowlist que son BSUID (uid:CO.123…). */
export const PREFIJO_USER_ID = 'uid:';

export interface AllowlistPiloto {
  numeros: string[];
  /** BSUID permitidos (sin el prefijo uid:). */
  userIds: string[];
  /** true si la lista no deja pasar a nadie aunque la variable traiga algo (todas inválidas o > 5). */
  invalida: boolean;
  validas: number;
  invalidas: number;
}

/**
 * Bloque: normaliza UNA entrada de la allowlist.
 * Qué: BSUID (con prefijo uid: o detectado por formato) o celular E.164.
 * - quita espacios, guiones, paréntesis y puntos de los teléfonos;
 * - si son solo dígitos se antepone '+' (se asume que ya traen indicativo de país);
 * - 10 dígitos que empiezan por 3 = celular colombiano SIN indicativo: no adivinamos, inválida.
 * Por qué: en Vercel prod el valor quedó con 12 dígitos sin '+' y la lista entera se invalidaba.
 */
export function normalizarEntradaAllowlist(entrada: string): { tipo: 'telefono' | 'user_id'; valor: string } | null {
  const limpia = (entrada || '').trim();
  if (!limpia) return null;
  if (limpia.toLowerCase().startsWith(PREFIJO_USER_ID)) {
    const uid = limpia.slice(PREFIJO_USER_ID.length).trim();
    return PATRON_USER_ID.test(uid) ? { tipo: 'user_id', valor: uid } : null;
  }
  if (PATRON_USER_ID.test(limpia)) return { tipo: 'user_id', valor: limpia };
  let tel = limpia.replace(/[\s\-().]/g, '');
  if (/^\d+$/.test(tel)) {
    if (tel.length === 10 && tel.startsWith('3')) return null;
    tel = `+${tel}`;
  }
  return PATRON_E164.test(tel) ? { tipo: 'telefono', valor: tel } : null;
}

/**
 * Bloque: allowlist del piloto. Lista separada por comas (E.164 y/o BSUID).
 * Las entradas inválidas se descartan una por una (ya no tumban la lista completa).
 * Sigue siendo fail-closed: vacía, todas inválidas o más de 5 → no se responde a nadie.
 */
export function leerAllowlistPiloto(valor: string | undefined): AllowlistPiloto {
  const vacia: AllowlistPiloto = { numeros: [], userIds: [], invalida: false, validas: 0, invalidas: 0 };
  if (!valor || !valor.trim()) return vacia;
  const partes = valor
    .split(',')
    .map((parte) => parte.trim())
    .filter(Boolean);
  if (partes.length === 0) return vacia;

  const numeros = new Set<string>();
  const userIds = new Set<string>();
  let invalidas = 0;
  for (const parte of partes) {
    const n = normalizarEntradaAllowlist(parte);
    if (!n) invalidas += 1;
    else if (n.tipo === 'telefono') numeros.add(n.valor);
    else userIds.add(n.valor);
  }
  const validas = numeros.size + userIds.size;
  // Regla de Producto: máximo 5 personas en el piloto. Si hay más, no adivinamos cuáles: nadie.
  if (validas > MAX_NUMEROS_PILOTO) return { ...vacia, invalida: true, validas, invalidas };
  if (validas === 0) return { ...vacia, invalida: true, invalidas };
  return { numeros: Array.from(numeros), userIds: Array.from(userIds), invalida: false, validas, invalidas };
}

// Bloque: el aviso `wa_allowlist_invalida` sale una sola vez por arranque en frío (instancia).
// Por qué: leerConfigWhatsApp corre en cada request y no queremos inundar los logs.
let avisoAllowlistEmitido = false;
type LogAllowlist = (linea: Record<string, unknown>) => void;
const logAllowlistPorDefecto: LogAllowlist = (linea) => console.info(JSON.stringify({ origen: 'wa_config', ...linea }));

/** Solo conteos, nunca las entradas. */
export function avisarAllowlistUnaVez(piloto: AllowlistPiloto, log: LogAllowlist = logAllowlistPorDefecto): boolean {
  if (avisoAllowlistEmitido) return false;
  if (piloto.invalidas === 0 && !piloto.invalida) return false;
  avisoAllowlistEmitido = true;
  try {
    log({ evento: 'wa_allowlist_invalida', validas: piloto.validas, invalidas: piloto.invalidas, lista_bloqueada: piloto.invalida });
  } catch {
    // El log nunca debe tumbar la lectura de configuración.
  }
  return true;
}

/** Solo para tests: permite volver a emitir el aviso. */
export function reiniciarAvisoAllowlist(): void {
  avisoAllowlistEmitido = false;
}

export function leerConfigWhatsApp(env: EntornoLectura = process.env): ConfigWhatsApp {
  const piloto = leerAllowlistPiloto(env.WA_PILOTO_NUMEROS);
  avisarAllowlistUnaVez(piloto);
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
    pilotoUserIds: piloto.userIds,
    pilotoInvalido: piloto.invalida,
    // Con simulación nunca hay lead (el preview usa la BD de producción, C-56).
    leadConversionHabilitada: esVerdaderoEstricto(env.WA_LEAD_CONVERSION_ENABLED) && !simulacionActiva(env),
    limiteMensajesPorMinuto: Number.isFinite(limite) && limite >= 1 && limite <= 120 ? Math.floor(limite) : 20,
    simulacion: simulacionActiva(env)
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

/** Remitente de WhatsApp: teléfono E.164 si Meta lo manda, BSUID si lo manda (pueden venir ambos). */
export interface RemitenteWa {
  telefono: string | null;
  userId: string | null;
}

/**
 * Bloque: allowlist por remitente (teléfono O BSUID).
 * Qué: pasa si el teléfono está en la lista o si el BSUID está en la lista.
 * Por qué: con los nombres de usuario de WhatsApp, Meta puede omitir `from` y mandar solo `from_user_id`.
 */
export function remitentePuedeRecibirRespuesta(
  config: Pick<ConfigWhatsApp, 'realHabilitado' | 'pilotoNumeros'> & { pilotoUserIds?: string[] },
  remitente: RemitenteWa
): boolean {
  if (config.realHabilitado) return Boolean(remitente.telefono || remitente.userId);
  if (remitente.telefono && config.pilotoNumeros.includes(remitente.telefono)) return true;
  if (remitente.userId && (config.pilotoUserIds || []).includes(remitente.userId)) return true;
  return false;
}

/** Bloque: ¿hay credenciales suficientes para enviar por Graph API? (sin exponerlas) */
// Bloque: la simulación solo vale fuera de producción (VERCEL_ENV !== 'production'); en prod se ignora.
export function simulacionActiva(env: EntornoLectura): boolean {
  return esVerdaderoEstricto(env.WA_SIMULACION) && (env.VERCEL_ENV || '').trim() !== 'production';
}

export function puedeEnviar(config: ConfigWhatsApp): boolean {
  // En simulación no se llama a Meta: no hacen falta token ni phone number id.
  if (config.simulacion) return true;
  return Boolean(config.token && config.phoneNumberId);
}
