/**
 * BA-034 — Adaptador sobre el AI SDK de Vercel (`ai`; decisión 12).
 *
 * Qué hace: crea el modelo del proveedor (OpenAI, xAI, Anthropic, Gemini u
 * OpenAI-compatible como OpenRouter) con la clave y la URL ya validadas, y llama
 * `generateText` con el prompt de sistema completo, temperatura, tope de tokens y
 * timeout. Traduce errores a `ErrorLLM` y devuelve tokens reales de uso.
 * Para qué: sumar proveedores sin escribir un cliente por cada uno.
 * La fábrica del modelo es inyectable: los tests usan `MockLanguageModelV4` (sin red).
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createXai } from '@ai-sdk/xai';
import { generateText, type LanguageModel } from 'ai';
import { clasificarErrorLLM } from './errores';
import type { AdaptadorLLM, DespliegueLLM, PeticionLLM, RespuestaLLM, TipoAdaptador } from './tipos';

/** Timeout por defecto (mismo orden que Abacus: 25 s). */
export const TIMEOUT_MS_POR_DEFECTO = 25_000;

export type FabricaModelo = (p: { tipo: TipoAdaptador; url: string; clave: string; modelo: string; proveedor: string }) => LanguageModel;

/** Fábrica real: un proveedor del AI SDK por tipo de adaptador. Abacus no pasa por aquí. */
export const fabricaModeloAiSdk: FabricaModelo = ({ tipo, url, clave, modelo, proveedor }) => {
  switch (tipo) {
    case 'openai':
      return createOpenAI({ apiKey: clave, baseURL: url })(modelo);
    case 'xai':
      return createXai({ apiKey: clave, baseURL: url })(modelo);
    case 'anthropic':
      return createAnthropic({ apiKey: clave, baseURL: url })(modelo);
    case 'google':
      return createGoogleGenerativeAI({ apiKey: clave, baseURL: url })(modelo);
    case 'openai_compatible':
      return createOpenAICompatible({ name: proveedor || 'compatible', apiKey: clave, baseURL: url }).chatModel(modelo);
    default:
      throw new Error(`tipo_no_soportado_en_ai_sdk:${tipo}`);
  }
};

/** Lee un número de la config técnica dentro de un rango; si no, el defecto. */
function numeroEnRango(valor: unknown, min: number, max: number): number | undefined {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= min && valor <= max ? valor : undefined;
}

export function crearAdaptadorAiSdk(p: {
  despliegue: DespliegueLLM;
  tipo: TipoAdaptador;
  url: string;
  clave: string;
  fabrica?: FabricaModelo;
}): AdaptadorLLM {
  const modelo = p.despliegue.modelo || '';
  const proveedor = p.despliegue.proveedor_codigo;
  const config = p.despliegue.configuracion_tecnica || {};
  const lm = (p.fabrica ?? fabricaModeloAiSdk)({ tipo: p.tipo, url: p.url, clave: p.clave, modelo, proveedor });

  return {
    proveedor,
    modelo,
    async generar(peticion: PeticionLLM): Promise<RespuestaLLM> {
      // Bloque de parámetros: la petición manda; si no, la config técnica del despliegue.
      const timeout =
        peticion.parametros.timeout_ms ?? numeroEnRango(config.timeout_ms, 1000, 120_000) ?? TIMEOUT_MS_POR_DEFECTO;
      const maxTokens = peticion.parametros.max_tokens ?? numeroEnRango(config.max_tokens, 1, 32_000);
      const sistema = peticion.sistema_completo || peticion.sistema;
      try {
        const r = await generateText({
          model: lm,
          ...(sistema.trim() ? { system: sistema } : {}),
          prompt: peticion.mensaje,
          temperature: peticion.parametros.temperature,
          ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
          // Los reintentos los decide el motor (respaldo / C5), no el SDK.
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(timeout)
        });
        return {
          texto: r.text,
          tokens_entrada: typeof r.usage?.inputTokens === 'number' ? r.usage.inputTokens : null,
          tokens_salida: typeof r.usage?.outputTokens === 'number' ? r.usage.outputTokens : null,
          tokens_estimados: false,
          modelo_usado: r.response?.modelId || modelo,
          proveedor
        };
      } catch (err) {
        // Nunca se re-lanza el error crudo: podría traer cabeceras o cuerpo de la petición.
        throw clasificarErrorLLM(err);
      }
    }
  };
}
