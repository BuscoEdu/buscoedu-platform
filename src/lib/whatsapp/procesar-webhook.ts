/**
 * BA-032 · Lógica HTTP del webhook, separada de Next para poder probarla sin servidor.
 *
 * GET  → verificación de suscripción (200 + challenge en texto plano | 403).
 * POST → firma X-Hub-Signature-256 obligatoria (401 si falta/está mal o no hay secreto),
 *        parseo, y entrega de los mensajes al orquestador (la ruta lo hace después de responder).
 */

import type { ConfigWhatsApp } from './config';
import { remitentePuedeRecibirRespuesta } from './config';
import { firmaMetaValida, verificarSuscripcion } from './firma';
import type { DependenciasOrquestador, ResultadoProceso } from './orquestador';
import { enmascararRemitente, procesarMensajeEntrante } from './orquestador';
import type { MensajeEntrante } from './webhook-parser';
import { parsearWebhook, remitenteDe } from './webhook-parser';

export interface RespuestaHttp {
  status: number;
  cuerpo: string;
  contentType: string;
}

const TEXTO = 'text/plain; charset=utf-8';

export function manejarVerificacionGet(params: URLSearchParams, config: Pick<ConfigWhatsApp, 'verifyToken'>): RespuestaHttp {
  const challenge = verificarSuscripcion({
    mode: params.get('hub.mode'),
    token: params.get('hub.verify_token'),
    challenge: params.get('hub.challenge'),
    verifyTokenEsperado: config.verifyToken
  });
  if (challenge === null) return { status: 403, cuerpo: 'Forbidden', contentType: TEXTO };
  return { status: 200, cuerpo: challenge, contentType: TEXTO };
}

export interface ResultadoPost {
  respuesta: RespuestaHttp;
  /** Mensajes a procesar después de responder 200 (vacío si la firma falló). */
  mensajes: MensajeEntrante[];
  statuses: number;
}

// Bloque: valida la firma sobre el body CRUDO antes de parsear nada.
export function manejarPostWebhook(
  cuerpoCrudo: string,
  cabeceraFirma: string | null,
  config: Pick<ConfigWhatsApp, 'appSecret'>
): ResultadoPost {
  if (!config.appSecret || !firmaMetaValida(cuerpoCrudo, cabeceraFirma, config.appSecret)) {
    return { respuesta: { status: 401, cuerpo: 'Unauthorized', contentType: TEXTO }, mensajes: [], statuses: 0 };
  }
  let payload: unknown = null;
  try {
    payload = JSON.parse(cuerpoCrudo);
  } catch {
    // Firma válida pero JSON roto: respondemos 200 para que Meta no reintente en bucle.
    return { respuesta: { status: 200, cuerpo: 'EVENT_RECEIVED', contentType: TEXTO }, mensajes: [], statuses: 0 };
  }
  const parseo = parsearWebhook(payload);
  return {
    respuesta: { status: 200, cuerpo: 'EVENT_RECEIVED', contentType: TEXTO },
    mensajes: parseo.mensajes,
    statuses: parseo.statuses
  };
}

/** Procesa en orden (un mismo número no debe atenderse en paralelo dentro del lote). */
export async function procesarLote(mensajes: MensajeEntrante[], deps: DependenciasOrquestador): Promise<ResultadoProceso[]> {
  const resultados: ResultadoProceso[] = [];
  for (const mensaje of mensajes) {
    resultados.push(await procesarMensajeEntrante(mensaje, deps));
  }
  return resultados;
}

/**
 * Bloque: filtro previo del piloto cerrado, ANTES de crear clientes de base de datos.
 * Los remitentes fuera de la allowlist (por teléfono o por BSUID) solo dejan un log mínimo (enmascarado).
 * El orquestador vuelve a comprobarlo (defensa en profundidad).
 */
export function filtrarPermitidos(
  mensajes: MensajeEntrante[],
  config: ConfigWhatsApp
): { permitidos: MensajeEntrante[]; rechazados: string[] } {
  const permitidos: MensajeEntrante[] = [];
  const rechazados: string[] = [];
  for (const m of mensajes) {
    const remitente = remitenteDe(m);
    if (remitentePuedeRecibirRespuesta(config, remitente)) permitidos.push(m);
    else rechazados.push(enmascararRemitente(remitente));
  }
  return { permitidos, rechazados };
}
