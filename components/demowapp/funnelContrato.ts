/**
 * BA-031 · Contrato de pintura del funnel en el hilo.
 * Espeja la respuesta de /api/demowapp/aplicar. No llama a la red
 * y no decide si hay lead: solo lee lo que devolvió el servidor.
 * Sin aceptación explícita, leadCreado y oportunidadId quedan vacíos.
 */

export type AccionHilo = 'iniciar' | 'mi_lista';

export type DecisionHilo = 'aceptar' | 'rechazar' | 'abandonar';

export interface UiFunnel {
  estado: 'success' | 'error';
  cargando: boolean;
  paso: string | null;
  leadCreado: boolean;
  acciones: string[];
}

export interface MensajeFunnel {
  id: string;
  rol: 'naia' | 'sistema';
  tipo: string;
  texto: string;
  en: string;
}

export interface ConsentimientoFunnel {
  codigo: string;
  nombre: string;
  esObligatorio: boolean;
  otorgado: boolean;
  versionTexto: string;
}

export interface ContactoFunnel {
  nombreCompleto: string | null;
  celularE164: string | null;
  celularEnmascarado: string | null;
  correo: string | null;
  pais: string | null;
}

export interface SesionDemoFunnel {
  id: string;
  ofertaId: string;
  ofertaNombre: string | null;
  modeloNegocio: string | null;
  paso: string;
  contacto: ContactoFunnel;
}

/**
 * Vista que pinta el hilo. leadCreado solo es true si el servidor
 * dijo ok, paso aceptada y devolvió oportunidad. Cualquier otro
 * cuerpo se muestra como sin solicitud.
 */
export interface VistaFunnel {
  ok: boolean;
  leadCreado: boolean;
  idempotente: boolean;
  code: string | null;
  error: string | null;
  ui: UiFunnel;
  mensajes: MensajeFunnel[];
  sesionDemo: SesionDemoFunnel | null;
  oportunidadId: string | null;
  consentimientos: ConsentimientoFunnel[];
}

export interface AlmacenHilo {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

export interface SlotMemoria {
  intento: number;
  clave: string;
  intencionId: string | null;
}

export interface MemoriaHilo {
  aplicar: SlotMemoria;
  lista: SlotMemoria;
}

const PASOS_CIERRE_APLICAR = new Set(['aceptada', 'rechazada', 'abandonada']);

/**
 * Clave estable por hilo, oferta, acción e intento.
 * Dos contactos de la misma oferta no comparten clave: el hilo entra en el texto.
 */
export function claveEstable(
  oportunidadId: string,
  ofertaId: string,
  accion: AccionHilo,
  intento: number
): string {
  const n = Number.isInteger(intento) && intento > 0 ? intento : 1;
  return `hilo-${accion}-${oportunidadId}-${ofertaId}-${n}`;
}

/** Body de iniciar / Mi lista. El servidor exige oportunidadId para no cruzar hilos. */
export function cuerpoIniciarHilo(input: {
  accion: AccionHilo;
  ofertaId: string;
  oportunidadId: string;
  claveIdempotencia: string;
}): { accion: AccionHilo; ofertaId: string; oportunidadId: string; claveIdempotencia: string } {
  return {
    accion: input.accion,
    ofertaId: input.ofertaId,
    oportunidadId: input.oportunidadId,
    claveIdempotencia: input.claveIdempotencia
  };
}

/** Query del hilo en GET. Sin esto el servidor responde hilo_requerido. */
export function rutaConHilo(ruta: string, oportunidadId: string): string {
  const separador = ruta.includes('?') ? '&' : '?';
  return `${ruta}${separador}oportunidadId=${encodeURIComponent(oportunidadId)}`;
}

export function esCierreAplicar(paso: string | null | undefined): boolean {
  return PASOS_CIERRE_APLICAR.has(paso || '');
}

export function vistaVacia(paso: string | null = null): VistaFunnel {
  return {
    ok: true,
    leadCreado: false,
    idempotente: false,
    code: null,
    error: null,
    ui: {
      estado: 'success',
      cargando: false,
      paso,
      leadCreado: false,
      acciones: []
    },
    mensajes: [],
    sesionDemo: null,
    oportunidadId: null,
    consentimientos: []
  };
}

/**
 * Mientras el request está en vuelo la UI local pone cargando en true.
 * No adelanta un lead: oportunidadId se queda en null hasta la respuesta.
 */
export function vistaCargando(previa: VistaFunnel | null, paso: string | null): VistaFunnel {
  const base = previa ?? vistaVacia(paso);
  return {
    ...base,
    ok: base.ok,
    leadCreado: false,
    oportunidadId: null,
    ui: {
      estado: base.ui.estado === 'error' ? 'error' : 'success',
      cargando: true,
      paso: base.ui.paso ?? paso,
      leadCreado: false,
      acciones: base.ui.acciones
    }
  };
}

function textoDe(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  return limpio || null;
}

function leerMensajes(valor: unknown, error: string | null): MensajeFunnel[] {
  const lista = Array.isArray(valor) ? valor : [];
  const mensajes = lista
    .map((item, indice) => {
      if (!item || typeof item !== 'object') return null;
      const fila = item as Record<string, unknown>;
      const texto = textoDe(fila.texto);
      if (!texto) return null;
      const rol = fila.rol === 'sistema' ? 'sistema' : 'naia';
      return {
        id: textoDe(fila.id) || `burbuja-${indice}-${texto.slice(0, 24)}`,
        rol,
        tipo: textoDe(fila.tipo) || 'texto',
        texto,
        en: textoDe(fila.en) || ''
      } satisfies MensajeFunnel;
    })
    .filter((item): item is MensajeFunnel => Boolean(item));

  if (!mensajes.length && error) {
    mensajes.push({
      id: `error-${error.slice(0, 24)}`,
      rol: 'naia',
      tipo: 'error',
      texto: error,
      en: ''
    });
  }
  return mensajes;
}

function leerConsentimientos(valor: unknown): ConsentimientoFunnel[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const fila = item as Record<string, unknown>;
      const codigo = textoDe(fila.codigo);
      if (!codigo) return null;
      return {
        codigo,
        nombre: textoDe(fila.nombre) || codigo,
        esObligatorio: fila.esObligatorio === true,
        otorgado: fila.otorgado === true,
        versionTexto: textoDe(fila.versionTexto) || 'v1'
      } satisfies ConsentimientoFunnel;
    })
    .filter((item): item is ConsentimientoFunnel => Boolean(item));
}

