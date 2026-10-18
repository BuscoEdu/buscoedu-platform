/**
 * BA-034 — Adaptador Abacus (proveedor por defecto de NaIA; decisión 13).
 *
 * Qué hace: envuelve el `AbacusAdapter` existente SIN cambiar su contrato ni la
 * entrada que recibe: `sistema` → `prompt_sistema`, `mensaje` → `mensaje_usuario`,
 * `conversacion_externa_id` → `conversation_id`, misma temperatura y mismas
 * referencias de entorno. Si hay clave en Vault, se pasa como `token_despliegue`;
 * si no, AbacusAdapter lee su variable de entorno como siempre.
 * Para qué: que NaIA siga en Abacus byte a byte igual (B5 / regresión E2) mientras
 * los demás proveedores entran por el AI SDK.
 * Abacus no tiene proveedor oficial en el AI SDK ni API compatible con OpenAI para
 * este endpoint conversacional (`getConversationResponse` con hilo propio), por eso
 * queda como adaptador propio (spec §8.2).
 */

import type { ResultadoAdaptador } from '../AbacusAdapter';
import { estimarTokens } from './costo';
import type { AdaptadorLLM, DespliegueLLM, PeticionLLM, RespuestaLLM } from './tipos';

/** Lo mínimo que se usa de AbacusAdapter (inyectable en tests). */
export interface ClienteAbacus {
  ejecutar(params: {
    prompt_sistema: string;
    mensaje_usuario: string;
    conversation_id?: string;
    identificador_externo: string;
    referencia_secreto: string;
    temperature?: number;
    token_despliegue?: string;
  }): Promise<ResultadoAdaptador>;
}

export function crearAdaptadorAbacus(
  despliegue: DespliegueLLM,
  cliente: ClienteAbacus,
  tokenVault: string | null
): AdaptadorLLM {
  const modelo = despliegue.modelo || 'abacus_chatllm';
  return {
    proveedor: despliegue.proveedor_codigo || 'abacus_ai',
    modelo,
    async generar(peticion: PeticionLLM): Promise<RespuestaLLM> {
      // Mismos campos que el executor enviaba antes de BA-034 (sin agregar ni quitar nada).
      const params: Parameters<ClienteAbacus['ejecutar']>[0] = {
        prompt_sistema: peticion.sistema,
        mensaje_usuario: peticion.mensaje,
        conversation_id: peticion.conversacion_externa_id,
        identificador_externo: despliegue.identificador_externo || '',
        referencia_secreto: despliegue.referencia_secreto || '',
        temperature: peticion.parametros.temperature
      };
      if (tokenVault) params.token_despliegue = tokenVault;
      const r = await cliente.ejecutar(params);
      // Abacus no informa uso: se estima por largo (marcado como estimado).
      const enviado = (peticion.sistema || '').trim().length >= 10
        ? `${peticion.sistema.trim()}\n\nMensaje del estudiante: ${peticion.mensaje}`
        : peticion.mensaje;
      return {
        texto: r.respuesta_texto,
        tokens_entrada: estimarTokens(enviado),
        tokens_salida: estimarTokens(r.respuesta_texto),
        tokens_estimados: true,
        modelo_usado: modelo,
        proveedor: despliegue.proveedor_codigo || 'abacus_ai',
        conversacion_externa_id: r.conversation_id_nuevo
      };
    }
  };
}
