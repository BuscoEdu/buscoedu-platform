/**
 * BA-029 — resolución explícita de canal. BA-039 — sin lista fija en código.
 *
 * Misma NaIA, distinta fila de `configuraciones_agente_canal` y distinto
 * componente `tipo_contexto=canal`. No hay segundo bot ni tablas nuevas.
 *
 * BA-039: el canal válido se lee de `canales_ia.activo` (ver `canalesActivos.ts`).
 * Fail-closed: un código desconocido o inactivo, un error de BD o una tabla
 * sin canales activos se rechazan; nunca caen en silencio al canal web.
 */

import { getServiceRoleClient } from '@/src/lib/supabase-server';
import {
  CODIGOS_ERROR_CANAL_FAIL_CLOSED,
  componenteContextoAplicaAlCanal,
  crearRegistroCanales,
  esErrorCanalFailClosed,
  estadoHttpErrorCanal,
  resolverCodigoCanal,
  type FuenteCanalesIa
} from './canalesActivos';
import { AgenteEjecucionError } from './errores';

// BA-039: estas piezas viven en el módulo puro (testeable sin BD); se re-exportan
// aquí para no cambiar los imports de rutas y del executor.
export {
  CODIGOS_ERROR_CANAL_FAIL_CLOSED,
  componenteContextoAplicaAlCanal,
  esErrorCanalFailClosed,
  estadoHttpErrorCanal
};

/**
 * Código de canal ya validado contra `canales_ia.activo`.
 * BA-039: deja de ser la unión fija 'web' | 'whatsapp'; el valor sale de la BD.
 */
export type CodigoCanalIa = string;

/**
 * Fuente real de canales: `canales_ia` con `activo = true` vía service_role.
 * Qué hace: lee solo `codigo, activo` y vuelve a filtrar `activo === true` en código.
 * Para qué: que un error de lectura lance (→ rechazo) en vez de devolver lista vacía o cruda.
 * No registra el detalle del error de Supabase (podría traer datos de conexión), solo su código.
 */
export const fuenteCanalesSupabase: FuenteCanalesIa = {
  async listarCanalesActivos() {
    const { data, error } = await getServiceRoleClient()
      .from('canales_ia')
      .select('codigo, activo')
      .eq('activo', true);
    if (error) {
      console.error('[BA-039 canales] No se pudo leer canales_ia:', error.code || 'sin_codigo');
      throw new Error('lectura_canales_ia_fallida');
    }
    return (data || [])
      .filter((fila: { activo?: unknown }) => fila.activo === true)
      .map((fila: { codigo?: unknown }) => String(fila.codigo ?? ''));
  }
};

/** Registro compartido del proceso, con caché corta (30 s) sobre la fuente de Supabase. */
const registroCanales = crearRegistroCanales(fuenteCanalesSupabase);

/**
 * Resuelve `codigo_canal` pedido por la API (POST /api/naia y simulador).
 *
 * - ausente o null → `web` (contrato histórico), siempre que `web` esté activo en BD
 * - código activo en `canales_ia` (mayúsculas y espacios se normalizan) → ese canal
 * - desconocido, inactivo, vacío o no texto → `canal_invalido` (400)
 * - error de BD o ningún canal activo → `canales_no_disponibles` (503)
 *
 * BA-039: ahora es asíncrona porque consulta la BD (con caché corta).
 */
export function resolverCodigoCanalExplicito(valor: unknown): Promise<CodigoCanalIa> {
  return resolverCodigoCanal(valor, registroCanales);
}

/**
 * Herramienta visible en el canal activo según `agente_herramientas.canales_permitidos`.
 *
 * - null → sin restricción registrada (filas legacy)
 * - array → solo si incluye el código del canal (array vacío no permite ninguno)
 */
export function herramientaPermitidaEnCanal(canalesPermitidos: unknown, codigoCanal: string): boolean {
  if (canalesPermitidos == null) return true;

  let lista: unknown = canalesPermitidos;
  if (typeof lista === 'string') {
    try {
      lista = JSON.parse(lista);
    } catch {
      return false;
    }
  }
  if (!Array.isArray(lista)) return false;

  const canal = codigoCanal.trim().toLowerCase();
  return lista.some((item) => String(item).trim().toLowerCase() === canal);
}

/**
 * Agente predeterminado del canal (`canales_ia.agente_predeterminado_id`).
 * Exige canal activo y agente activo. No inventa un agente de respaldo.
 */
export async function resolverAgenteDelCanal(codigoCanal: string): Promise<string> {
  const { data: canal, error } = await getServiceRoleClient()
    .from('canales_ia')
    .select('codigo, activo, agente_predeterminado_id, agentes_ia:agente_predeterminado_id(codigo, activo, estado)')
    .eq('codigo', codigoCanal)
    .maybeSingle();

  if (error || !canal) {
    throw new AgenteEjecucionError(`Canal no encontrado: ${codigoCanal}`, 'canal_no_encontrado');
  }
  if (canal.activo === false) {
    throw new AgenteEjecucionError(
      `El canal ${codigoCanal} no está activo.`,
      'canal_no_configurado'
    );
  }

  const agente = canal.agentes_ia as { codigo?: string; activo?: boolean; estado?: string } | null;
  if (!canal.agente_predeterminado_id || !agente?.codigo || agente.activo === false || agente.estado !== 'activo') {
    throw new AgenteEjecucionError(
      `El canal ${codigoCanal} no tiene un agente activo asignado.`,
      'agente_canal_no_asignado'
    );
  }
  return agente.codigo;
}
