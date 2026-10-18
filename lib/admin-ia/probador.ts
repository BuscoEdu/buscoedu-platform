/**
 * E1 · BA-037 M4 — Prueba de conexión real de un modelo.
 *
 * Qué hace: arma el eslabón del modelo (valida conexión fail-closed, lee la clave
 * Vault → env y crea el adaptador) y envía el mensaje fijo de prueba. Deja un
 * registro de costo con canal `panel` (visible, pero fuera de todo tope: el motor
 * no consulta `fn_ia_gasto_hoy` para `panel` ni registra alertas).
 * Para qué: que «Probar conexión» use exactamente el mismo camino que una
 * conversación real, sin datos de estudiantes y sin registrar la clave.
 * Módulo puro: lector, cliente Abacus y registro llegan inyectados.
 */

import type { ClienteAbacus } from '../agentes/llm/adaptadorAbacus';
import { crearEslabon } from '../agentes/llm/cadena';
import type { LectorClaves } from '../agentes/llm/claves';
import { registrarSinBloquear, type RegistroCostoIa } from '../agentes/llm/costo';
import { clasificarErrorLLM, MOTIVO_LEGIBLE } from '../agentes/llm/errores';
import { CANAL_PANEL } from '../agentes/llm/gasto';
import { probarConexion, type ResultadoPrueba } from '../agentes/llm/probar';
import type { DespliegueLLM } from '../agentes/llm/tipos';

export const AGENTE_PRUEBA_PANEL = 'panel_prueba_conexion';

export function crearProbador(deps: {
  lector: LectorClaves;
  clienteAbacus: ClienteAbacus;
  registroCosto?: RegistroCostoIa | null;
  ahora?: () => number;
}) {
  return async (d: DespliegueLLM): Promise<ResultadoPrueba> => {
    const ahora = deps.ahora ?? Date.now;
    const inicio = ahora();
    let r: ResultadoPrueba;
    try {
      const adaptador = await crearEslabon(d, false, { lector: deps.lector, clienteAbacus: deps.clienteAbacus }).preparar();
      r = await probarConexion(adaptador, ahora);
    } catch (err) {
      const e = clasificarErrorLLM(err);
      r = { ok: false, latencia_ms: ahora() - inicio, modelo: null, motivo: MOTIVO_LEGIBLE[e.tipo], motivo_codigo: e.tipo };
    }
    await registrarSinBloquear(deps.registroCosto, {
      agente_codigo: AGENTE_PRUEBA_PANEL,
      version_agente_id: null,
      canal_codigo: CANAL_PANEL,
      despliegue_id: d.id,
      proveedor_codigo: d.proveedor_codigo || 'desconocido',
      modelo: d.modelo,
      es_respaldo: false,
      intento: 1,
      resultado: r.ok ? 'exitoso' : 'error',
      tipo_error: r.ok ? null : r.motivo_codigo,
      evento: null,
      tokens_entrada: null,
      tokens_salida: null,
      tokens_estimados: false,
      costo_estimado_usd: null,
      precio_version: null,
      latencia_ms: r.latencia_ms,
      modo_simulacion: false
    });
    return r;
  };
}
