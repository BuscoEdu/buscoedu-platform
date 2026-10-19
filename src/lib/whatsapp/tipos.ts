/**
 * BA-032 · Contratos del canal WhatsApp real.
 *
 * El orquestador solo conoce estas interfaces. Así los tests corren sin base
 * de datos ni red, y la persistencia real (Supabase) vive en adaptadores aparte.
 */

import type { TipoConsentimientoRegla } from '../demowapp/funnel-aplicar-reglas';

export type EstadoContacto =
  | 'esperando_consentimiento' // primer mensaje: solo se guarda el número
  | 'sin_consentimiento' // dijo que no: solo número, sin historial
  | 'activo' // autorizó tratamiento de datos (Ley 1581)
  | 'humano' // pidió ASESOR: NaIA calla hasta MENU
  | 'baja'; // BAJA/STOP: no se le escribe más

/** Ficha del catálogo tal como se muestra en WhatsApp (sin inventar campos). */
export interface OfertaWa {
  id: string;
  nombre: string;
  universidad: string;
  modalidad?: string;
  nivel?: string;
  ciudad?: string;
  beneficio?: string;
  /** Link a la web de BuscoEdu para ver la ficha. */
  url: string;
}

/** Aplicación en curso para UNA oferta. Mi lista ≠ Aplicar ≠ Autorizar contacto. */
export interface AplicacionEnCursoWa {
  ofertaId: string;
  ofertaNombre: string;
  universidad: string;
  paso: 'datos_nombre' | 'datos_correo' | 'consentimiento';
  nombreCompleto?: string;
  correo?: string | null;
}

export interface SesionWa {
  filtros: Record<string, string>;
  ofertas: OfertaWa[];
  miLista: string[];
  aplicacion: AplicacionEnCursoWa | null;
  /**
   * BSUID de WhatsApp vinculado a este contacto (2026-10-19). Se guarda en el jsonb `sesion`
   * porque wa_contactos no tiene columna para él (propuesta no aplicada en supabase/ops).
   * Solo se vincula cuando el usuario compartió su número con el botón o ya dio el consentimiento.
   */
  waUserId?: string;
}

export const SESION_WA_VACIA: SesionWa = { filtros: {}, ofertas: [], miLista: [], aplicacion: null };

export interface ContactoWa {
  id: string;
  e164: string;
  estado: EstadoContacto;
  consentimientoDatos: boolean;
  consentimientoDatosEn: string | null;
  consentimientoVersion: string | null;
  optOut: boolean;
  optOutEn: string | null;
  ultimoEntranteMs: number | null;
  sesion: SesionWa;
}

export type ParcheContacto = Partial<Omit<ContactoWa, 'id' | 'e164'>>;

export type PasoIntencionWa = 'consentimiento_registrado' | 'lead_creado' | 'rechazada' | 'error_conversion';

export interface IntencionWa {
  contactoId: string;
  ofertaId: string;
  ofertaNombre: string;
  paso: PasoIntencionWa;
  nombreCompleto: string | null;
  correo: string | null;
  consentimientos: Array<{ codigo: string; otorgado: boolean; version_texto: string }>;
  oportunidadId?: string | null;
  personaId?: string | null;
  motivo?: string | null;
}

/** Persistencia del canal. Implementaciones: memoria (tests/local) y Supabase. */
export interface AlmacenWhatsApp {
  /** Idempotencia: true si el id es nuevo; false si ya se procesó. */
  marcarMensajeProcesado(idMensaje: string): Promise<boolean>;
  obtenerContacto(e164: string): Promise<ContactoWa | null>;
  /** Contacto ya vinculado a un BSUID (sesion.waUserId). Opcional para almacenes antiguos. */
  obtenerContactoPorUserId?(userId: string): Promise<ContactoWa | null>;
  /** Crea el contacto guardando SOLO el número (antes del consentimiento). */
  crearContactoSoloNumero(e164: string, ultimoEntranteMs: number): Promise<ContactoWa>;
  actualizarContacto(id: string, parche: ParcheContacto): Promise<void>;
  /** Historial: solo se llama con consentimiento de datos vigente. */
  registrarMensaje(
    contactoId: string,
    mensaje: { direccion: 'entrante' | 'saliente'; contenido: string; idMeta?: string | null; tipo: string }
  ): Promise<void>;
  registrarIntencion(intencion: IntencionWa): Promise<void>;
  registrarEscalamiento(contactoId: string, enHorario: boolean): Promise<void>;
}

export type FiltrosBusquedaWa = {
  programa_o_area?: string;
  modalidad?: string;
  ciudad?: string;
  nivel_academico?: string;
};

/** Catálogo: solo ofertas activas + publicadas + validadas + vigentes. */
export interface CatalogoWa {
  buscar(filtros: FiltrosBusquedaWa, max: number): Promise<{ ok: true; ofertas: OfertaWa[] } | { ok: false }>;
  tiposConsentimiento(): Promise<TipoConsentimientoRegla[]>;
}

export interface PayloadConversionWa {
  consentimiento_aceptado: true;
  clave_idempotencia: string;
  celular_e164: string;
  pais_celular: string | null;
  nombres: string;
  apellidos: string;
  nombre_completo: string;
  correo: string | null;
  visitante_id: null;
  oferta_id: string;
  ip_origen: null;
  canal_origen: 'whatsapp';
  consentimientos: Array<{ codigo: string; otorgado: boolean; version_texto: string }>;
}

/** Puerta a la conversión real (fn_ba031_convertir_si_consentido). */
export interface ConversorLeadsWa {
  convertir(
    payload: PayloadConversionWa,
    contexto: { contactoId: string }
  ): Promise<{ ok: true; personaId: string; oportunidadId: string } | { ok: false; codigo: string }>;
}
