/**
 * BA-034 — Probar conexión (brief E1 A6, A7; regla fija «mensaje fijo sin datos de personas»).
 *
 * Qué hace: envía al adaptador un mensaje fijo y devuelve ✓/✗, latencia, el modelo
 * que respondió y, si falla, un motivo en palabras sencillas. No registra la clave
 * ni la respuesta completa.
 * Para qué: que el endpoint del asistente (BA-036) no permita encender un proveedor
 * sin una prueba exitosa.
 */

import { clasificarErrorLLM, MOTIVO_LEGIBLE, type TipoErrorLLM } from './errores';
import type { AdaptadorLLM } from './tipos';

/** Mensaje fijo de prueba. Nunca lleva datos de estudiantes. */
export const MENSAJE_PRUEBA_CONEXION = 'Prueba de conexión de BuscoEdu. Responde solo con la palabra: OK';

export interface ResultadoPrueba {
  ok: boolean;
  latencia_ms: number;
  modelo: string | null;
  motivo: string | null;
  /** E1 M4: tipo de error (para `pruebas_conexion_ia.motivo_codigo`); null si salió bien. */
  motivo_codigo: TipoErrorLLM | null;
}

export async function probarConexion(adaptador: AdaptadorLLM, ahora: () => number = Date.now): Promise<ResultadoPrueba> {
  const inicio = ahora();
  try {
    const r = await adaptador.generar({
      sistema: 'Eres una prueba de conexión.',
      mensaje: MENSAJE_PRUEBA_CONEXION,
      parametros: { temperature: 0, max_tokens: 5, timeout_ms: 15_000 }
    });
    const ok = typeof r.texto === 'string' && r.texto.trim().length > 0;
    return {
      ok,
      latencia_ms: ahora() - inicio,
      modelo: r.modelo_usado || adaptador.modelo,
      motivo: ok ? null : MOTIVO_LEGIBLE.respuesta_invalida,
      motivo_codigo: ok ? null : 'respuesta_invalida'
    };
  } catch (err) {
    const e = clasificarErrorLLM(err);
    return { ok: false, latencia_ms: ahora() - inicio, modelo: null, motivo: MOTIVO_LEGIBLE[e.tipo], motivo_codigo: e.tipo };
  }
}

/** A7: encender exige una prueba exitosa previa. */
export function puedeEncender(ultimaPrueba: { ok: boolean } | null | undefined): { ok: true } | { ok: false; motivo: string } {
  return ultimaPrueba?.ok === true ? { ok: true } : { ok: false, motivo: 'Primero prueba la conexión' };
}