function leerSesion(valor: unknown): SesionDemoFunnel | null {
  if (!valor || typeof valor !== 'object') return null;
  const fila = valor as Record<string, unknown>;
  const id = textoDe(fila.id);
  const ofertaId = textoDe(fila.ofertaId);
  const paso = textoDe(fila.paso);
  if (!id || !ofertaId || !paso) return null;
  const contacto = (fila.contacto && typeof fila.contacto === 'object'
    ? fila.contacto
    : {}) as Record<string, unknown>;
  return {
    id,
    ofertaId,
    ofertaNombre: textoDe(fila.ofertaNombre),
    modeloNegocio: textoDe(fila.modeloNegocio),
    paso,
    contacto: {
      nombreCompleto: textoDe(contacto.nombreCompleto),
      celularE164: textoDe(contacto.celularE164),
      celularEnmascarado: textoDe(contacto.celularEnmascarado),
      correo: textoDe(contacto.correo),
      pais: textoDe(contacto.pais)
    }
  };
}

function leerAcciones(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

/**
 * Normaliza el JSON del servidor.
 * Un string "true" no cuenta como lead ni como permiso otorgado.
 * Mi lista nunca se pinta como solicitud.
 */
export function normalizarCuerpo(data: unknown): VistaFunnel {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return vistaRed('No pude leer la respuesta del hilo. No quedó ninguna solicitud.');
  }
  const fila = data as Record<string, unknown>;
  const ok = fila.ok === true;
  const uiRaw = (fila.ui && typeof fila.ui === 'object' ? fila.ui : {}) as Record<string, unknown>;
  const paso = textoDe(uiRaw.paso) || textoDe(fila.paso);
  const error = textoDe(fila.error);
  const code = textoDe(fila.code);
  const oportunidad = textoDe(fila.oportunidadId);
  /* Solo paso aceptada, con oportunidad, se pinta como solicitud. Mi lista no entra. */
  const leadCreado =
    ok &&
    paso === 'aceptada' &&
    fila.leadCreado === true &&
    uiRaw.leadCreado === true &&
    Boolean(oportunidad);

  return {
    ok,
    leadCreado,
    idempotente: fila.idempotente === true,
    code,
    error,
    ui: {
      estado: uiRaw.estado === 'error' || !ok ? 'error' : 'success',
      cargando: false,
      paso,
      leadCreado,
      acciones: leerAcciones(uiRaw.acciones)
    },
    mensajes: leerMensajes(fila.mensajes, ok ? null : error),
    sesionDemo: leerSesion(fila.sesionDemo),
    oportunidadId: leadCreado ? oportunidad : null,
    consentimientos: leerConsentimientos(fila.consentimientos)
  };
}

/** Error de red o JSON ilegible. No inventa oportunidad. */
export function vistaRed(texto: string): VistaFunnel {
  return {
    ok: false,
    leadCreado: false,
    idempotente: false,
    code: 'red',
    error: texto,
    ui: {
      estado: 'error',
      cargando: false,
      paso: null,
      leadCreado: false,
      acciones: []
    },
    mensajes: [
      {
        id: `red-${texto.slice(0, 24)}`,
        rol: 'naia',
        tipo: 'error',
        texto,
        en: ''
      }
    ],
    sesionDemo: null,
    oportunidadId: null,
    consentimientos: []
  };
}

/**
 * El error del servidor trae una burbuja nueva y leadCreado en false.
 * Se conserva el texto ya mostrado y las casillas, sin marcar un lead.
 */
