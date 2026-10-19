/**
 * Diagnóstico enmascarado del webhook de WhatsApp (2026-10-19).
 *
 * Qué: arma, sin efectos secundarios, las líneas de log `wa_webhook_recibido`,
 * `wa_webhook_sin_contenido` y `wa_webhook_resultado`.
 * Por qué: el 19/10 a las 13:02:55 (hora Madrid) llegó un POST firmado de Meta que
 * respondió 200 sin dejar ni una línea de log, y no se pudo saber qué traía.
 *
 * Reglas de privacidad: nunca textos de mensajes, nombres, números completos
 * (máx. los 4 últimos dígitos) ni ids (wamid, phone_number_id, WABA): solo conteos,
 * tipos, nombres de campo y booleanos.
 */

import type { ConfigWhatsApp } from './config';
import { remitentePuedeRecibirRespuesta } from './config';
import { identificarRemitente } from './webhook-parser';

type ConfigDiagnostico = Pick<ConfigWhatsApp, 'phoneNumberId' | 'realHabilitado' | 'pilotoNumeros'> & {
  pilotoUserIds?: string[];
};

export interface DiagnosticoWebhook {
  evento: 'wa_webhook_recibido';
  /** `object` del payload si es un string corto (p. ej. whatsapp_business_account); si no, null. */
  object: string | null;
  json_valido: boolean;
  entradas: number;
  cambios: number;
  /** `change.field` de cada cambio (p. ej. messages, account_update). */
  campos: string[];
  mensajes: number;
  /** `message.type` de cada mensaje (text, interactive, image, reaction…). */
  tipos_mensaje: string[];
  estados: number;
  contactos: number;
  /** Remitentes (únicos) a los que el piloto sí / no deja responder. */
  remitentes_en_allowlist: { si: number; no: number };
  /** Últimos 4 dígitos de cada remitente único, enmascarados: ***1234. */
  remitente_ult4: string[];
  /** Remitentes únicos que traen teléfono (`from` o `contacts[].wa_id`). */
  remitentes_con_telefono: number;
  /** Remitentes únicos que SOLO traen BSUID (`from_user_id` / `contacts[].user_id`). */
  remitentes_solo_user_id: number;
  /** Últimos 4 caracteres del BSUID de cada remitente sin teléfono: uid:***ab12. */
  remitente_user_id_ult4: string[];
  /** ¿El phone_number_id del payload es el configurado? null si el payload no trae ninguno. */
  phone_number_id_coincide: boolean | null;
}

// Bloque: límites para que un payload enorme o raro no infle la línea de log.
const MAX_ELEMENTOS_LISTA = 20;
const MAX_LARGO_ETIQUETA = 40;

// Bloque: etiqueta segura (solo [a-z0-9_]) para tipos y nombres de campo.
// Por qué: son valores que manda Meta y no queremos que cuelen texto libre al log.
function etiqueta(valor: unknown): string {
  if (typeof valor !== 'string' || !valor) return 'desconocido';
  const limpio = valor.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, MAX_LARGO_ETIQUETA);
  return limpio || 'desconocido';
}

function agregarAcotado(lista: string[], valor: string) {
  if (lista.length < MAX_ELEMENTOS_LISTA) lista.push(valor);
}

function comoArreglo(valor: unknown): any[] {
  return Array.isArray(valor) ? valor : [];
}

/** Bloque: últimos 4 caracteres del BSUID con máscara (uid:***ab12); nunca el id completo. */
export function enmascararUserIdUlt4(valor: unknown): string {
  const v = typeof valor === 'string' ? valor.replace(/[^A-Za-z0-9]/g, '') : '';
  if (v.length < 6) return 'uid:***';
  return `uid:***${v.slice(-4)}`;
}

/** Bloque: últimos 4 dígitos con máscara (***1234); nunca el número completo. */
export function enmascararUlt4(valor: unknown): string {
  const digitos = typeof valor === 'string' ? valor.replace(/\D/g, '') : '';
  if (digitos.length < 4) return '***';
  return `***${digitos.slice(-4)}`;
}

