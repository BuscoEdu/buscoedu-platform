/**
 * BA-032 · Lectura del payload de webhook de WhatsApp Cloud API.
 *
 * Solo extrae lo que el orquestador necesita: mensajes de texto e
 * interactivos (list_reply / button_reply). Los statuses (sent/delivered/read/failed)
 * se cuentan para un log mínimo y no se procesan.
 */

export type TipoEntrante = 'texto' | 'lista' | 'boton' | 'otro';

/**
 * Remitente: teléfono (E.164) y/o BSUID. Al menos uno viene siempre.
 * Con nombres de usuario de WhatsApp, Meta puede omitir `from` y `contacts[].wa_id`
 * y mandar solo `from_user_id` / `contacts[].user_id` (business-scoped user id).
 */
export interface RemitenteEntrante {
  telefono: string | null;
  userId: string | null;
}

export interface MensajeEntrante {
  /** wamid.* — clave de idempotencia. */
  id: string;
  /** wa_id del remitente (solo dígitos, como lo manda Meta). '' si Meta solo mandó BSUID. */
  waId: string;
  /** Mismo número en E.164 (+dígitos). '' si Meta solo mandó BSUID (ver `remitente`). */
  e164: string;
  /**
   * Identidad completa del remitente (teléfono y/o BSUID). El parser siempre la llena;
   * es opcional para que los llamadores antiguos (solo teléfono) sigan compilando.
   * Usar `remitenteDe(m)` para leerla.
   */
  remitente?: RemitenteEntrante;
  /** Marca de tiempo del mensaje (ms desde época). */
  timestampMs: number;
  tipo: TipoEntrante;
  /** Texto escrito, o el título de la opción elegida. */
  texto: string;
  /** id de la fila/botón elegido (interactivos). */
  respuestaId: string | null;
  /**
   * true si el usuario compartió SU número tocando el botón request_contact_info
   * (mensaje type=contacts con origin=contact_request). El teléfono viene de ahí.
   */
  contactoCompartido?: boolean;
  /** phone_number_id que recibió el mensaje (para descartar otros números). */
  phoneNumberIdDestino: string | null;
}

/** Bloque: lectura compatible del remitente (si falta, se arma con el e164 de siempre). */
export function remitenteDe(m: Pick<MensajeEntrante, 'e164' | 'remitente'>): RemitenteEntrante {
  if (m.remitente) return m.remitente;
  return { telefono: m.e164 || null, userId: null };
}

/**
 * Bloque: clave estable del remitente para rate limit y logs internos.
 * Teléfono si lo hay (comportamiento de siempre); si no, `uid:<BSUID>`.
 */
export function claveRemitente(m: Pick<MensajeEntrante, 'e164' | 'remitente'>): string {
  const r = remitenteDe(m);
  return r.telefono || `uid:${r.userId || ''}`;
}

export interface ResultadoParseo {
  mensajes: MensajeEntrante[];
  statuses: number;
  /** Errores de estado reportados por Meta (solo códigos, sin datos personales). */
  codigosErrorStatus: number[];
}

function texto(valor: unknown, max = 4096): string {
  return typeof valor === 'string' ? valor.slice(0, max) : '';
}

// Bloque: BSUID tolerante. La doc dice CC.alfanumérico (hasta 128), pero aceptamos
// cualquier id corto de [A-Za-z0-9._-] para no volver a descartar mensajes en silencio.
const PATRON_USER_ID_TOLERANTE = /^[A-Za-z0-9][A-Za-z0-9._-]{1,159}$/;

function leerUserId(valor: unknown): string | null {
  const v = texto(valor, 160).trim();
  return v && PATRON_USER_ID_TOLERANTE.test(v) ? v : null;
}

