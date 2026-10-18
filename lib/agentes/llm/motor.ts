/**
 * BA-034 — Motor con respaldo (brief E1 C2–C5, B2, B5).
 *
 * Qué hace: recorre la cadena «principal → respaldos en orden» y devuelve la primera
 * respuesta válida:
 *   - salta despliegues con circuito abierto (C4) o mal configurados (fail-closed:
 *     proveedor desconocido/apagado, URL no permitida, sin clave);
 *   - ante error del proveedor pasa al siguiente (C2);
 *   - en respaldos valida el formato y reintenta 1 vez; si sigue mal, pasa al siguiente
 *     o aplica C3 (C5). Nunca devuelve una respuesta a medias;
 *   - si nadie responde, devuelve el resultado «sin IA» con el mensaje fijo de C3 y el
 *     evento `error_bot` (C3);
 *   - registra el costo de cada intento sin bloquear (BA-038).
 * Para qué: que el estudiante siempre reciba una respuesta honesta, y que con un solo
 * principal Abacus (hoy) el comportamiento sea el de siempre: una llamada, misma entrada.
 * Módulo puro: adaptadores, circuito y registro llegan inyectados.
 */

import { circuitoCompartido } from './circuitoCompartido';
import type { CircuitoDespliegues } from './circuito';
import { calcularCostoUsd, registrarSinBloquear, type RegistroCostoIa, type RegistroLlamadaIa } from './costo';
import { clasificarErrorLLM, ErrorLLM, type TipoErrorLLM } from './errores';
import type { AdaptadorLLM, DespliegueLLM, PeticionLLM, RespuestaLLM } from './tipos';

/** Mensaje fijo de C3 (texto exacto del brief). */
export const MENSAJE_SIN_IA_C3 =
  'En este momento no puedo responder. Te paso con una persona del equipo o puedes seguir en www.buscoedu.com.';

/** Un eslabón de la cadena. `preparar` arma el adaptador (valida y lee la clave); si lanza, se salta. */
export interface EslabonLLM {
  despliegue: DespliegueLLM;
  es_respaldo: boolean;
  /** C5: validar el formato de salida (y reintentar 1 vez). Hoy solo en respaldos. */
  validar_formato: boolean;
  preparar(): Promise<AdaptadorLLM>;
}

export interface IntentoLLM {
  despliegue_id: string;
  proveedor: string;
  resultado: RegistroLlamadaIa['resultado'];
  tipo_error: TipoErrorLLM | null;
}

export type ResultadoMotor =
  | {
      ok: true;
      respuesta: RespuestaLLM;
      despliegue: DespliegueLLM;
      uso_respaldo: boolean;
      evento: 'despliegue_respaldo_usado' | null;
      intentos: IntentoLLM[];
    }
  | {
      ok: false;
      mensaje_estudiante: string;
      evento: 'error_bot';
      intentos: IntentoLLM[];
      /** Tipo del último error (para la bitácora de ejecuciones). */
      ultimo_error: TipoErrorLLM | null;
    };

export interface ContextoLlamada {
  agente_codigo: string;
  version_agente_id: string | null;
  canal_codigo: string;
  modo_simulacion: boolean;
}

export interface DependenciasMotor {
  circuito?: CircuitoDespliegues;
  registroCosto?: RegistroCostoIa | null;
  ahora?: () => number;
  avisar?: (m: string) => void;
}