function diagnosticoVacio(): DiagnosticoWebhook {
  return {
    evento: 'wa_webhook_recibido',
    object: null,
    json_valido: false,
    entradas: 0,
    cambios: 0,
    campos: [],
    mensajes: 0,
    tipos_mensaje: [],
    estados: 0,
    contactos: 0,
    remitentes_en_allowlist: { si: 0, no: 0 },
    remitente_ult4: [],
    remitentes_con_telefono: 0,
    remitentes_solo_user_id: 0,
    remitente_user_id_ult4: [],
    phone_number_id_coincide: null
  };
}

/**
 * Bloque: recorre el body crudo (ya con firma válida) y cuenta lo que trae.
 * Qué: a diferencia del parser, mira TODOS los cambios (cualquier `field`) y todos
 * los tipos de mensaje, para ver justo lo que el parser descarta.
 * Por qué: si Meta manda otra estructura, el parser devuelve vacío en silencio.
 * Puede lanzar ante datos muy raros: la ruta lo envuelve con `diagnosticarSeguro`.
 */
export function construirDiagnosticoWebhook(cuerpoCrudo: string, config: ConfigDiagnostico): DiagnosticoWebhook {
  const d = diagnosticoVacio();
  let payload: any;
  try {
    payload = JSON.parse(cuerpoCrudo);
  } catch {
    return d; // json_valido: false
  }
  d.json_valido = true;
  if (!payload || typeof payload !== 'object') return d;

  d.object = typeof payload.object === 'string' ? etiqueta(payload.object) : null;

  // Bloque: remitentes únicos con la MISMA regla de identidad que el parser (from → from_user_id → contacts[]).
  const remitentes = new Map<string, { telefono: string | null; userId: string | null }>();
  const phoneIds: string[] = [];

  for (const entry of comoArreglo(payload.entry)) {
    d.entradas += 1;
    for (const change of comoArreglo(entry?.changes)) {
      d.cambios += 1;
      agregarAcotado(d.campos, etiqueta(change?.field));
      const value = change?.value || {};

      const pnid = value?.metadata?.phone_number_id;
      if (typeof pnid === 'string' && pnid) phoneIds.push(pnid);

      const contactos = comoArreglo(value?.contacts);
      const mensajes = comoArreglo(value?.messages);
      mensajes.forEach((m, i) => {
        d.mensajes += 1;
        agregarAcotado(d.tipos_mensaje, etiqueta(m?.type));
        const r = identificarRemitente(m, contactos, i, mensajes.length);
        const clave = r.telefono || (r.userId ? `uid:${r.userId}` : '');
        if (clave && !remitentes.has(clave)) remitentes.set(clave, r);
      });
      d.estados += comoArreglo(value?.statuses).length;
      d.contactos += comoArreglo(value?.contacts).length;
    }
  }

  // Bloque: allowlist con la MISMA regla que usa la ruta (numeroPuedeRecibirRespuesta).
  for (const r of remitentes.values()) {
    if (remitentePuedeRecibirRespuesta(config, r)) d.remitentes_en_allowlist.si += 1;
    else d.remitentes_en_allowlist.no += 1;
    if (r.telefono) {
      d.remitentes_con_telefono += 1;
      agregarAcotado(d.remitente_ult4, enmascararUlt4(r.telefono));
    } else {
      d.remitentes_solo_user_id += 1;
      agregarAcotado(d.remitente_user_id_ult4, enmascararUserIdUlt4(r.userId));
    }
  }

  // Bloque: solo un booleano; el id en sí nunca sale al log.
  if (phoneIds.length > 0) {
    d.phone_number_id_coincide = Boolean(config.phoneNumberId) && phoneIds.every((id) => id === config.phoneNumberId);
  }
  return d;
}

