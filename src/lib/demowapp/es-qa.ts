import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Aislamiento de sesiones y leads de prueba.
 * El registro sí se crea (es_qa), pero no sale hacia la universidad:
 * no queda transferencia y los pushes con destino IES se cancelan.
 */

export function esQa(valor: unknown): boolean {
  return valor === true;
}

/** Un push va a la IES si la plantilla o los metadatos hablan de universidad, transferencia o panel B2B. */
export function pushVaAUniversidad(row: {
  plantilla?: string | null;
  metadatos?: Record<string, unknown> | null;
}): boolean {
  const meta = row.metadatos || {};
  const texto = [row.plantilla, meta.destino, meta.metodo_entrega, meta.canal_externo, meta.tipo]
    .filter((parte): parte is string => typeof parte === 'string')
    .join(' ')
    .toLowerCase();
  return /universidad|transferencia|panel_b2b|\bies\b/.test(texto);
}

async function leerEsQa(db: SupabaseClient, oportunidadId: string): Promise<boolean> {
  const { data, error } = await db
    .from('oportunidades')
    .select('es_qa')
    .eq('id', oportunidadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return esQa((data as { es_qa?: unknown } | null)?.es_qa);
}

/**
 * Marca el lead como prueba y retira la transferencia a la IES.
 * Primero borra la entrega: si el update falla, la universidad ya no la tiene en cola.
 */
export async function marcarLeadQa(
  db: SupabaseClient,
  input: { personaId: string; oportunidadId: string }
): Promise<void> {
  await retirarTransferenciaUniversidad(db, input.oportunidadId);
  const ahora = new Date().toISOString();
  const oportunidad = await db
    .from('oportunidades')
    .update({ es_qa: true, actualizado_en: ahora })
    .eq('id', input.oportunidadId);
  if (oportunidad.error) throw new Error(oportunidad.error.message);
  const persona = await db
    .from('personas')
    .update({ es_qa: true, actualizado_en: ahora })
    .eq('id', input.personaId);
  if (persona.error) throw new Error(persona.error.message);
}

/**
 * Si el hilo de la conversación es QA, el lead que acaba de nacer queda marcado
 * y no se entrega a la universidad. Si el hilo no es QA, no toca nada.
 */
export async function sellarLeadQa(
  db: SupabaseClient,
  input: { hiloId: string; personaId: string; oportunidadId: string }
): Promise<void> {
  if (!(await leerEsQa(db, input.hiloId))) return;
  await marcarLeadQa(db, input);
}

/** Quita la entrega a la IES de un lead que no debe salir del corredor de prueba. */
export async function retirarTransferenciaUniversidad(db: SupabaseClient, oportunidadId: string): Promise<void> {
  const transferencia = await db.from('transferencias_universidad').delete().eq('oportunidad_id', oportunidadId);
  if (transferencia.error) throw new Error(transferencia.error.message);
}
