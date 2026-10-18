/**
 * BA-034 — Implementaciones reales (Supabase + entorno) de las interfaces de la capa IA.
 *
 * Qué hace:
 *   - `fuentesClaveSupabase`: Vault vía RPC `fn_ia_leer_clave(p_proveedor_codigo)` (BA-035,
 *     solo service_role) y `process.env` como respaldo.
 *   - `registroCostoSupabase`: inserta cada intento en `registros_costo_ia`
 *     (migración BA-034, no aplicada). Si la tabla no existe, lanza y el motor solo avisa.
 * Para qué: aislar la red/BD del motor para que los tests no las necesiten.
 * Nunca se loguea la clave ni el detalle del error de Supabase (solo su código).
 */

import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { crearLectorClaves, type FuentesClave } from './claves';
import type { RegistroCostoIa } from './costo';

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
