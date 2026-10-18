/**
 * BA-034 — Lectura de claves de proveedor (brief E1 A3; decisión 19 Vault; spec §8.4).
 *
 * Qué hace: obtiene la clave de un proveedor en este orden:
 *   1. Vault, vía RPC `fn_ia_leer_clave(p_proveedor_codigo text) → text` (BA-035, solo service_role).
 *   2. Respaldo: variable de entorno cuyo NOMBRE guarda `despliegues_ia.referencia_secreto`
 *      (solo nombres permitidos: `LLM_*`, `ABACUS_NAIA_*`).
 *   3. Si no hay ninguna → ErrorLLM('sin_clave') y el despliegue no se usa (fail-closed).
 * Para qué: rotar claves sin redeploy (Vault) sin romper lo que hoy vive en Vercel (env).
 *
 * Reglas: la clave nunca se loguea ni se devuelve en errores. Caché en memoria de
 * 60 s para no hacer una RPC por mensaje. Si la RPC falla (p. ej. BA-035 sin aplicar)
 * se recuerda «sin Vault» esos mismos 60 s y se usa el env: es el comportamiento de
 * hoy, así que no relaja nada, y evita una RPC fallida y un aviso por cada mensaje.
 * Módulo puro: Vault y env llegan por la interfaz `FuentesClave` (tests sin red).
 */

import { ErrorLLM } from './errores';
import { nombreEnvPermitido } from './proveedores';

export interface FuentesClave {
  /** Llama a `fn_ia_leer_clave`. Devuelve null si el proveedor no usa Vault o está revocada. Lanza si la RPC falla. */
  leerVault(proveedorCodigo: string): Promise<string | null>;
  /** Lee una variable de entorno por nombre. */
  leerEnv(nombre: string): string | undefined;
}

export interface ClaveObtenida {
  clave: string;
  origen: 'vault' | 'env';
}

export interface LectorClaves {
  obtener(p: { proveedorCodigo: string; referenciaEnv: string | null }): Promise<ClaveObtenida>;
  /** Solo Vault (para Abacus: si no hay, el adaptador sigue leyendo su env como siempre). */
  obtenerDeVault(proveedorCodigo: string): Promise<string | null>;
  invalidar(): void;
}

export const TTL_CLAVES_MS = 60_000;

/** Largo mínimo aceptado (igual que fn_ia_guardar_clave): evita claves vacías o basura. */
function claveValida(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length >= 8;
}

export function crearLectorClaves(
  fuentes: FuentesClave,
  opciones: { ttlMs?: number; ahora?: () => number; avisar?: (m: string) => void } = {}
): LectorClaves {
  const ttl = opciones.ttlMs ?? TTL_CLAVES_MS;
  const ahora = opciones.ahora ?? Date.now;
  const avisar = opciones.avisar ?? ((m: string) => console.warn(m));
  const cache = new Map<string, { valor: string | null; vence: number }>();

  // Bloque Vault: RPC con caché corta. Si la RPC falla (p. ej. BA-035 sin aplicar),
  // se avisa SIN detalle (como mucho una vez por TTL y proveedor) y se sigue con el env.
  async function deVault(codigo: string): Promise<string | null> {
    const enCache = cache.get(codigo);
    if (enCache && enCache.vence > ahora()) return enCache.valor;
    try {
      const valor = await fuentes.leerVault(codigo);
      const limpio = claveValida(valor) ? valor.trim() : null;
      cache.set(codigo, { valor: limpio, vence: ahora() + ttl });
      return limpio;
    } catch {
      cache.set(codigo, { valor: null, vence: ahora() + ttl });
      avisar(`[BA-034 claves] Vault no disponible para ${codigo}; se intenta la variable de entorno.`);
      return null;
    }
  }

  return {
    async obtener({ proveedorCodigo, referenciaEnv }) {
      const vault = await deVault(proveedorCodigo);
      if (vault) return { clave: vault, origen: 'vault' };
      // Bloque env: solo nombres de la lista permitida (no se puede apuntar a SUPABASE_SERVICE_ROLE_KEY).
      if (referenciaEnv && nombreEnvPermitido(referenciaEnv)) {
        const env = fuentes.leerEnv(referenciaEnv);
        if (claveValida(env)) return { clave: env.trim(), origen: 'env' };
      }
      throw new ErrorLLM('sin_clave', 'sin_clave');
    },
    obtenerDeVault: deVault,
    invalidar() {
      cache.clear();
    }
  };
}
