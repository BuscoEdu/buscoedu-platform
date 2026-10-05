import { randomBytes, randomInt } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { enmascararTelefonoSesion } from '@/src/lib/phone';

/**
 * Alta de un hilo de prueba para Demo WApp.
 * Crea persona y oportunidad con es_qa. No crea aplicación ni transferencia.
 * El celular sintético usa el rango móvil 399, no asignado en Colombia,
 * para que fn_ba031 (busca persona por celular_e164) no ate el hilo a un estudiante real.
 * Forma guardada: +57399000XXXX. Forma legible: +57 399 000 XXXX.
 */

const PREFIJO_TELEFONO_QA = '+57399000';
const VENTANA_MS = 60_000;
const MAX_POR_VENTANA = 8;
const golpes = new Map<string, number[]>();

export function normalizarEtiquetaQa(valor: unknown): string | null {
  const texto = String(valor ?? '').replace(/\s+/g, ' ').trim();
  if (texto.length < 2 || texto.length > 80) return null;
  const conPrefijo = texto.startsWith('QA ') ? texto : `QA ${texto}`;
  return conPrefijo.slice(0, 80);
}

/** Tope simple en memoria, por operador. No sustituye un límite de borde. */
export function permitirAltaQa(claveOperador: string, ahora = Date.now()): boolean {
  const recientes = (golpes.get(claveOperador) || []).filter((marca) => ahora - marca < VENTANA_MS);
  if (recientes.length >= MAX_POR_VENTANA) {
    golpes.set(claveOperador, recientes);
    return false;
  }
  recientes.push(ahora);
  golpes.set(claveOperador, recientes);
  return true;
}

/**
 * Cuatro dígitos al azar sobre +57 399 000.
 * No inserta si ese E.164 ya está en celular_e164 o en telefono_principal.
 */
async function telefonoLibre(db: SupabaseClient): Promise<string | null> {
  for (let intento = 0; intento < 8; intento += 1) {
    const sufijo = String(randomInt(0, 10000)).padStart(4, '0');
    const e164 = `${PREFIJO_TELEFONO_QA}${sufijo}`;
    const [porCelular, porPrincipal] = await Promise.all([
      db.from('personas').select('id').eq('celular_e164', e164).limit(1),
      db.from('personas').select('id').eq('telefono_principal', e164).limit(1)
    ]);
    if (porCelular.error) throw new Error(porCelular.error.message);
    if (porPrincipal.error) throw new Error(porPrincipal.error.message);
    if ((porCelular.data || []).length === 0 && (porPrincipal.data || []).length === 0) return e164;
  }
  return null;
}

async function etapaInicial(db: SupabaseClient): Promise<{ etapaId: string; subestadoId: string | null } | null> {
  const { data: etapa, error } = await db
    .from('etapas_embudo')
    .select('id')
    .eq('activo', true)
    .eq('es_etapa_final_ganada', false)
    .eq('es_etapa_final_perdida', false)
    .order('orden', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!etapa?.id) return null;
  const { data: subestado } = await db
    .from('subestados_oportunidad')
    .select('id')
    .eq('etapa_id', etapa.id)
    .eq('activo', true)
    .order('orden', { ascending: true })
    .limit(1)
    .maybeSingle();
  return { etapaId: etapa.id as string, subestadoId: (subestado?.id as string) || null };
}

export interface AltaQa {
  oportunidadId: string;
  codigo: string;
  telefonoEnmascarado: string;
  esQa: true;
}

/**
 * Inserta la pareja de prueba. Si la oportunidad no entra, borra la persona
 * para no dejar un celular sintético suelto.
 */
export async function crearSesionQa(db: SupabaseClient, etiqueta: string): Promise<AltaQa> {
  const telefono = await telefonoLibre(db);
  if (!telefono) {
    throw Object.assign(new Error('No encontré un teléfono sintético libre.'), { codigo: 'telefono_qa_agotado' });
  }
  const etapa = await etapaInicial(db);
  if (!etapa) {
    throw Object.assign(new Error('No hay etapa inicial para abrir el hilo QA.'), { codigo: 'etapa_inicial_inexistente' });
  }

  const ahora = new Date().toISOString();
  const { data: persona, error: personaError } = await db
    .from('personas')
    .insert({
      nombres: etiqueta,
      apellidos: 'WApp',
      telefono_principal: telefono,
      celular_e164: telefono,
      pais_celular: 'CO',
      telefono_verificado: false,
      estado_relacion: 'estudiante_registrado',
      estado: 'activo',
      canal_origen: 'demo_wapp',
      es_qa: true,
      creado_en: ahora,
      actualizado_en: ahora
    })
    .select('id')
    .single();
  if (personaError || !persona) {
    throw new Error(personaError?.message || 'No se pudo crear la persona QA.');
  }

  const codigo = `QA-${randomBytes(4).toString('hex').toUpperCase()}`;
  const { data: oportunidad, error: oportunidadError } = await db
    .from('oportunidades')
    .insert({
      persona_id: persona.id,
      codigo,
      nombre: etiqueta,
      etapa_id: etapa.etapaId,
      subestado_id: etapa.subestadoId,
      tipo_oportunidad: 'estudiante',
      temperatura: 'frio',
      puntaje: 0,
      origen: 'demo_wapp_qa',
      canal_origen: 'demo_wapp',
      estado: 'activa',
      es_qa: true,
      creado_en: ahora,
      actualizado_en: ahora
    })
    .select('id, codigo')
    .single();

  if (oportunidadError || !oportunidad) {
    await db.from('personas').delete().eq('id', persona.id);
    throw new Error(oportunidadError?.message || 'No se pudo crear la oportunidad QA.');
  }

  return {
    oportunidadId: oportunidad.id as string,
    codigo: (oportunidad.codigo as string) || codigo,
    telefonoEnmascarado: enmascararTelefonoSesion(telefono),
    esQa: true
  };
}
