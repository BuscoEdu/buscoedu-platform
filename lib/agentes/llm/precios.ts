/**
 * E1 · BA-038 — Precio vigente de cada modelo para el costo de cada llamada.
 *
 * Qué hace: pide `fn_ia_precio_vigente(proveedor, modelo)` (modelo exacto y, si no hay,
 * el `'*'` del proveedor; Abacus hoy: `'*'` `estimado-2026-10`, 0,002 / 0,010 USD por
 * 1.000 tokens) con caché de 60 s, y lo pone en `despliegue.precios`. Si la consulta
 * falla o no hay precio, se usa el de `configuracion_tecnica` (BA-034) y, si tampoco
 * hay, el costo queda en null (la BD lo cuenta en `intentos_sin_costo`).
 * Para qué: que `registros_costo_ia` guarde `costo_estimado_usd` + `precio_version`
 * y el tope sume dinero real (o estimado y marcado como tal). Nunca bloquea la respuesta.
 * Módulo puro: la consulta llega inyectada.
 */

import type { DespliegueLLM, PreciosModelo } from './tipos';

export interface FuentePrecios {
  precioVigente(proveedorCodigo: string, modelo: string | null): Promise<PreciosModelo | null>;
}

export interface ResolutorPrecios {
  obtener(proveedorCodigo: string, modelo: string | null): Promise<PreciosModelo | null>;
}

export function crearResolutorPrecios(
  fuente: FuentePrecios,
  opciones: { ttlMs?: number; ahora?: () => number; avisar?: (m: string) => void } = {}
): ResolutorPrecios {
  const ttl = opciones.ttlMs ?? 60_000;
  const ahora = opciones.ahora ?? Date.now;
  const avisar = opciones.avisar ?? ((m: string) => console.warn(m));
  const cache = new Map<string, { valor: PreciosModelo | null; vence: number }>();
  return {
    async obtener(proveedorCodigo, modelo) {
      const k = `${proveedorCodigo}|${modelo ?? '*'}`;
      const c = cache.get(k);
      if (c && c.vence > ahora()) return c.valor;
      let valor: PreciosModelo | null = null;
      try {
        valor = await fuente.precioVigente(proveedorCodigo, modelo);
      } catch {
        avisar(`[BA-038 precio] No se pudo leer el precio vigente de ${proveedorCodigo}; se usa el de la configuración.`);
      }
      cache.set(k, { valor, vence: ahora() + ttl });
      return valor;
    }
  };
}

/** Pone el precio vigente (o el de la config) en cada despliegue de la cadena. */
export async function conPrecioVigente(d: DespliegueLLM, resolutor: ResolutorPrecios): Promise<DespliegueLLM> {
  const vigente = await resolutor.obtener(d.proveedor_codigo, d.modelo);
  return vigente ? { ...d, precios: vigente } : d;
}
