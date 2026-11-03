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
  /** Agrupación por programa (C-08/C-52): mismo programa en varias sedes = 1 fila. */
  programa_id?: string;
  /** Todas las ciudades donde está disponible el programa (la primera = `ciudad`). */
  ciudades?: string[];
  /** WA-fix-1: área de conocimiento del programa (S12: ofrecer áreas si hay muchos resultados). */
  area?: string;
  /** WA-fix-1 (S14): `programas_academicos.codigo_snies`; vacío → «por confirmar». */
  snies?: string;
  /** WA-fix-1b (S13): duración del programa tal como la trae el catálogo («8 semestres»); vacío → no se muestra. */
  duracion?: string;
  /** WA-fix-1 (MEDIA): precio publicable ya formateado por BE («Precio: $4.316.000 COP por semestre»); vacío → T17. */
  texto_precio?: string;
}

/** Forma agrupada que consume presentacion.ts (contrato FE). */
export type OfertaAgrupadaWa = OfertaWa & { programa_id: string; ciudades: string[] };

/** Aplicación en curso para UNA oferta. Mi lista ≠ Aplicar ≠ Autorizar contacto. */
export interface AplicacionEnCursoWa {
  ofertaId: string;
  ofertaNombre: string;
  universidad: string;
  paso: 'datos_nombre' | 'datos_correo' | 'consentimiento';
  nombreCompleto?: string;
  /** WA-fix-1 (S18): nombre de una sola palabra a la espera del apellido. */
  nombreParcial?: string;
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
  // Bloque: estado del lote Ola 1/2 (todo en el jsonb `sesion`, sin migración).
  /** Versión de la sesión para control optimista (C-25): cada escritura de `sesion` la sube en 1. */
  v?: number;
  /** Etiqueta de la última búsqueda (T08 «¿Seguimos con…?» y T09 «para «…»»). */
  consulta?: string;
  /** Filtros de la última búsqueda con resultados (para «Ver más», «Seguir» y «Reintentar»). */
  filtrosBusqueda?: FiltrosBusquedaWa;
  /** Página mostrada (base 0) y total real de programas (C-12). */
  pagina?: number;
  total?: number;
  /** S12 exacto: false si el total es un mínimo (tope de páginas) → los textos dicen «más de N». */
  totalExacto?: boolean;
  /** Momento en que se mostró la lista: vale 24 h (C-18). */
  listaEn?: number;
  /** Fichas de listas recientes (<24 h) para que un toque a una lista vieja siga funcionando. */
  ofertasRecientes?: OfertaWa[];
  /** Ya se escaló a asesor en esta sesión (T14 una sola vez, C-20). */
  asesorAvisado?: boolean;
  /** Recordatorio de consentimiento ya enviado (máx 1, C-11). */
  recordatorioConsentimiento?: boolean;
  /** Fallbacks «no entendí» seguidos (T10 → oferta de asesor a la 2.ª). */
  fallosSeguidos?: number;
  /** Intentos inválidos de nombre / correo en Aplicar (T20/T21; al 3.º → T14). */
  intentosNombre?: number;
  intentosCorreo?: number;
  /** Fecha de revocación (T05 / STOP). La sesión se reinicia, el contacto NO se borra (C-51). */
  consentimientoRevocadoEn?: string;
  /** Contacto creado desde simulación de preview (C-55/C-56): datos de QA. */
  simulacionQa?: boolean;
  /** WA-fix-1 (B3): última ficha abierta y cuándo; «guardar»/«aplicar» escritos actúan sobre ella (<24 h). */
  fichaAbierta?: { ofertaId: string; en: number };
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
  /**
   * Actualiza el contacto. Con `versionSesion`, solo escribe si `sesion.v` sigue igual (control optimista, C-25)
   * y devuelve false si otro mensaje la cambió primero. Sin opción: escritura directa (devuelve true).
   * Nunca se borra el contacto (C-51): revocar/STOP = UPDATE.
   */
  actualizarContacto(id: string, parche: ParcheContacto, opciones?: { versionSesion?: number }): Promise<boolean | void>;
  /** Idempotencia (C-24): libera el wamid si el procesamiento falló, para que el reintento de Meta se atienda. */
  liberarMensaje?(idMensaje: string): Promise<void>;
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
  /** WA-fix-1 (S5): términos reconocidos que deben cumplirse TODOS (AND). */
  terminos_todos?: string[];
};

/** Catálogo: solo ofertas activas + publicadas + validadas + vigentes. */
/**
 * S12 exacto (2026-10-19) · conteo sobre TODOS los programas de la consulta (no solo los `max` devueltos).
 * `exacto` = false si se llegó al tope de páginas: entonces ni `total` ni las cantidades por área son seguras.
 */
export interface ConteoProgramasWa {
  exacto: boolean;
  /** Áreas con ≥1 programa (sin las de programas sin área), de mayor a menor; con exacto=false, la cantidad no se muestra. */
  areas: Array<{ area: string; cantidad: number }>;
}

export interface CatalogoWa {
  /**
   * Busca y devuelve programas ya agrupados por programa_id (hasta `max`) y `total` = programas distintos (C-12/C-52).
   * `total` puede faltar en catálogos de prueba: entonces vale ofertas.length.
   */
  buscar(filtros: FiltrosBusquedaWa, max: number): Promise<{ ok: true; ofertas: OfertaWa[]; total?: number; respaldoArea?: boolean; conteo?: ConteoProgramasWa } | { ok: false }>;
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
