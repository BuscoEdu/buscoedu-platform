/**
 * E1 · BA-036/037/038 — Contrato de acceso a datos de la API admin de IA.
 *
 * Qué define: las lecturas/escrituras que necesitan los endpoints, sin decir cómo se
 * hacen. La implementación real (Supabase, service_role) está en `datosSupabase.ts`;
 * los tests usan una en memoria.
 * Para qué: separar reglas de negocio (servicios) de la BD. BD ya entregó N1–N8
 * (migración 20261018150000); si esa migración (o la 130000/140000) todavía no está
 * aplicada en el entorno, la implementación lanza `ErrorDependenciaBd` en un único
 * lugar → 503 `dependencia_bd_pendiente` (fail-closed), en vez de un 500 opaco.
 * Módulo puro: solo tipos.
 */

import type { PruebaConexion } from './estados';
import type { VersionPublicada } from './impacto';

export interface FilaProveedor {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  tipo_proveedor?: string | null;
  capacidades: Record<string, unknown> | null;
  estado: string;
  activo: boolean;
  origen_secreto?: string | null;
  referencia_secreto?: string | null;
  clave_actualizada_en?: string | null;
  clave_revocada_en?: string | null;
  /** N2: último cambio de conexión (URL). */
  config_actualizada_en?: string | null;
  /** N6: preset del asistente, tipo de adaptador y URL base del proveedor. */
  preset_codigo?: string | null;
  tipo_adaptador?: string | null;
  url_base?: string | null;
  /** N6: avance del asistente (A8). */
  asistente_paso?: number | null;
  asistente_borrador?: Record<string, unknown> | null;
  creado_en?: string;
  actualizado_en?: string;
}

export interface FilaModelo {
  id: string;
  proveedor_id: string;
  nombre: string;
  modelo: string | null;
  identificador_externo: string | null;
  referencia_secreto: string | null;
  configuracion_tecnica: Record<string, unknown> | null;
  estado: string;
  activo: boolean;
  /** N2: último cambio de modelo/parámetros de conexión. */
  config_actualizada_en?: string | null;
  actualizado_en?: string;
  creado_en?: string;
  proveedores_ia?: { codigo: string; nombre?: string; estado: string; activo: boolean } | null;
}

export interface EstadoClave {
  configurada: boolean;
  origen: string | null;
  actualizada_en: string | null;
  revocada_en: string | null;
}

export interface EventoBitacora {
  entidad: 'proveedor' | 'despliegue' | 'version';
  entidad_id: string;
  accion: 'crear' | 'editar' | 'encender' | 'apagar' | 'archivar' | 'asignar_modelo' | 'restaurar';
  valor_anterior?: Record<string, unknown> | null;
  valor_nuevo?: Record<string, unknown> | null;
  impacto?: Record<string, unknown> | null;
  nota?: string | null;
  actor_usuario_id: string;
}

export interface FilaVersion {
  id: string;
  agente_id: string;
  numero_version: string;
  estado: string;
  configuracion_snapshot: Record<string, unknown> | null;
  publicada_en: string | null;
  notas_cambio?: string | null;
}

/** Respuesta de `fn_ia_gasto_hoy` (BA-038 v2). */
export interface GastoHoy {
  ok: boolean;
  error?: string;
  canal?: string;
  dia_bogota?: string;
  gasto_usd?: number;
  tope_diario_usd?: number;
  umbral_alerta_pct?: number;
  pct_usado?: number;
  estado?: 'normal' | 'alerta' | 'cortado';
  motivos_alerta?: string[];
  precio_estimado?: boolean;
  intentos_sin_costo?: number;
}

export interface FilaCostoIa {
  proveedor_codigo: string;
  modelo: string | null;
  resultado: string;
  evento: string | null;
  tokens_entrada: number | null;
  tokens_salida: number | null;
  costo_estimado_usd: number | null;
  precio_version: string | null;
  modo_simulacion: boolean;
}

export interface PrecioVigente {
  entrada_usd_1k: number;
  salida_usd_1k: number;
  version: string;
  es_estimado?: boolean;
  modelo?: string;
}

