/**
 * BA-034 — Tipos de la capa IA multi-proveedor (brief E1, spec §8.1).
 *
 * Qué define: la petición y la respuesta comunes a todos los proveedores, el
 * contrato de un adaptador y la descripción de un despliegue (proveedor + modelo).
 * Para qué: que el motor de NaIA hable con Abacus, OpenAI, xAI, Anthropic,
 * Gemini u OpenRouter con la misma forma, y cambiar de modelo sin tocar código.
 * Módulo puro: sin Supabase ni alias `@/`, para testear sin red.
 */

/** Familias de adaptador soportadas. La URL de cada una sale de la lista permitida en código. */
export type TipoAdaptador = 'abacus' | 'openai' | 'openai_compatible' | 'anthropic' | 'google' | 'xai';

/** Petición común. `sistema` es el prompt tal como lo arma el executor (Abacus: vacío en turno 2+). */
export interface PeticionLLM {
  sistema: string;
  /**
   * Prompt de sistema completo para proveedores SIN hilo propio (AI SDK).
   * Abacus guarda el hilo y en turno 2+ no recibe el prompt largo; un respaldo
   * sin hilo sí lo necesita para no perder identidad y reglas.
   */
  sistema_completo?: string;
  mensaje: string;
  parametros: { temperature?: number; max_tokens?: number; timeout_ms?: number };
  /** Hilo de Abacus (`deploymentConversationId`). Los demás proveedores lo ignoran. */
  conversacion_externa_id?: string;
}

/** Respuesta común de un proveedor. */
export interface RespuestaLLM {
  texto: string;
  tokens_entrada: number | null;
  tokens_salida: number | null;
  /** true si los tokens se estimaron por largo de texto (Abacus no informa uso). */
  tokens_estimados: boolean;
  modelo_usado: string;
  proveedor: string;
  /** Hilo devuelto por el proveedor (solo Abacus). */
  conversacion_externa_id?: string;
}

/** Contrato de un adaptador de proveedor. */
export interface AdaptadorLLM {
  readonly proveedor: string;
  readonly modelo: string;
  generar(peticion: PeticionLLM): Promise<RespuestaLLM>;
}

/** Precios por 1.000 tokens (USD), versionados. Salen de `despliegues_ia.configuracion_tecnica`. */
export interface PreciosModelo {
  entrada_usd_1k: number;
  salida_usd_1k: number;
  version: string;
}

/**
 * Un despliegue listo para usar: proveedor + modelo + referencias de clave.
 * Se arma desde `despliegues_ia` + `proveedores_ia`. Nunca trae el valor de la clave.
 */
export interface DespliegueLLM {
  id: string;
  proveedor_codigo: string;
  proveedor_activo: boolean;
  despliegue_activo: boolean;
  tipo_adaptador: TipoAdaptador | null;
  modelo: string | null;
  url_base: string | null;
  /** Nombre de la variable de entorno de la clave (respaldo si Vault no la tiene). */
  referencia_secreto: string | null;
  /** Solo Abacus: nombre de la variable del deployment id. */
  identificador_externo: string | null;
  configuracion_tecnica: Record<string, unknown> | null;
  precios: PreciosModelo | null;
}
