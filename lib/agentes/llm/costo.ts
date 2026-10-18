/**
 * BA-034 — Registro de costo por llamada a un modelo (base para BA-038, brief E1 D1–D3).
 *
 * Qué hace: arma un registro por cada intento contra un proveedor (éxito, error,
 * formato inválido, salto por circuito o «sin IA») con tokens de entrada/salida,
 * proveedor, modelo, costo calculado con precios versionados, latencia y resultado,
 * y lo entrega a un `RegistroCostoIa`. Si guardar falla, se avisa en el log y se sigue.
 * Para qué: que BA-038 pueda sumar el gasto diario y cortar al 100 %, sin que un
 * fallo de la bitácora deje al estudiante sin respuesta.
 */

import type { PreciosModelo } from './tipos';

export type ResultadoLlamada = 'exitoso' | 'error' | 'formato_invalido' | 'saltado' | 'sin_ia';
export type EventoLlamada = 'despliegue_respaldo_usado' | 'error_bot' | null;

/** Lo que se guarda por intento. Sin clave, sin texto del estudiante ni de la respuesta. */
export interface RegistroLlamadaIa {
  agente_codigo: string;
  version_agente_id: string | null;
  canal_codigo: string;
  despliegue_id: string | null;
  proveedor_codigo: string;
  modelo: string | null;
  es_respaldo: boolean;
  intento: number;
  resultado: ResultadoLlamada;
  tipo_error: string | null;
  evento: EventoLlamada;
  tokens_entrada: number | null;
  tokens_salida: number | null;
  tokens_estimados: boolean;
  costo_estimado_usd: number | null;
  precio_version: string | null;
  latencia_ms: number | null;
  modo_simulacion: boolean;
}

/** Destino del registro (Supabase en la app, memoria en tests). */
export interface RegistroCostoIa {
  registrar(registro: RegistroLlamadaIa): Promise<void>;
}

/** Costo = tokens/1000 × precio. Sin precios o sin tokens → null (no se inventa un costo). */
export function calcularCostoUsd(
  tokensEntrada: number | null,
  tokensSalida: number | null,
  precios: PreciosModelo | null
): number | null {
  if (!precios || tokensEntrada === null || tokensSalida === null) return null;
  const costo = (tokensEntrada / 1000) * precios.entrada_usd_1k + (tokensSalida / 1000) * precios.salida_usd_1k;
  return Math.round(costo * 1e6) / 1e6;
}

/** Estimación de tokens por largo (≈ 4 caracteres por token) para proveedores que no informan uso (Abacus). */
export function estimarTokens(texto: string): number {
  return Math.ceil((texto || '').length / 4);
}

/**
 * Guarda sin bloquear: nunca lanza. Si el destino falla, deja una advertencia
 * con el proveedor y el resultado (sin clave ni contenido) y la respuesta sigue.
 */
export async function registrarSinBloquear(
  destino: RegistroCostoIa | null | undefined,
  registro: RegistroLlamadaIa,
  avisar: (m: string) => void = (m) => console.warn(m)
): Promise<void> {
  if (!destino) return;
  try {
    await destino.registrar(registro);
  } catch {
    avisar(
      `[BA-034 costo] No se pudo guardar el registro de ${registro.proveedor_codigo}/${registro.modelo ?? 'sin_modelo'} (${registro.resultado}); la respuesta sigue.`
    );
  }
}
