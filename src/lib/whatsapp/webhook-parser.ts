/**
 * BA-032 · Lectura del payload de webhook de WhatsApp Cloud API.
 *
 * Solo extrae lo que el orquestador necesita: mensajes de texto e
 * interactivos (list_reply / button_reply). Los statuses (sent/delivered/read/failed)
 * se cuentan para un log mínimo y no se procesan.
 */

export type TipoEntrante = 'texto' | 'lista' | 'boton' | 'otro';

export interface MensajeEntrante {
  /** wamid.* — clave de idempotencia. */
  id: string;
  /** wa_id del remitente (solo dígitos, como lo manda Meta). */
  waId: string;
  /** Mismo número en E.164 (+dígitos). */
  e164: string;
  /** Marca de tiempo del mensaje (ms desde época). */
  timestampMs: number;
  tipo: TipoEntrante;
  /** Texto escrito, o el título de la opción elegida. */
  texto: string;
  /** id de la fila/botón elegido (interactivos). */
  respuestaId: string | null;
  /** phone_number_id que recibió el mensaje (para descartar otros números). */
  phoneNumberIdDestino: string | null;
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

// Bloque: un mensaje individual → MensajeEntrante (o null si no aplica).
function leerMensaje(raw: any, phoneNumberId: string | null): MensajeEntrante | null {
  const id = texto(raw?.id, 256);
  const waId = texto(raw?.from, 32).replace(/\D/g, '');
  const ts = Number(raw?.timestamp);
  if (!id || !waId || !Number.isFinite(ts)) return null;

  const base = {
    id,
    waId,
    e164: `+${waId}`,
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

      for (const raw of Array.isArray(value?.messages) ? value.messages : []) {
        const mensaje = leerMensaje(raw, phoneNumberId);
        if (mensaje) resultado.mensajes.push(mensaje);
      }

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