/**
 * Bloque: versión que nunca lanza.
 * Qué: si algo falla, devuelve `wa_webhook_diag_error` con el nombre del error.
 * Por qué: el diagnóstico corre antes de responder a Meta; no puede tumbar el 200.
 */
export function diagnosticarSeguro(
  cuerpoCrudo: string,
  config: ConfigDiagnostico
): DiagnosticoWebhook | { evento: 'wa_webhook_diag_error'; error: string } {
  try {
    return construirDiagnosticoWebhook(cuerpoCrudo, config);
  } catch (error) {
    return { evento: 'wa_webhook_diag_error', error: nombreError(error) };
  }
}

/** Bloque: solo el nombre del error (TypeError, WhatsAppApiError…), nunca el mensaje. */
export function nombreError(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.name === 'string' && error.name) return etiquetaError(error.name);
  } catch {
    // sigue abajo
  }
  return 'desconocido';
}

function etiquetaError(nombre: string): string {
  return nombre.replace(/[^A-Za-z0-9_]/g, '').slice(0, MAX_LARGO_ETIQUETA) || 'desconocido';
}

/**
 * Bloque: línea `wa_webhook_sin_contenido` cuando el parser no sacó ni mensajes ni estados.
 * Por qué: es el caso que hoy no deja rastro (field distinto, estructura nueva, JSON roto…).
 */
export function construirSinContenido(diag: ReturnType<typeof diagnosticarSeguro>) {
  if (diag.evento !== 'wa_webhook_recibido') return { evento: 'wa_webhook_sin_contenido' as const, campos: [] as string[] };
  return {
    evento: 'wa_webhook_sin_contenido' as const,
    object: diag.object,
    json_valido: diag.json_valido,
    campos: diag.campos,
    tipos_mensaje: diag.tipos_mensaje
  };
}

export type DesenlaceWebhook = 'fuera_allowlist' | 'procesado' | 'sin_contenido' | 'solo_estados' | 'error';

export interface ResultadoWebhookLog {
  evento: 'wa_webhook_resultado';
  resultado: DesenlaceWebhook;
  mensajes: number;
  permitidos: number;
  rechazados: number;
  estados: number;
  duracion_ms: number;
  /** Conteo por resultado del orquestador (p. ej. { respondido: 1 }); sin ids ni textos. */
  resultados?: Record<string, number>;
  error?: string;
}

/** Bloque: línea final `wa_webhook_resultado` (sincrónica o desde after()). */
export function construirResultado(datos: {
  resultado: DesenlaceWebhook;
  mensajes: number;
  permitidos: number;
  rechazados: number;
  estados: number;
  inicioMs: number;
  ahoraMs?: number;
  resultados?: string[];
  error?: unknown;
}): ResultadoWebhookLog {
  const ahora = datos.ahoraMs ?? Date.now();
  const linea: ResultadoWebhookLog = {
    evento: 'wa_webhook_resultado',
    resultado: datos.resultado,
    mensajes: datos.mensajes,
    permitidos: datos.permitidos,
    rechazados: datos.rechazados,
    estados: datos.estados,
    duracion_ms: Math.max(0, Math.round(ahora - datos.inicioMs))
  };
  if (datos.resultados) {
    const conteo: Record<string, number> = {};
    for (const r of datos.resultados) {
      const k = etiqueta(r);
      conteo[k] = (conteo[k] || 0) + 1;
    }
    linea.resultados = conteo;
  }
  if (datos.resultado === 'error') linea.error = nombreError(datos.error);
  return linea;
}

/** Bloque: desenlace cuando no hay nada que mandar a after(). */
export function desenlaceSincronico(mensajes: number, permitidos: number, rechazados: number, estados: number): DesenlaceWebhook | null {
  if (permitidos > 0) return null; // lo decide el trabajo en after()
  if (rechazados > 0) return 'fuera_allowlist';
  if (mensajes === 0 && estados > 0) return 'solo_estados';
  return 'sin_contenido';
}
