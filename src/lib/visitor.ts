/**
 * Sistema de gestión de visitante anónimo
 * Crea y gestiona identificadores UUID para usuarios no registrados
 */

import { getSupabaseClient } from './supabase';

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
 * - Si no existe, crea uno nuevo y lo registra en Supabase
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

  // Registrar en Supabase (visitantes table)
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('visitantes').insert({
      id: visitorId,
      fecha_primera_visita: new Date().toISOString(),
      fecha_ultima_actividad: new Date().toISOString(),
    });

    if (error) {
      console.warn('Error registrando visitante:', error.message);
      // No bloqueamos - el UUID local sigue siendo válido
    }
  } catch (err) {
    console.warn('Error al conectar con Supabase:', err);
  }

  return visitorId;
}

/**
 * Actualiza la última actividad del visitante
 */
export async function updateVisitorActivity(visitorId: string): Promise<void> {
  if (!visitorId || typeof window === 'undefined') return;

  try {
    const supabase = getSupabaseClient();
    await supabase
      .from('visitantes')
      .update({ fecha_ultima_actividad: new Date().toISOString() })
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
