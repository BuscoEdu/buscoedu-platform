import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Aislamiento de sesiones y leads de prueba.
 * El lead sí se crea (aplicación + transferencia), marcado es_qa.
 * La transferencia queda no facturable y no se notifica a la universidad.
 * Quien no es super-admin no la ve en conteos, bandejas ni fichas.
 */

/**
 * Listados y conteos de negocio: el super-admin sigue viendo la fila de prueba.
 * El resto de la consulta queda con es_qa = false.
 * El builder de Supabase es any a propósito: el genérico se vuelve infinito.
 */
export function consultaSinQa(consulta: any, esSuper: boolean): any {
  if (esSuper) return consulta;
  return consulta.eq('es_qa', false);
}

/** La oportunidad es de prueba y esta sesión no debe verla ni operarla. */
export async function oportunidadFueraDeBandeja(
  db: SupabaseClient,
  oportunidadId: string,
  esSuper: boolean
): Promise<boolean> {
  if (esSuper) return false;
  return leerEsQa(db, oportunidadId);
}

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
 * Marca persona, oportunidad y aplicación. La transferencia se conserva
 * pero deja de ser entregable a la universidad.
 */
export async function oportunidadEsQa(db: SupabaseClient, oportunidadId: string): Promise<boolean> {
  return leerEsQa(db, oportunidadId);
}

export async function marcarLeadQa(
  db: SupabaseClient,
  input: { personaId: string; oportunidadId: string }
): Promise<void> {
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
  const aplicacion = await db
    .from('aplicaciones')
    .update({ es_qa: true, actualizado_en: ahora })
    .eq('oportunidad_id', input.oportunidadId);
  if (aplicacion.error) throw new Error(aplicacion.error.message);
  await retirarTransferenciaUniversidad(db, input.oportunidadId);
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

/**
 * La transferencia QA se conserva (la crea la conversión) pero no es entregable:
 * es_qa y es_facturable en false, como el CHECK de BD.
 */
export async function retirarTransferenciaUniversidad(db: SupabaseClient, oportunidadId: string): Promise<void> {
  const ahora = new Date().toISOString();
  const transferencia = await db
    .from('transferencias_universidad')
    .update({ es_qa: true, es_facturable: false, actualizado_en: ahora })
    .eq('oportunidad_id', oportunidadId);
  if (transferencia.error) throw new Error(transferencia.error.message);
}