function leerWaId(valor: unknown): string | null {
  const d = texto(valor, 32).replace(/\D/g, '');
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/**
 * Bloque: identidad del remitente con fallback.
 * Orden: `from` (teléfono) → `from_user_id` del mensaje (o `user_id`, por si acaso) →
 * `contacts[]` emparejado por wa_id, por índice (mismo largo que messages) o único contacto.
 * Exportada para que el diagnóstico use EXACTAMENTE la misma regla que el parser.
 */
export function identificarRemitente(raw: any, contactos: any[], indice: number, totalMensajes: number): RemitenteEntrante {
  const waIdFrom = leerWaId(raw?.from);
  let contacto: any = null;
  if (waIdFrom) contacto = contactos.find((c) => leerWaId(c?.wa_id) === waIdFrom) || null;
  if (!contacto && contactos.length === totalMensajes) contacto = contactos[indice] || null;
  if (!contacto && contactos.length === 1) contacto = contactos[0];

  const waId = waIdFrom || leerWaId(contacto?.wa_id);
  const userId = leerUserId(raw?.from_user_id) || leerUserId(raw?.user_id) || leerUserId(contacto?.user_id);
  return { telefono: waId ? `+${waId}` : null, userId };
}

/**
 * Bloque: número que el propio usuario compartió con el botón REQUEST_CONTACT_INFO.
 * Doc Meta (BSUID, "Webhook de contactos"): messages[].type='contacts', from_user_id, y
 * messages[].contacts[] con origin='contact_request' y phones[].wa_id/phone (sin vCard).
 * origin='other' es un contacto cualquiera compartido en el chat: NO es el remitente, se ignora.
 */
export function telefonoCompartidoPorBoton(raw: any): string | null {
  if (raw?.type !== 'contacts') return null;
  for (const c of Array.isArray(raw?.contacts) ? raw.contacts : []) {
    if (c?.origin !== 'contact_request') continue;
    for (const ph of Array.isArray(c?.phones) ? c.phones : []) {
      const d = leerWaId(ph?.wa_id) || leerWaId(ph?.phone);
      if (d) return `+${d}`;
    }
  }
  return null;
}

// Bloque: un mensaje individual → MensajeEntrante (o null si no aplica).
function leerMensaje(raw: any, phoneNumberId: string | null, contactos: any[], indice: number, total: number): MensajeEntrante | null {
  const id = texto(raw?.id, 256);
  let remitente = identificarRemitente(raw, contactos, indice, total);
  // Sin teléfono en `from`/`wa_id`: si compartió su número con el botón, se usa ese.
  const compartido = remitente.telefono ? null : telefonoCompartidoPorBoton(raw);
  if (compartido) remitente = { ...remitente, telefono: compartido };
  const ts = Number(raw?.timestamp);
  if (!id || (!remitente.telefono && !remitente.userId) || !Number.isFinite(ts)) return null;
  const waId = remitente.telefono ? remitente.telefono.slice(1) : '';

  const base = {
    id,
    waId,
    e164: remitente.telefono || '',
    remitente,
    ...(compartido ? { contactoCompartido: true } : {}),
    timestampMs: ts * 1000,
    phoneNumberIdDestino: phoneNumberId
  };

  if (raw?.type === 'text') {
    return { ...base, tipo: 'texto', texto: texto(raw?.text?.body).trim(), respuestaId: null };
  }

  if (raw?.type === 'interactive') {
    const inter = raw?.interactive;
    if (inter?.type === 'list_reply') {
      return {
        ...base,
        tipo: 'lista',
        texto: texto(inter?.list_reply?.title, 200),
        respuestaId: texto(inter?.list_reply?.id, 256) || null
      };
    }
    if (inter?.type === 'button_reply') {
      return {
        ...base,
        tipo: 'boton',
        texto: texto(inter?.button_reply?.title, 200),
        respuestaId: texto(inter?.button_reply?.id, 256) || null
      };
    }
  }

  // Botón de respuesta rápida de plantilla: lo tratamos como texto.
  if (raw?.type === 'button') {
    return { ...base, tipo: 'texto', texto: texto(raw?.button?.text, 200).trim(), respuestaId: null };
  }

  return { ...base, tipo: 'otro', texto: '', respuestaId: null };
}

/** Bloque: recorre entry[].changes[].value con field=messages. */
export function parsearWebhook(payload: unknown): ResultadoParseo {
  const resultado: ResultadoParseo = { mensajes: [], statuses: 0, codigosErrorStatus: [] };
  const p = payload as any;
  if (!p || p.object !== 'whatsapp_business_account' || !Array.isArray(p.entry)) return resultado;

  for (const entry of p.entry) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      if (change?.field !== 'messages') continue;
      const value = change?.value || {};
      const phoneNumberId = texto(value?.metadata?.phone_number_id, 64) || null;

      const contactos = Array.isArray(value?.contacts) ? value.contacts : [];
      const crudos = Array.isArray(value?.messages) ? value.messages : [];
      crudos.forEach((raw: any, i: number) => {
        const mensaje = leerMensaje(raw, phoneNumberId, contactos, i, crudos.length);
        if (mensaje) resultado.mensajes.push(mensaje);
      });

      for (const status of Array.isArray(value?.statuses) ? value.statuses : []) {
        resultado.statuses += 1;
        for (const err of Array.isArray(status?.errors) ? status.errors : []) {
          const codigo = Number(err?.code);
          if (Number.isFinite(codigo)) resultado.codigosErrorStatus.push(codigo);
        }
      }
    }
  }
  return resultado;
}
