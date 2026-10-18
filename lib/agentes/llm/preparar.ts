/**
 * E1 · BA-038 — Paso previo a la llamada IA del executor: tope + precios.
 *
 * Qué hace:
 *   1. Verifica el tope del canal (`verificarGastoAntesDeIa`). Si bloquea (corte o
 *      gasto no disponible), deja un registro `sin_ia` (tipo_error `tope_diario` o
 *      `gasto_no_disponible`, evento `error_bot`; no suma gasto) y devuelve el texto C3.
 *   2. Si deja pasar, pone el precio vigente en el principal y en cada respaldo.
 * Las simulaciones (`modo_simulacion`) pasan por el mismo control y suman al gasto
 * (decisión del Orquestador).
 * Para qué: que el executor solo tenga que llamar a esta función y que el
 * comportamiento se pruebe sin BD.
 * Módulo puro.
 */

import { registrarSinBloquear, type RegistroCostoIa } from './costo';
import { verificarGastoAntesDeIa, type ControlGasto, type EstadoGastoCanal } from './gasto';
import { MENSAJE_SIN_IA_C3, type ContextoLlamada } from './motor';
import { conPrecioVigente, type ResolutorPrecios } from './precios';
import type { DespliegueLLM } from './tipos';

export type PreparacionLlamada =
  | { ok: true; principal: DespliegueLLM; respaldos: DespliegueLLM[]; gasto: EstadoGastoCanal | null }
  | { ok: false; motivo: 'tope_diario' | 'gasto_no_disponible'; mensaje_estudiante: string; gasto: EstadoGastoCanal | null };

export async function prepararLlamadaIa(p: {
  control: ControlGasto;
  precios: ResolutorPrecios;
  registroCosto?: RegistroCostoIa | null;
  contexto: ContextoLlamada;
  principal: DespliegueLLM;
  respaldos: DespliegueLLM[];
  avisar?: (m: string) => void;
}): Promise<PreparacionLlamada> {
  // Bloque 1: tope del canal (fail-closed).
  const decision = await verificarGastoAntesDeIa(p.control, p.contexto.canal_codigo, p.avisar);
  if (!decision.permitir) {
    const bloqueo = decision as Extract<typeof decision, { permitir: false }>;
    await registrarSinBloquear(
      p.registroCosto,
      {
        agente_codigo: p.contexto.agente_codigo,
        version_agente_id: p.contexto.version_agente_id,
        canal_codigo: p.contexto.canal_codigo,
        despliegue_id: p.principal.id,
        proveedor_codigo: p.principal.proveedor_codigo || 'desconocido',
        modelo: p.principal.modelo,
        es_respaldo: false,
        intento: 0,
        resultado: 'sin_ia',
        tipo_error: bloqueo.motivo,
        evento: 'error_bot',
        tokens_entrada: null,
        tokens_salida: null,
        tokens_estimados: false,
        costo_estimado_usd: null,
        precio_version: null,
        latencia_ms: null,
        modo_simulacion: p.contexto.modo_simulacion
      },
      p.avisar
    );
    return { ok: false, motivo: bloqueo.motivo, mensaje_estudiante: MENSAJE_SIN_IA_C3, gasto: bloqueo.estado };
  }

  // Bloque 2: precio vigente en cada eslabón (si falla, queda el de la config).
  const principal = await conPrecioVigente(p.principal, p.precios);
  const respaldos = await Promise.all(p.respaldos.map((r) => conPrecioVigente(r, p.precios)));
  return { ok: true, principal, respaldos, gasto: decision.estado };
}