export interface DatosAdminIa {
  // Proveedores
  listarProveedores(incluirArchivados: boolean): Promise<FilaProveedor[]>;
  obtenerProveedor(id: string): Promise<FilaProveedor | null>;
  proveedorPorCodigo(codigo: string): Promise<FilaProveedor | null>;
  insertarProveedor(fila: Record<string, unknown>): Promise<FilaProveedor>;
  actualizarProveedor(id: string, patch: Record<string, unknown>): Promise<FilaProveedor>;
  // Claves (BA-035)
  estadoClave(codigo: string): Promise<EstadoClave>;
  guardarClave(codigo: string, clave: string, actorId: string): Promise<Record<string, unknown>>;
  revocarClave(codigo: string, actorId: string): Promise<Record<string, unknown>>;
  bitacoraClaves(proveedorId: string): Promise<Array<{ accion: string; actor_usuario_id: string | null; creado_en: string }>>;
  // Modelos
  listarModelos(filtro: { proveedorId?: string }): Promise<FilaModelo[]>;
  obtenerModelo(id: string): Promise<FilaModelo | null>;
  insertarModelo(fila: Record<string, unknown>): Promise<FilaModelo>;
  actualizarModelo(id: string, patch: Record<string, unknown>): Promise<FilaModelo>;
  // Pruebas de conexión (N1)
  ultimasPruebas(despliegueIds: string[]): Promise<Map<string, PruebaConexion>>;
  insertarPrueba(fila: {
    despliegue_id: string;
    proveedor_id: string;
    exitosa: boolean;
    latencia_ms: number;
    modelo_respondio: string | null;
    motivo_codigo: string | null;
    actor_usuario_id: string;
  }): Promise<void>;
  // Bitácora de configuración (N3) e interruptor/restaurar atómicos (N4/N5)
  registrarBitacora(evento: EventoBitacora): Promise<void>;
  leerBitacora(entidad: EventoBitacora['entidad'], entidadId: string): Promise<Array<Record<string, unknown>>>;
  /** N4 `fn_ia_cambiar_interruptor`: estado + bitácora en una transacción. */
  cambiarInterruptorRpc(p: { tipo: 'proveedor' | 'despliegue'; id: string; encender: boolean; impacto: unknown; actorId: string }): Promise<Record<string, unknown>>;
  /** N5 `fn_ia_restaurar_version`: todo o nada. */
  restaurarVersionRpc(p: { versionId: string; nota: string; actorId: string }): Promise<Record<string, unknown>>;
  /** N2 `fn_ia_prueba_vigente`: última prueba exitosa y posterior a cambios (A7; no exige encendido). */
  pruebaVigente(despliegueId: string): Promise<boolean>;
  /** N2 `fn_ia_modelo_disponible`: prueba vigente + modelo y proveedor encendidos (B1). */
  modeloDisponible(despliegueId: string): Promise<boolean>;
  // Versiones y agentes
  versionesPublicadas(): Promise<VersionPublicada[]>;
  contarBorradoresQueUsan(despliegueIds: string[]): Promise<number>;
  obtenerVersion(id: string): Promise<FilaVersion | null>;
  actualizarVersion(id: string, patch: Record<string, unknown>): Promise<FilaVersion>;
  requisitosVersion(versionId: string): Promise<{ json: boolean; herramientas: boolean }>;
  existeNumeroVersion(agenteId: string, numero: string): Promise<boolean>;
  duplicarVersion(origen: FilaVersion, numero: string, notas: string | null, actorId: string): Promise<FilaVersion>;
  // Precios (BA-038)
  listarPrecios(proveedorId: string): Promise<Array<Record<string, unknown>>>;
  registrarPrecio(p: {
    proveedor_codigo: string;
    modelo: string;
    entrada_usd_1k: number;
    salida_usd_1k: number;
    version: string;
    fuente: string | null;
    es_estimado: boolean;
    actorId: string;
  }): Promise<Record<string, unknown>>;
  precioVigente(proveedorCodigo: string, modelo: string | null): Promise<PrecioVigente | null>;
  // Topes y alertas (BA-038)
  listarCanales(): Promise<Array<{ id: string; codigo: string; nombre: string; activo: boolean }>>;
  gastoHoy(canalCodigo: string): Promise<GastoHoy>;
  actualizarTope(canalCodigo: string, tope: number | null, umbral: number | null, actorId: string): Promise<Record<string, unknown>>;
  bitacoraTope(canalCodigo: string): Promise<Array<Record<string, unknown>>>;
  consumo(canalCodigo: string, desdeIso: string, hastaIso: string): Promise<FilaCostoIa[]>;
  listarAlertas(filtro: { abiertas: boolean; canalCodigo?: string }): Promise<Array<Record<string, unknown>>>;
  marcarAlertaVista(id: string, actorId: string): Promise<{ encontrada: boolean; ya_vista: boolean }>;
  // Varios
  nombresActores(ids: string[]): Promise<Map<string, string>>;
}
