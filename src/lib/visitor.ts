/**
 * Sistema de gestión de visitante anónimo
 * Crea y gestiona identificadores UUID para usuarios no registrados
 */

import { supabase } from './supabase';

const VISITOR_ID_KEY = 'buscoedu_identificador_navegacion';

/**
 * Genera un UUID v4 simple
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Obtiene o crea el identificador de visitante anónimo
 * - Si existe en localStorage, lo retorna
 * - Si no existe, crea uno nuevo (solo local; el servidor crea la fila en `visitantes`)
 */
export async function getOrCreateVisitorId(): Promise<string> {
  // Verificar si ya existe en localStorage
  if (typeof window === 'undefined') {
    return ''; // SSR - no procesar
  }

  let visitorId = localStorage.getItem(VISITOR_ID_KEY);

  if (visitorId) {
    return visitorId;
  }

  // Crear nuevo identificador
  visitorId = generateUUID();
  localStorage.setItem(VISITOR_ID_KEY, visitorId);

  // Ya NO se inserta en `visitantes` desde el navegador (2026-10-19): con la clave anon RLS lo
  // rechazaba (42501 → HTTP 401 en consola) y la fila nunca se creaba. Para qué: la fila la asegura
  // el servidor con service role al primer evento (POST /api/eventos) y al convertir
  // (/api/leadcenter/convertir, funnel Demo WApp), que ya reparaban ese caso.
  return visitorId;
}

/**
 * Actualiza la última actividad del visitante
 */
export async function updateVisitorActivity(visitorId: string): Promise<void> {
  if (!visitorId || typeof window === 'undefined') return;

  try {
    await supabase
      .from('visitantes')
      .update({ ultimo_acceso_en: new Date().toISOString() })
      .eq('id', visitorId);
  } catch (err) {
    console.warn('Error actualizando actividad visitante:', err);
  }
}

/**
 * Obtiene el ID del visitante actual (sin crear uno nuevo)
 */
export function getCurrentVisitorId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(VISITOR_ID_KEY);
}
