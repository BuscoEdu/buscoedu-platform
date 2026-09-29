/**
 * Tipos del Centro de Agentes IA.
 *
 * Define las estructuras que viajan entre la base de datos, el motor de
 * ejecución (AgenteExecutor) y los adaptadores de proveedor (AbacusAdapter).
 */

import type { SesionEstudiante } from './vozNaia';
import type { SesionHilo } from '@/src/lib/demowapp/sesion-hilo';

/** Configuración resuelta de un agente y su versión activa. */
export interface ConfiguracionAgente {
  agente: {
    id: string;
    codigo: string;
    nombre: string;
    estado: string;
  };
  version: {
    id: string;
    numero_version: string;
    estado: string;
  };
  despliegue: {
    id: string;
    identificador_externo: string;
    referencia_secreto: string;
    configuracion_tecnica: Record<string, unknown> | null;
  };
  canal: {
    id: string;
    codigo: string;
  };
  contextos: Array<{
    orden: number;
    rol_contexto: string;
    contenido: string;
  }>;
  herramientas: Array<{
    codigo: string;
    nombre: string;
    habilitada: boolean;
  }>;
}

/** Entrada de una ejecución de agente. */
export interface EntradaEjecucion {
  mensaje_usuario: string;
  conversation_id?: string;
  codigo_canal: string;
  codigo_agente: string;
  contexto_persona?: Record<string, unknown>;
  contexto_conversacion?: string;
  sesion_previa?: SesionEstudiante;
  sesion_hilo?: SesionHilo;
  contexto_ofertas?: {
    filtros_actuales?: Record<string, string>;
    total_resultados?: number;
    ofertas_relevantes?: Array<{
      id?: string;
      nombre?: string;
      descripcion?: string;
      vigente_desde?: string;
      vigente_hasta?: string;
      cupos_disponibles?: number;
      tipo_beneficio?: string;
      programa?: Record<string, unknown>;
      universidad?: Record<string, unknown>;
      sede?: Record<string, unknown>;
      beneficios?: Array<Record<string, unknown>>;
    }>;
  };
  version_agente_id?: string;
  modo_simulacion?: boolean;
}

export interface SalidaEjecucion {
  mensaje: string;
  filtros: Record<string, string | null>;
  pregunta_seguimiento: string | null;
  opciones_sugeridas?: string[];
  conversationId: string | null;
  ejecucion_id?: string;
  resumen_actualizado?: string;
  intencion_detectada?: string;
  siguiente_accion_sugerida?: string;
  requiere_escalamiento?: boolean;
  espera_respuesta?: boolean;
  sesion_hilo?: SesionHilo;
}
