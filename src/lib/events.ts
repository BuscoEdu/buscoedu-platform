/**
 * Sistema de tracking de eventos de negocio (lado navegador).
 * Envía cada evento a POST /api/eventos; el servidor lo guarda en `eventos_negocio` con service
 * role. Desde 2026-10-19 el navegador ya no inserta en la tabla con la clave anon (RLS lo rechazaba).
 */

import { getCurrentVisitorId } from './visitor';
import type { EventData } from './eventos-contrato';

// Bloque reexportes: el contrato (tipos, lista permitida y construirFilaEvento) vive ahora en
// `eventos-contrato.ts`, compartido con el servidor. Se reexporta para no romper imports existentes.
export { construirFilaEvento, EVENTOS_PERMITIDOS } from './eventos-contrato';
export type { EventData, EventType } from './eventos-contrato';

/** Ruta del servidor que guarda los eventos con service role (ver app/api/eventos/route.ts). */
export const RUTA_EVENTOS = '/api/eventos';

/**
 * Arma el cuerpo JSON del POST /api/eventos con los nombres del contrato (columnas reales).
 * Qué: `tipo_evento` → `evento`, `metadata` → `metadatos`; omite ids vacíos.
 * Para qué: el servidor rechaza campos desconocidos y fija él mismo `creado_en` y `generado_por`.
 */
export function construirCuerpoEvento(visitorId: string, eventData: EventData): Record<string, unknown> {
  const cuerpo: Record<string, unknown> = { evento: eventData.tipo_evento, visitante_id: visitorId };
  if (eventData.oferta_id) cuerpo.oferta_id = eventData.oferta_id;
  if (eventData.programa_id) cuerpo.programa_id = eventData.programa_id;
  if (eventData.universidad_id) cuerpo.universidad_id = eventData.universidad_id;
  if (eventData.metadata && Object.keys(eventData.metadata).length > 0) cuerpo.metadatos = eventData.metadata;
  return cuerpo;
}

/**
 * Registra un evento de negocio enviándolo a POST /api/eventos (fire-and-forget).
 * Qué: usa fetch con `keepalive` (sobrevive al router.push que sigue a varios eventos) y, si no
 * hay fetch, `navigator.sendBeacon`. Nunca lanza: cualquier fallo solo deja un aviso en consola.
 * Por qué: antes insertaba directo en `eventos_negocio` con la clave anon y RLS lo rechazaba
 * (42501 / HTTP 401); el navegador ya no toca esa tabla. Los callers no cambian.
 */
export async function trackEvent(eventData: EventData): Promise<void> {
  try {
    const visitorId = getCurrentVisitorId();
    if (!visitorId) {
      console.warn('No se puede registrar evento: visitante ID no disponible');
      return;
    }
    const cuerpo = JSON.stringify(construirCuerpoEvento(visitorId, eventData));

    if (typeof fetch === 'function') {
      const respuesta = await fetch(RUTA_EVENTOS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: cuerpo,
        keepalive: true,
        credentials: 'same-origin'
      });
      if (!respuesta.ok) console.warn('Evento no registrado:', respuesta.status);
      return;
    }

    // Respaldo sin fetch: sendBeacon con text/plain (tipo "simple"; el servidor lee el texto como JSON).
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(RUTA_EVENTOS, new Blob([cuerpo], { type: 'text/plain;charset=UTF-8' }));
    }
  } catch (err) {
    console.warn('Error en trackEvent:', err);
  }
}

/**
 * Registra apertura del modal de NaIA
 */
export function trackNaiaModalOpened() {
  trackEvent({ tipo_evento: 'naia_modal_abierto' });
}

/**
 * Registra envío de intención de búsqueda
 */
export function trackSearchIntention(intention: string) {
  trackEvent({
    tipo_evento: 'intencion_busqueda_enviada',
    // Se recorta a 500 caracteres: es el tope por texto que acepta el servidor en `metadatos`.
    metadata: { intencion: intention.slice(0, 500) }
  });
}

/**
 * Registra apertura de ficha de oferta
 */
export function trackOfferOpened(ofertaId: string, programaId?: string, universidadId?: string) {
  trackEvent({
    tipo_evento: 'ficha_oferta_abierta',
    oferta_id: ofertaId,
    programa_id: programaId,
    universidad_id: universidadId
  });
}

/**
 * Registra cierre de ficha de oferta
 */
export function trackOfferClosed(ofertaId: string) {
  trackEvent({
    tipo_evento: 'ficha_oferta_cerrada',
    oferta_id: ofertaId
  });
}

/**
 * Registra adición de oferta a Mi Lista
 */
export function trackOfferAddedToMyList(ofertaId: string, programaId?: string, universidadId?: string) {
  trackEvent({
    tipo_evento: 'oferta_agregada_mi_lista',
    oferta_id: ofertaId,
    programa_id: programaId,
    universidad_id: universidadId
  });
}

/**
 * Registra remoción de oferta de Mi Lista
 */
export function trackOfferRemovedFromMyList(ofertaId: string) {
  trackEvent({
    tipo_evento: 'oferta_retirada_mi_lista',
    oferta_id: ofertaId
  });
}

/**
 * Registra intento de aplicar a oferta
 */
export function trackApplyAttempt(ofertaId: string, programaId?: string, universidadId?: string) {
  trackEvent({
    tipo_evento: 'intento_aplicar_oferta',
    oferta_id: ofertaId,
    programa_id: programaId,
    universidad_id: universidadId
  });
}
