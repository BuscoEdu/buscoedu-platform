/**
 * Sistema de tracking de eventos de negocio
 * Registra eventos de usuario en la tabla eventos_negocio
 */

import { supabase } from './supabase';
import { getCurrentVisitorId } from './visitor';

export type EventType =
  | 'naia_modal_abierto'
  | 'intencion_busqueda_enviada'
  | 'filtro_aplicado'
  | 'filtro_modificado'
  | 'filtro_retirado'
  | 'ficha_oferta_abierta'
  | 'ficha_oferta_cerrada'
  | 'oferta_agregada_mi_lista'
  | 'oferta_retirada_mi_lista'
  | 'intento_aplicar_oferta';

// Datos de un evento en formato del cliente; se exporta para tiparlo en las pruebas de construirFilaEvento.
export interface EventData {
  tipo_evento: EventType;
  oferta_id?: string;
  programa_id?: string;
  universidad_id?: string;
  metadata?: Record<string, any>;
}

/**
 * Arma la fila que se inserta en `eventos_negocio` con los nombres REALES de columnas.
 * Qué hace: traduce el formato del cliente (`tipo_evento`, `metadata`) al esquema de la tabla
 * (`evento`, `metadatos`) y pone la fecha en `creado_en`.
 * Para qué: antes se enviaban `tipo_evento`, `metadata` y `fecha_evento`, que no existen en la
 * tabla (PostgREST respondía PGRST204 y el evento se perdía). Las columnas reales salen de las
 * migraciones que ya insertan en la tabla (20260830103000 y 20261018160000: evento, persona_id,
 * oportunidad_id, universidad_id, programa_id, oferta_id, metadatos, generado_por, creado_en,
 * visitante_id) y de docs/BUSCOEDU_DATA_DICTIONARY.md. Función pura para poder probarla.
 */
export function construirFilaEvento(visitorId: string, eventData: EventData, ahora: Date = new Date()) {
  return {
    visitante_id: visitorId,
    evento: eventData.tipo_evento,
    oferta_id: eventData.oferta_id || null,
    programa_id: eventData.programa_id || null,
    universidad_id: eventData.universidad_id || null,
    // `metadatos` es jsonb NOT NULL (default '{}', confirmado por BD 2026-10-18): enviar null
    // haría fallar el insert, así que sin metadata se manda un objeto vacío.
    metadatos: eventData.metadata || {},
    // `creado_en` reemplaza a `fecha_evento` (columna inexistente). Se envía explícito, igual que
    // las funciones SQL y Demo WApp, para no depender de un DEFAULT que el repo no documenta.
    creado_en: ahora.toISOString()
  };
}

/**
 * Registra un evento de negocio
 */
export async function trackEvent(eventData: EventData): Promise<void> {
  // Obtener visitante ID (si existe)
  const visitorId = getCurrentVisitorId();
  
  if (!visitorId) {
    console.warn('No se puede registrar evento: visitante ID no disponible');
    return;
  }

  try {
    // Inserta con los nombres reales de columnas (ver construirFilaEvento); antes fallaba con PGRST204.
    const { error } = await supabase.from('eventos_negocio').insert(construirFilaEvento(visitorId, eventData));

    if (error) {
      console.error('Error registrando evento:', error);
    }
  } catch (err) {
    console.error('Error en trackEvent:', err);
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
    metadata: { intencion: intention }
  });
}

/**
 * Registra aplicación de filtro
 */
export function trackFilterApplied(filterKey: string, filterValue: string) {
  trackEvent({
    tipo_evento: 'filtro_aplicado',
    metadata: { filtro: filterKey, valor: filterValue }
  });
}

/**
 * Registra modificación de filtro
 */
export function trackFilterModified(filterKey: string, oldValue: string, newValue: string) {
  trackEvent({
    tipo_evento: 'filtro_modificado',
    metadata: { filtro: filterKey, valor_anterior: oldValue, valor_nuevo: newValue }
  });
}

/**
 * Registra remoción de filtro
 */
export function trackFilterRemoved(filterKey: string) {
  trackEvent({
    tipo_evento: 'filtro_retirado',
    metadata: { filtro: filterKey }
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
