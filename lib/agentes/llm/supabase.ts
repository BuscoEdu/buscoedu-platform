/**
 * BA-034 — Implementaciones reales (Supabase + entorno) de las interfaces de la capa IA.
 *
 * Qué hace:
 *   - `fuentesClaveSupabase`: Vault vía RPC `fn_ia_leer_clave(p_proveedor_codigo)` (BA-035,
 *     solo service_role) y `process.env` como respaldo.
 *   - `registroCostoSupabase`: inserta cada intento en `registros_costo_ia`
 *     (migración BA-034, no aplicada). Si la tabla no existe, lanza y el motor solo avisa.
 *   - `controlGastoSupabase` / `resolutorPreciosSupabase` (E1 · BA-038): tope diario por
 *     canal y precio vigente por modelo.
 * Para qué: aislar la red/BD del motor para que los tests no las necesiten.
 * Nunca se loguea la clave ni el detalle del error de Supabase (solo su código).
 */

import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { crearLectorClaves, type FuentesClave } from './claves';
import type { RegistroCostoIa } from './costo';
import type { ControlGasto, EstadoGastoCanal } from './gasto';
import { crearResolutorPrecios, type FuentePrecios } from './precios';

export const fuentesClaveSupabase: FuentesClave = {
  async leerVault(proveedorCodigo) {
    const { data, error } = await getServiceRoleClient().rpc('fn_ia_leer_clave', {
      p_proveedor_codigo: proveedorCodigo
    });
    if (error) throw new Error(`vault_rpc_${error.code || 'error'}`);
    return typeof data === 'string' ? data : null;
  },
  leerEnv(nombre) {
    return process.env[nombre];
  }
};

/** Lector compartido del proceso (caché de 60 s). */
export const lectorClavesSupabase = crearLectorClaves(fuentesClaveSupabase);

export const registroCostoSupabase: RegistroCostoIa = {
  async registrar(registro) {
    const { error } = await getServiceRoleClient().from('registros_costo_ia').insert(registro);
    if (error) throw new Error(`registro_costo_${error.code || 'error'}`);
  }
};

/**
 * E1 · BA-038 — Tope diario por canal (`fn_ia_gasto_hoy`, `fn_ia_registrar_alerta_gasto`).
 * Si la RPC falla se lanza (solo el código) y el motor bloquea la IA (fail-closed).
 */
export const controlGastoSupabase: ControlGasto = {
  async consultar(canalCodigo) {
    const { data, error } = await getServiceRoleClient().rpc('fn_ia_gasto_hoy', { p_canal_codigo: canalCodigo });
    if (error) throw new Error(`gasto_rpc_${error.code || 'error'}`);
    return (data || { ok: false, error: 'sin_respuesta' }) as EstadoGastoCanal;
  },
  async registrarAlerta(canalCodigo) {
    const { data, error } = await getServiceRoleClient().rpc('fn_ia_registrar_alerta_gasto', { p_canal_codigo: canalCodigo });
    if (error || (data as { ok?: boolean } | null)?.ok === false) throw new Error(`alerta_rpc_${error?.code || 'error'}`);
  }
};

/** E1 · BA-038 — Precio vigente (`fn_ia_precio_vigente`) con caché compartida de 60 s. */
export const fuentePreciosSupabase: FuentePrecios = {
  async precioVigente(proveedorCodigo, modelo) {
    const { data, error } = await getServiceRoleClient().rpc('fn_ia_precio_vigente', {
      p_proveedor_codigo: proveedorCodigo,
      p_modelo: modelo
    });
    if (error) throw new Error(`precio_rpc_${error.code || 'error'}`);
    const p = data as { entrada_usd_1k?: unknown; salida_usd_1k?: unknown; version?: unknown; es_estimado?: unknown } | null;
    if (!p || typeof p.entrada_usd_1k !== 'number' || typeof p.salida_usd_1k !== 'number') return null;
    return { entrada_usd_1k: p.entrada_usd_1k, salida_usd_1k: p.salida_usd_1k, version: String(p.version ?? 'sin_version'), es_estimado: p.es_estimado === true };
  }
};

export const resolutorPreciosSupabase = crearResolutorPrecios(fuentePreciosSupabase);
