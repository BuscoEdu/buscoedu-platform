/**
 * BA-029 — resolución explícita de canal (web | whatsapp).
 *
 * Misma NaIA, distinta fila de `configuraciones_agente_canal` y distinto
 * componente `tipo_contexto=canal`. No hay segundo bot ni tablas nuevas.
 *
 * Fail-closed: un código distinto de web/whatsapp, un canal inactivo o una
 * versión sin config activa no cae en silencio al canal web.
 */

import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { AgenteEjecucionError } from './errores';

export const CANALES_IA_SOPORTADOS = ['web', 'whatsapp'] as const;

export type CodigoCanalIa = (typeof CANALES_IA_SOPORTADOS)[number];

/** Errores que la API debe devolver tal cual, sin fallback conversacional ni canal web. */
export const CODIGOS_ERROR_CANAL_FAIL_CLOSED = [
  'canal_invalido',
  'canal_no_encontrado',
  'canal_no_configurado',
  'agente_canal_no_asignado'
] as const;

const CANALES_VALIDOS = new Set<string>(CANALES_IA_SOPORTADOS);

export function esErrorCanalFailClosed(error: unknown): error is AgenteEjecucionError {
  return (
    error instanceof AgenteEjecucionError &&
    (CODIGOS_ERROR_CANAL_FAIL_CLOSED as readonly string[]).includes(error.codigo)
  );
}

/** 400 si el cliente pidió un código ilegible; 422 si el canal existe en el contrato pero no está usable. */
export function estadoHttpErrorCanal(codigo: string): number {
  return codigo === 'canal_invalido' ? 400 : 422;
}

/**
 * Resuelve `codigo_canal` pedido por la API.
 *
 * - ausente o null → `web` (contrato histórico de POST /api/naia y el chat web)
 * - `web` | `whatsapp` (mayúsculas y espacios se normalizan) → ese canal
 * - cualquier otro valor, incluido string vacío → `canal_invalido`
 */
export function resolverCodigoCanalExplicito(valor: unknown): CodigoCanalIa {
  if (valor === undefined || valor === null) return 'web';
  if (typeof valor !== 'string') {
    throw new AgenteEjecucionError('codigo_canal debe ser web o whatsapp.', 'canal_invalido');
  }
  const codigo = valor.trim().toLowerCase();
  if (!CANALES_VALIDOS.has(codigo)) {
    const mostrado = codigo.slice(0, 40) || '(vacío)';
    throw new AgenteEjecucionError(
      `codigo_canal no soportado: ${mostrado}. Use web o whatsapp.`,
      'canal_invalido'
    );
  }
  return codigo as CodigoCanalIa;
}

/**
 * Un componente `tipo_contexto=canal` entra al prompt solo si su código
 * identifica el canal activo.
 *
 * Convención de Centro IA: el último segmento de `codigo` (separado por `_`)
 * es el `canales_ia.codigo`. Ejemplos: `contexto_canal_web`, `contexto_canal_whatsapp`.
 * El resto de tipos (identidad, reglas, formato…) no se filtra.
 * Un bloque de canal mal nombrado se excluye en todos los canales: no se mezcla.
 */
export function componenteContextoAplicaAlCanal(
  componente: { tipo_contexto?: string | null; codigo?: string | null },
  codigoCanal: string
): boolean {
  const tipo = (componente.tipo_contexto || '').trim().toLowerCase();
  if (tipo !== 'canal') return true;

  const codigo = (componente.codigo || '').trim().toLowerCase();
  const canal = codigoCanal.trim().toLowerCase();
  if (!codigo || !canal) return false;

  const ultimoSegmento = codigo.split('_').filter(Boolean).pop();
  return ultimoSegmento === canal;
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