export async function ejecutarConRespaldo(p: {
  cadena: EslabonLLM[];
  peticion: PeticionLLM;
  validarFormato: (texto: string) => boolean;
  contexto: ContextoLlamada;
  deps?: DependenciasMotor;
}): Promise<ResultadoMotor> {
  const circuito = p.deps?.circuito ?? circuitoCompartido;
  const ahora = p.deps?.ahora ?? Date.now;
  const avisar = p.deps?.avisar;
  const intentos: IntentoLLM[] = [];
  let ultimoError: TipoErrorLLM | null = null;

  // Bloque de registro: un registro por intento, nunca bloquea la respuesta.
  const registrar = (
    d: DespliegueLLM,
    esRespaldo: boolean,
    intento: number,
    resultado: RegistroLlamadaIa['resultado'],
    extra: Partial<RegistroLlamadaIa> = {}
  ) =>
    registrarSinBloquear(
      p.deps?.registroCosto,
      {
        agente_codigo: p.contexto.agente_codigo,
        version_agente_id: p.contexto.version_agente_id,
        canal_codigo: p.contexto.canal_codigo,
        despliegue_id: d.id,
        proveedor_codigo: d.proveedor_codigo || 'desconocido',
        modelo: d.modelo,
        es_respaldo: esRespaldo,
        intento,
        resultado,
        tipo_error: null,
        evento: null,
        tokens_entrada: null,
        tokens_salida: null,
        tokens_estimados: false,
        costo_estimado_usd: null,
        precio_version: d.precios?.version ?? null,
        latencia_ms: null,
        modo_simulacion: p.contexto.modo_simulacion,
        ...extra
      },
      avisar
    );

  for (const eslabon of p.cadena) {
    const d = eslabon.despliegue;
    const anotar = (resultado: IntentoLLM['resultado'], tipo: TipoErrorLLM | null) =>
      intentos.push({ despliegue_id: d.id, proveedor: d.proveedor_codigo, resultado, tipo_error: tipo });

    // C4: circuito abierto → se salta sin llamar.
    if (circuito.estaAbierto(d.id)) {
      anotar('saltado', null);
      await registrar(d, eslabon.es_respaldo, 0, 'saltado', { tipo_error: 'circuito_abierto' });
      continue;
    }

    // Fail-closed de configuración: si no se puede preparar, ese despliegue no se usa.
    let adaptador: AdaptadorLLM;
    try {
      adaptador = await eslabon.preparar();
    } catch (err) {
      const e = err instanceof ErrorLLM ? err : clasificarErrorLLM(err);
      ultimoError = e.tipo;
      anotar('saltado', e.tipo);
      await registrar(d, eslabon.es_respaldo, 0, 'saltado', { tipo_error: e.tipo });
      continue;
    }

    // C5: un respaldo con formato inválido tiene 1 reintento.
    const maxIntentos = eslabon.validar_formato ? 2 : 1;
    for (let intento = 1; intento <= maxIntentos; intento += 1) {
      const inicio = ahora();
      let r: RespuestaLLM;
      try {
        r = await adaptador.generar(p.peticion);
      } catch (err) {
        const e = clasificarErrorLLM(err);
        ultimoError = e.tipo;
        circuito.registrarError(d.id);
        anotar('error', e.tipo);
        await registrar(d, eslabon.es_respaldo, intento, 'error', { tipo_error: e.tipo, latencia_ms: ahora() - inicio });
        break; // C2: al siguiente de la cadena.
      }
      const latencia = ahora() - inicio;
      const uso = {
        tokens_entrada: r.tokens_entrada,
        tokens_salida: r.tokens_salida,
        tokens_estimados: r.tokens_estimados,
        costo_estimado_usd: calcularCostoUsd(r.tokens_entrada, r.tokens_salida, d.precios),
        modelo: r.modelo_usado || d.modelo,
        latencia_ms: latencia
      };

      if (eslabon.validar_formato && !p.validarFormato(r.texto)) {
        ultimoError = 'respuesta_invalida';
        anotar('formato_invalido', 'respuesta_invalida');
        await registrar(d, eslabon.es_respaldo, intento, 'formato_invalido', { ...uso, tipo_error: 'respuesta_invalida' });
        if (intento < maxIntentos) continue; // reintento único
        circuito.registrarError(d.id);
        break;
      }

      circuito.registrarExito(d.id);
      const evento = eslabon.es_respaldo ? ('despliegue_respaldo_usado' as const) : null;
      anotar('exitoso', null);
      await registrar(d, eslabon.es_respaldo, intento, 'exitoso', { ...uso, evento });
      return { ok: true, respuesta: r, despliegue: d, uso_respaldo: eslabon.es_respaldo, evento, intentos };
    }
  }

  // C3: nadie respondió (o no hay respaldo). Mensaje fijo + error_bot.
  const ultimo = p.cadena[p.cadena.length - 1]?.despliegue;
  if (ultimo) {
    await registrar(ultimo, p.cadena.length > 1, 0, 'sin_ia', { tipo_error: ultimoError, evento: 'error_bot' });
  }
  return { ok: false, mensaje_estudiante: MENSAJE_SIN_IA_C3, evento: 'error_bot', intentos, ultimo_error: ultimoError };
}

/**
 * Validación de formato de NaIA (C5): JSON con `mensaje` de texto no vacío.
 * Acepta un bloque ```json``` o JSON con texto alrededor, como el parser del executor.
 */
export function esRespuestaNaiaValida(texto: string): boolean {
  if (!texto || !texto.trim()) return false;
  const candidatos: string[] = [];
  const bloque = texto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (bloque?.[1]) candidatos.push(bloque[1].trim());
  candidatos.push(texto.trim());
  const i = texto.indexOf('{');
  const f = texto.lastIndexOf('}');
  if (i !== -1 && f > i) candidatos.push(texto.slice(i, f + 1));
  for (const c of candidatos) {
    try {
      const v = JSON.parse(c);
      if (v && typeof v === 'object' && typeof v.mensaje === 'string' && v.mensaje.trim()) return true;
    } catch {
      // siguiente candidato
    }
  }
  return false;
}