export function fusionarError(previa: VistaFunnel | null, entrante: VistaFunnel): VistaFunnel {
  const base = previa ?? vistaVacia(entrante.ui.paso);
  const ya = new Set(base.mensajes.map((item) => `${item.tipo}:${item.texto}`));
  const nuevas = entrante.mensajes.filter((item) => !ya.has(`${item.tipo}:${item.texto}`));
  return {
    ...entrante,
    ok: false,
    leadCreado: false,
    oportunidadId: null,
    ui: {
      ...entrante.ui,
      cargando: false,
      leadCreado: false,
      paso: entrante.ui.paso ?? base.ui.paso,
      acciones: entrante.ui.acciones.length ? entrante.ui.acciones : base.ui.acciones
    },
    mensajes: [...base.mensajes, ...nuevas],
    sesionDemo: entrante.sesionDemo ?? base.sesionDemo,
    consentimientos: entrante.consentimientos.length ? entrante.consentimientos : base.consentimientos
  };
}

/**
 * Solo el booleano true viaja como otorgado.
 * Una casilla ausente o un string "true" salen en false.
 */
export function declaracionesDesdeMarcas(
  codigos: string[],
  marcas: Record<string, unknown>
): { codigo: string; otorgado: boolean }[] {
  return codigos.map((codigo) => ({
    codigo,
    otorgado: marcas[codigo] === true
  }));
}

/** Mi lista no hereda acciones de Aplicar ni un id de oportunidad. */
export function vistaSoloLista(vista: VistaFunnel): VistaFunnel {
  return {
    ...vista,
    leadCreado: false,
    oportunidadId: null,
    ui: {
      ...vista.ui,
      cargando: false,
      leadCreado: false,
      acciones: vista.ui.paso === 'mi_lista' ? [] : vista.ui.acciones
    }
  };
}

function slotNuevo(oportunidadId: string, ofertaId: string, accion: AccionHilo, intento = 1): SlotMemoria {
  return {
    intento,
    clave: claveEstable(oportunidadId, ofertaId, accion, intento),
    intencionId: null
  };
}

function leerSlot(valor: unknown, oportunidadId: string, ofertaId: string, accion: AccionHilo): SlotMemoria {
  if (!valor || typeof valor !== 'object') return slotNuevo(oportunidadId, ofertaId, accion);
  const fila = valor as Record<string, unknown>;
  const intento = typeof fila.intento === 'number' && fila.intento > 0 ? Math.floor(fila.intento) : 1;
  const clave = textoDe(fila.clave) || claveEstable(oportunidadId, ofertaId, accion, intento);
  const intencionId = textoDe(fila.intencionId);
  return { intento, clave, intencionId };
}

const PREFIJO_MEMORIA = 'ba031-hilo:';

/** La memoria del navegador se indexa por hilo y oferta, no solo por la oferta. */
export function claveMemoriaHilo(oportunidadId: string, ofertaId: string): string {
  return `${PREFIJO_MEMORIA}${oportunidadId}:${ofertaId}`;
}

export function leerMemoria(almacen: AlmacenHilo, oportunidadId: string, ofertaId: string): MemoriaHilo {
  try {
    const crudo = almacen.getItem(claveMemoriaHilo(oportunidadId, ofertaId));
    const json = crudo ? (JSON.parse(crudo) as Record<string, unknown>) : {};
    return {
      aplicar: leerSlot(json.aplicar, oportunidadId, ofertaId, 'iniciar'),
      lista: leerSlot(json.lista, oportunidadId, ofertaId, 'mi_lista')
    };
  } catch {
    return {
      aplicar: slotNuevo(oportunidadId, ofertaId, 'iniciar'),
      lista: slotNuevo(oportunidadId, ofertaId, 'mi_lista')
    };
  }
}

export function guardarMemoria(
  almacen: AlmacenHilo,
  oportunidadId: string,
  ofertaId: string,
  memoria: MemoriaHilo
) {
  almacen.setItem(claveMemoriaHilo(oportunidadId, ofertaId), JSON.stringify(memoria));
}

/** Nuevo intento después de un cierre. La clave anterior no se reutiliza. */
export function rotarSlot(
  slot: SlotMemoria,
  oportunidadId: string,
  ofertaId: string,
  accion: AccionHilo
): SlotMemoria {
  return slotNuevo(oportunidadId, ofertaId, accion, slot.intento + 1);
}

const memoriaEnProceso = new Map<string, string>();

/** sessionStorage de la pestaña. Si está bloqueado, la clave vive en memoria. */
export function almacenNavegador(): AlmacenHilo {
  try {
    if (typeof sessionStorage === 'undefined') throw new Error('sin sessionStorage');
    const sonda = '__ba031_sonda__';
    sessionStorage.setItem(sonda, '1');
    sessionStorage.removeItem(sonda);
    return sessionStorage;
  } catch {
    return {
      getItem: (clave) => memoriaEnProceso.get(clave) ?? null,
      setItem: (clave, valor) => {
        memoriaEnProceso.set(clave, valor);
      }
    };
  }
}
