/**
 * E1 · Frontend — Capa de acceso a datos del panel «IA multiproveedor».
 *
 * Qué hace: define `ClienteAdminIa`, con UN método por endpoint del contrato
 * `docs/backend/README-e1-api.md` (contrato 824ac4d, implementado en 2759bc2), y exporta `clienteAdminIa`, la
 * implementación en uso.
 * Para qué: que las pantallas nunca llamen `fetch` directo. Hay dos implementaciones con el
 * mismo contrato:
 *   - `api.ts`: `fetch` real a `/api/admin/ia/...` (fase 2 de Backend, commit 2759bc2). ES LA QUE SE USA.
 *   - `ejemplo.ts`: DATOS DE EJEMPLO en memoria, solo para pruebas y capturas locales.
 */

import type {
  ActualizarModeloBody,
  ActualizarProveedorBody,
  Advertencia,
  AgenteConVersiones,
  AlertaApi,
  AsignarModeloBody,
  Confirmacion,
  ConsumoApi,
  CrearModeloBody,
  CrearProveedorBody,
  DetalleProveedorApi,
  DetalleTopeApi,
  EstadoClaveApi,
  EstadoGastoApi,
  GuardarTopeBody,
  Impacto,
  ModeloApi,
  ModeloDisponibleApi,
  PrecioApi,
  PresetApi,
  ProveedorApi,
  InterruptorApi,
  RegistrarPrecioBody,
  RespuestaAsignarModelo,
  RespuestaPrueba,
  Resultado,
  VersionAgente
} from './tipos';
import { clienteApi } from './api';

/** Contrato que cualquier implementación (ejemplo o real) debe cumplir. Entre paréntesis, el id del README. */
export interface ClienteAdminIa {
  /** true si la implementación usa datos de ejemplo: las pantallas muestran el aviso. */
  readonly esEjemplo: boolean;

  // ── Proveedores (§1) ──
  listarPresets(): Promise<Resultado<PresetApi[]>>; // P1
  listarProveedores(): Promise<Resultado<ProveedorApi[]>>; // P2
  crearProveedor(body: CrearProveedorBody): Promise<Resultado<ProveedorApi>>; // P3
  obtenerProveedor(id: string): Promise<Resultado<DetalleProveedorApi>>; // P4
  actualizarProveedor(id: string, body: ActualizarProveedorBody): Promise<Resultado<ProveedorApi>>; // P5
  guardarClave(id: string, clave: string): Promise<Resultado<{ clave: EstadoClaveApi; advertencias: Advertencia[] }>>; // P6
  revocarClave(id: string, c: Confirmacion): Promise<Resultado<{ clave: EstadoClaveApi }>>; // P7
  impactoProveedor(id: string): Promise<Resultado<Impacto>>; // P8
  encenderProveedor(id: string): Promise<Resultado<InterruptorApi>>; // P9
  apagarProveedor(id: string, c: Confirmacion): Promise<Resultado<InterruptorApi>>; // P10

  // ── Modelos de un proveedor (§2) ──
  listarModelos(proveedorId: string): Promise<Resultado<ModeloApi[]>>; // M1
  crearModelo(body: CrearModeloBody): Promise<Resultado<ModeloApi>>; // M2
  actualizarModelo(id: string, body: ActualizarModeloBody): Promise<Resultado<ModeloApi>>; // M3
  probarModelo(id: string): Promise<Resultado<RespuestaPrueba>>; // M4
  encenderModelo(id: string): Promise<Resultado<{ item: ModeloApi; advertencias: Advertencia[] }>>; // M5
  apagarModelo(id: string, c: Confirmacion): Promise<Resultado<ModeloApi>>; // M6
  impactoModelo(id: string): Promise<Resultado<Impacto>>; // M7
  listarPrecios(proveedorId: string): Promise<Resultado<PrecioApi[]>>; // M8 GET
  registrarPrecio(body: RegistrarPrecioBody): Promise<Resultado<{ precio_id: string; reemplaza_precio_id: string | null }>>; // M8 POST

  // ── Modelo por agente (§3) ──
  /** SUPUESTO: arma agentes + versiones con rutas existentes (`/agentes`, `/versiones?agente_id=`). */
  listarAgentes(): Promise<Resultado<AgenteConVersiones[]>>;
  modelosDisponibles(requiere?: Array<'json' | 'herramientas'>): Promise<Resultado<ModeloDisponibleApi[]>>; // B-1
  asignarModelo(versionId: string, body: AsignarModeloBody): Promise<Resultado<RespuestaAsignarModelo>>; // B-2
  duplicarVersion(versionId: string, numeroVersion: string, notas?: string): Promise<Resultado<VersionAgente>>; // B-3
  publicarVersion(versionId: string): Promise<Resultado<VersionAgente>>; // B-5
  restaurarVersion(versionId: string, nota: string): Promise<Resultado<{ anterior_version_id: string | null }>>; // B-6

  // ── Tope por canal, consumo y alertas (§4) ──
  listarTopes(): Promise<Resultado<EstadoGastoApi[]>>; // T1
  obtenerTope(canal: string): Promise<Resultado<DetalleTopeApi>>; // T2
  guardarTope(canal: string, body: GuardarTopeBody): Promise<Resultado<EstadoGastoApi>>; // T3
  consumo(canal: string, dia?: string): Promise<Resultado<ConsumoApi>>; // T4
  listarAlertas(estado: 'abiertas' | 'todas', canal?: string): Promise<Resultado<AlertaApi[]>>; // T5
  marcarAlertaVista(id: string): Promise<Resultado<{ sin_cambios?: boolean }>>; // T6
}

/* ────────────────────────────────────────────────────────────────────────────
 * Implementación en uso: SIEMPRE la API real (`clienteApi`, fetch a /api/admin/ia).
 * Qué hace: `clienteAdminIa` delega cada método en la implementación activa. Por defecto es la real.
 * Para qué: Backend ya implementó la fase 2 (commit 2759bc2), así que producción usa datos reales.
 * El adaptador de ejemplo (`ejemplo.ts`) NO se importa aquí: así nunca entra al bundle de producción.
 * Solo una vista previa local sin commitear o una prueba puede cambiarlo con
 * `usarAdaptadorDeEjemplo`, y fuera de desarrollo/pruebas esa función se niega.
 * ──────────────────────────────────────────────────────────────────────────── */

let activo: ClienteAdminIa = clienteApi;

/** Solo para capturas locales y pruebas: cambia a datos de ejemplo. En producción lanza error. */
export function usarAdaptadorDeEjemplo(cliente: ClienteAdminIa): void {
  if (process.env.NODE_ENV === 'production') throw new Error('adaptador_de_ejemplo_prohibido_en_produccion');
  if (!cliente.esEjemplo) throw new Error('solo_adaptador_de_ejemplo');
  activo = cliente;
}

export const clienteAdminIa: ClienteAdminIa = new Proxy({} as ClienteAdminIa, {
  get: (_objetivo, propiedad) => (activo as unknown as Record<string | symbol, unknown>)[propiedad]
});

/** Implementación real, exportada para pruebas. */
export { clienteApi };
