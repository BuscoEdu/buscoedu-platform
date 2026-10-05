import type { SupabaseClient } from '@supabase/supabase-js';
import { enmascararTelefonoSesion } from '@/src/lib/phone';

/**
 * Lectura del hilo para la consola.
 * La aplicación es opcional: una sesión QA tiene persona y oportunidad, sin solicitud.
 */

export async function participantesDelHilo(
  db: SupabaseClient,
  oportunidadId: string
): Promise<{ personaId: string; aplicacionId: string | null } | null> {
  const { data: app, error: appError } = await db
    .from('aplicaciones')
    .select('id, persona_id')
    .eq('oportunidad_id', oportunidadId)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (appError) throw new Error(appError.message);
  if (app?.persona_id) {
    return { personaId: app.persona_id as string, aplicacionId: app.id as string };
  }

  const { data: oportunidad, error } = await db
    .from('oportunidades')
    .select('id, persona_id')
    .eq('id', oportunidadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!oportunidad?.persona_id) return null;
  return { personaId: oportunidad.persona_id as string, aplicacionId: null };
}

/** Quita el E.164 de la persona y deja solo la máscara de consola. */
export function personaSinTelefonoCompleto<T extends Record<string, unknown> | null | undefined>(persona: T) {
  if (!persona) return persona;
  const telefono = String(persona.celular_e164 || persona.telefono_principal || '');
  const resto = { ...persona };
  delete resto.celular_e164;
  delete resto.telefono_principal;
  return {
    ...resto,
    es_qa: persona.es_qa === true,
    telefonoEnmascarado: enmascararTelefonoSesion(telefono)
  };
}
