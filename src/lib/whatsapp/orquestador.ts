/**
 * BA-032 · Orquestador de conversación de WhatsApp real.
 *
 * Aplica los criterios de Producto en este orden por cada mensaje entrante:
 *   0. el mensaje es para nuestro phone_number_id
 *   1. piloto cerrado / apertura pública (allowlist WA_PILOTO_NUMEROS o WA_REAL_HABILITADO)
 *   2. idempotencia por id de mensaje (wamid)
 *   3. ventana de 24 h (solo respondemos mensajes recientes)
 *   4. límite por número (rate limit)
 *   5. BAJA/STOP/ALTA, consentimiento de datos (Ley 1581, versión T01 v2), revocación, ASESOR/MENU
 *   6. intención (saludo, número de la lista, ver más, becas, precio, pregunta abierta, no entendí, búsqueda)
 *   7. catálogo agrupado por programa (máx 8 por página, N real) → Mi lista | Aplicar → datos → Autorizar contacto
 *   8. conversión a lead solo con WA_LEAD_CONVERSION_ENABLED='true' y autorización explícita
 * Copy: Producto v1.3 (copy.ts para el flujo; presentacion.ts de FE para resultados y ficha).
 *
 * Reutiliza: extracción de intereses de NaIA (vozNaia) y reglas del funnel BA-031
 * (evaluarDecision / evaluarGuardadoDatos). No escribe directo en la base: usa interfaces.
 */

import { extraerSlotsDeclarados } from '../../../lib/agentes/vozNaia';
import { evaluarDecision, evaluarGuardadoDatos } from '../demowapp/funnel-aplicar-reglas';
import { detectarComando, enHorarioAsesores, plegarComando } from './comandos';
import type { ConfigWhatsApp } from './config';
import { puedeEnviar, remitentePuedeRecibirRespuesta } from './config';
import type { BotonRespuesta, EnviadorWhatsApp, FilaLista } from './graph-client';
import { destinoRemitente, MAX_FILAS_LISTA_BUSCOEDU, WhatsAppApiError } from './graph-client';
import { filtrosDesdeTexto as filtrosBusqueda, filtrosVacios } from './busqueda';
import * as C from './copy';
import { clasificarTexto, esRevocacion, NO_CONSENTIMIENTO, SALUDOS, SI_CONSENTIMIENTO } from './intenciones';
import * as M from './mensajes';
import { armarFicha, armarResultados, PROGRAMAS_POR_PAGINA } from './presentacion';
import type { LimitadorTasa } from './rate-limit';
import type {
  AlmacenWhatsApp,
  CatalogoWa,
  ContactoWa,
  ConversorLeadsWa,
  FiltrosBusquedaWa,
  OfertaAgrupadaWa,
  OfertaWa,
  ParcheContacto,
  SesionWa
} from './tipos';
import { SESION_WA_VACIA } from './tipos';
import type { MensajeEntrante, RemitenteEntrante } from './webhook-parser';
import { claveRemitente, remitenteDe } from './webhook-parser';
import { dentroDeVentana24h } from './ventana';

export interface DependenciasOrquestador {
  config: ConfigWhatsApp;
  almacen: AlmacenWhatsApp;
  catalogo: CatalogoWa;
  conversor: ConversorLeadsWa;
  enviador: EnviadorWhatsApp;
  limitador: LimitadorTasa;
  ahora?: () => number;
  log?: (evento: string, datos?: Record<string, unknown>) => void;
  /** Interno por mensaje: versión de sesión ya escrita (control optimista) y hora de inicio (logs QA). */
  _versiones?: Map<string, number>;
  _inicioMs?: number;
}

/** Otro mensaje del mismo contacto cambió la sesión primero: no se pisa (C-25). */
export class ConflictoSesion extends Error {
  constructor() {
    super('conflicto_sesion');
    this.name = 'ConflictoSesion';
  }
}

/** Tiempo máximo para el catálogo antes de responder T13 (C-23). */
export const TIMEOUT_CATALOGO_MS = 5000;
/** Programas que se piden al catálogo (ya agrupados) para paginar de a 8. */
export const MAX_PROGRAMAS_CONSULTA = 40;
/** Una lista sigue valiendo 24 h (C-18). */
export const VIGENCIA_LISTA_MS = 24 * 60 * 60 * 1000;

export type ResultadoProceso =
  | 'otro_numero'
  | 'fuera_allowlist'
  | 'sin_credenciales'
  | 'duplicado'
  | 'fuera_ventana'
  | 'rate_limit'
  | 'silencio_baja'
  | 'silencio_humano'
  | 'respondido'
  | 'solo_user_id'
  | 'conflicto'
  | 'error';

/** Enmascara un número para logs: +57••••••123. Nunca se loguea completo. */
export function enmascarar(e164: string): string {
  if (!e164 || e164.length < 6) return '••••';
  return `${e164.slice(0, 3)}••••••${e164.slice(-3)}`;
}

/** Bloque: BSUID enmascarado para logs: uid:***ab12 (solo los 4 últimos caracteres). */
export function enmascararUserId(userId: string | null | undefined): string {
  const v = (userId || '').trim();
  if (v.length < 6) return 'uid:***';
  return `uid:***${v.slice(-4)}`;
}

/** Bloque: remitente enmascarado (teléfono si lo hay; si no, BSUID). */
export function enmascararRemitente(r: RemitenteEntrante): string {
  return r.telefono ? enmascarar(r.telefono) : enmascararUserId(r.userId);
}

export async function procesarMensajeEntrante(
  mensaje: MensajeEntrante,
  depsEntrada: DependenciasOrquestador
): Promise<ResultadoProceso> {
  // Bloque: estado interno por mensaje (versiones de sesión escritas y hora real de inicio para logs QA).
  const deps: DependenciasOrquestador = { ...depsEntrada, _versiones: new Map(), _inicioMs: Date.now() };
  const ahora = deps.ahora ? deps.ahora() : Date.now();
  const log = deps.log || (() => {});
  const { config, almacen } = deps;

  // 0) Solo mensajes dirigidos a nuestro número de negocio.
  if (mensaje.phoneNumberIdDestino && config.phoneNumberId && mensaje.phoneNumberIdDestino !== config.phoneNumberId) {
    log('wa_otro_numero');
    return 'otro_numero';
  }

  // Bloque: identidad del remitente (teléfono y/o BSUID); la clave sirve para rate limit.
  const remitente = remitenteDe(mensaje);
  const clave = claveRemitente(mensaje);
  const mascara = enmascararRemitente(remitente);

  // 1) Piloto cerrado: fuera de la allowlist (por teléfono o por BSUID) no se responde ni se guarda nada.
  if (!remitentePuedeRecibirRespuesta(config, remitente)) {
    log('wa_fuera_allowlist', { numero: mascara, pilotoInvalido: config.pilotoInvalido });
    return 'fuera_allowlist';
  }

  if (!puedeEnviar(config)) {
    log('wa_sin_credenciales_envio');
    return 'sin_credenciales';
  }

  // 2) Idempotencia: Meta reintenta webhooks; un mismo wamid se procesa una sola vez.
  const nuevo = await almacen.marcarMensajeProcesado(mensaje.id);
  if (!nuevo) {
    log('wa_duplicado');
    return 'duplicado';
  }

  // 3) Ventana de 24 h: un mensaje viejo (reintento tardío) no abre respuesta.
  if (!dentroDeVentana24h(mensaje.timestampMs, ahora)) {
    log('wa_fuera_ventana', { numero: mascara });
    return 'fuera_ventana';
  }

  // 4) Límite por número.
  if (!deps.limitador.permitir(clave, ahora)) {
    log('wa_rate_limit', { numero: mascara });
    return 'rate_limit';
  }

  // Bloque: remitente SOLO con BSUID (nombre de usuario de WhatsApp, sin número).
  // Qué: no se crea contacto ni historial (wa_contactos.celular_e164 es NOT NULL con CHECK E.164);
  // solo se le pide el número con el botón oficial de Meta, dirigido por `recipient` (BSUID).
  // Por qué: sin número no hay dónde guardar su autorización de datos (Ley 1581) ni su estado.
  // Si ese BSUID ya está vinculado a un contacto (compartió su número antes), se sigue el flujo normal.
  if (!remitente.telefono) {
    const vinculado =
      remitente.userId && almacen.obtenerContactoPorUserId ? await almacen.obtenerContactoPorUserId(remitente.userId) : null;
    if (!vinculado) return atenderSoloUserId(remitente, deps, log, mascara);
    log('wa_remitente_vinculado_por_user_id', { usuario: mascara });
    mensaje = {
      ...mensaje,
      e164: vinculado.e164,
      waId: vinculado.e164.slice(1),
      remitente: { telefono: vinculado.e164, userId: remitente.userId }
    };
  }

  let resultado: ResultadoProceso = 'error';
  try {
    resultado = await atender(mensaje, deps, ahora, log);
    return resultado;
  } catch (error) {
    if (error instanceof ConflictoSesion) {
      // Otro mensaje del mismo contacto escribió la sesión primero: no se pisa ni se responde dos veces.
      log('wa_conflicto_sesion', { numero: mascara });
      resultado = 'conflicto';
      return resultado;
    }
    // Error inesperado: T13 honesto. Solo el nombre del error en el log (sin mensaje crudo que pueda traer datos).
    log('wa_error_orquestador', { error: error instanceof Error ? error.name : 'desconocido' });
    // Idempotencia (C-24): se libera el wamid para que el reintento de Meta se atienda en vez de perderse.
    try {
      await almacen.liberarMensaje?.(mensaje.id);
    } catch {
      log('wa_dedupe_liberar_fallo');
    }
    try {
      await deps.enviador.enviarTexto(destinoRemitente(remitenteDe(mensaje)), C.T13_ERROR);
    } catch {
      // Si la API de Meta también está caída no hay nada más que hacer en este turno.
    }
    return 'error';
  } finally {
    // Bloque: tiempos por mensaje al ms con prefijo QA (C-53), sin PII: QA calcula p95 y máximo desde los logs.
    log('QA_wa_tiempo', {
      usuario: mascara,
      wamid: (mensaje.id || '').slice(-8),
      entranteMs: mensaje.timestampMs,
      inicioMs: deps._inicioMs,
      finMs: Date.now(),
      msProceso: Date.now() - (deps._inicioMs || Date.now()),
      resultado
    });
  }
}

/**
 * Bloque: vincula el BSUID al contacto (sesion.waUserId) para reconocerlo si luego escribe sin `from`.
 * Cuándo: solo si compartió su número con el botón (acto explícito) o si ya dio el consentimiento de datos.
 * Por qué: antes del consentimiento la promesa es "solo guardo tu número" (Ley 1581).
 */
async function vincularUserIdSiCorresponde(
  contacto: ContactoWa,
  mensaje: MensajeEntrante,
  deps: DependenciasOrquestador
): Promise<ContactoWa> {
  const userId = remitenteDe(mensaje).userId;
  if (!userId || contacto.sesion?.waUserId === userId) return contacto;
  if (!mensaje.contactoCompartido && !contacto.consentimientoDatos) return contacto;
  const sesion: SesionWa = { ...contacto.sesion, waUserId: userId };
  await deps.almacen.actualizarContacto(contacto.id, { sesion });
  return { ...contacto, sesion };
}

/**
 * Bloque: respuesta sin estado a un remitente que solo trae BSUID.
 * Usa request_contact_info si el enviador lo soporta; si Meta lo rechaza
 * (p. ej. 131062 "BSUID recipients are not supported"), cae a un texto simple.
 */
async function atenderSoloUserId(
  remitente: RemitenteEntrante,
  deps: DependenciasOrquestador,
  log: NonNullable<DependenciasOrquestador['log']>,
  mascara: string
): Promise<ResultadoProceso> {
  log('wa_remitente_solo_user_id', { usuario: mascara });
  const destino = destinoRemitente(remitente);
  try {
    if (deps.enviador.enviarSolicitudContacto) {
      try {
        await deps.enviador.enviarSolicitudContacto(destino, M.PEDIR_NUMERO_SOLO_USER_ID);
        return 'solo_user_id';
      } catch (error) {
        if (!(error instanceof WhatsAppApiError)) throw error;
        log('wa_envio_fallido', { status: error.status, codigoMeta: error.codigoMeta, tipo: error.tipo, via: 'request_contact_info' });
      }
    }
    await deps.enviador.enviarTexto(destino, M.PEDIR_NUMERO_SOLO_USER_ID);
  } catch (error) {
    if (!(error instanceof WhatsAppApiError)) throw error;
    log('wa_envio_fallido', { status: error.status, codigoMeta: error.codigoMeta, tipo: error.tipo });
  }
  return 'solo_user_id';
}

async function atender(
  mensaje: MensajeEntrante,
  deps: DependenciasOrquestador,
  ahora: number,
  log: NonNullable<DependenciasOrquestador['log']>
): Promise<ResultadoProceso> {
  const { almacen } = deps;
  const comando = mensaje.tipo === 'texto' ? detectarComando(mensaje.texto) : null;
  const plegado = mensaje.tipo === 'texto' ? plegarComando(mensaje.texto) : '';

  // Bloque: contacto. Si es nuevo, se guarda SOLO el número y la hora del último entrante.
  let contacto = await almacen.obtenerContacto(mensaje.e164);
  if (!contacto) {
    contacto = await almacen.crearContactoSoloNumero(mensaje.e164, mensaje.timestampMs);
    contacto = await vincularUserIdSiCorresponde(contacto, mensaje, deps);
    if (comando === 'baja') return darDeBaja(contacto, deps, ahora);
    // Simulación de preview (C-55/C-56): el contacto queda marcado como dato de QA en la BD compartida.
    if (deps.config.simulacion) {
      contacto = await actualizar(contacto, deps, { sesion: { ...contacto.sesion, simulacionQa: true } });
    }
    await enviarBienvenida(contacto, deps, false);
    return 'respondido';
  }

  contacto = await vincularUserIdSiCorresponde(contacto, mensaje, deps);
  const ultimo = Math.max(contacto.ultimoEntranteMs || 0, mensaje.timestampMs);
  await almacen.actualizarContacto(contacto.id, { ultimoEntranteMs: ultimo });
  contacto = { ...contacto, ultimoEntranteMs: ultimo };

  // Bloque: BAJA / ALTA. Una baja silencia todo salvo ALTA o un saludo (S19: «Hola» tras STOP responde y re-pide).
  if (comando === 'baja') return darDeBaja(contacto, deps, ahora);
  if (contacto.optOut || contacto.estado === 'baja') {
    if (comando !== 'alta' && !SALUDOS.has(plegado)) {
      log('wa_silencio_baja');
      return 'silencio_baja';
    }
    // Tras STOP el consentimiento quedó revocado (C-01): siempre se vuelve a pedir, con estado limpio.
    contacto = await actualizar(contacto, deps, {
      optOut: false,
      optOutEn: null,
      estado: 'esperando_consentimiento',
      consentimientoDatos: false,
      sesion: sesionReiniciada(contacto)
    });
    await enviarBienvenida(contacto, deps, true);
    return 'respondido';
  }

  // Bloque: consentimiento vigente = aceptado Y con la versión actual del texto legal (T01 v2, C-09).
  if (!consentimientoVigente(contacto)) {
    return gestionarConsentimiento(contacto, mensaje, comando, deps, ahora);
  }

  // Desde aquí hay consentimiento: el historial sí se guarda.
  await almacen.registrarMensaje(contacto.id, {
    direccion: 'entrante',
    contenido: etiquetaQa(deps, mensaje.texto || `[${mensaje.tipo}]`),
    idMeta: mensaje.id,
    tipo: mensaje.tipo
  });

  // Bloque: revocación con consentimiento previo (T05, C-03). UPDATE, nunca DELETE (C-51).
  if (mensaje.tipo === 'texto' && esRevocacion(mensaje.texto)) {
    return revocar(contacto, deps, ahora);
  }

  // Bloque: modo asesor. NaIA calla hasta MENU; un 2.º «asesor» recibe la confirmación sin escalar de nuevo (C-20).
  if (contacto.estado === 'humano') {
    const pideMenu = comando === 'menu' || mensaje.respuestaId === 'menu:buscar';
    if (pideMenu) {
      contacto = await actualizar(contacto, deps, { estado: 'activo' });
      await enviarBotones(contacto, deps, C.T02_PEDIR, C.BOTONES_MENU);
      return 'respondido';
    }
    if (comando === 'asesor' || mensaje.respuestaId === 'menu:asesor') {
      await enviarBotones(contacto, deps, C.T14_YA_AVISADO, C.BOTONES_SOLO_BUSCAR);
      return 'respondido';
    }
    log('wa_silencio_humano');
    return 'silencio_humano';
  }

  if (comando === 'asesor') return pasarAAsesor(contacto, deps, ahora);

  if (comando === 'menu' || comando === 'alta') {
    await enviarBotones(contacto, deps, C.T02_PEDIR, C.BOTONES_MENU);
    return 'respondido';
  }

  // Bloque: respuestas a botones y listas.
  if ((mensaje.tipo === 'lista' || mensaje.tipo === 'boton') && mensaje.respuestaId) {
    return gestionarRespuestaInteractiva(contacto, mensaje.respuestaId, deps, ahora);
  }

  // T15: voz, imagen, sticker… → solo texto + menú.
  if (mensaje.tipo !== 'texto' || !mensaje.texto) {
    await enviarBotones(contacto, deps, C.T15_SOLO_TEXTO, C.BOTONES_MENU);
    return 'respondido';
  }

  // Bloque: aplicación en curso esperando datos escritos. Si el texto es claramente una búsqueda
  // («quiero estudiar…»), se cancela Aplicar en vez de guardar la frase como nombre (QA S18f).
  const aplicacion = contacto.sesion.aplicacion;
  if (aplicacion && (aplicacion.paso === 'datos_nombre' || aplicacion.paso === 'datos_correo')) {
    if (aplicacion.paso === 'datos_nombre' && extraerSlotsDeclarados(mensaje.texto).intereses) {
      contacto = await actualizar(contacto, deps, { sesion: { ...contacto.sesion, aplicacion: null, intentosNombre: 0 } });
      return buscarYMostrar(contacto, deps, ahora, { texto: mensaje.texto });
    }
    return capturarDatosAplicacion(contacto, mensaje.texto, deps, ahora);
  }

  return atenderTextoLibre(contacto, mensaje.texto, deps, ahora);
}

// ---------------------------------------------------------------------------
// Texto libre: intención → respuesta
// ---------------------------------------------------------------------------

async function atenderTextoLibre(
  contacto: ContactoWa,
  texto: string,
  deps: DependenciasOrquestador,
  ahora: number
): Promise<ResultadoProceso> {
  const intencion = clasificarTexto(texto);
  // Cualquier intención reconocida reinicia el contador de «no entendí».
  if (intencion.tipo !== 'no_entendi' && contacto.sesion.fallosSeguidos) {
    contacto = await actualizar(contacto, deps, { sesion: { ...contacto.sesion, fallosSeguidos: 0 } });
  }
  switch (intencion.tipo) {
    case 'saludo':
      return saludarConSesion(contacto, deps, ahora);
    case 'cierre':
      await enviarTexto(contacto, deps, C.T24_CIERRE);
      return 'respondido';
    case 'revocar':
      return revocar(contacto, deps, ahora);
    case 'numero':
      return elegirPorNumero(contacto, intencion.numero, deps, ahora);
    case 'mas':
      return verMas(contacto, deps, ahora);
    case 'becas':
      return responderBecas(contacto, deps, ahora);
    case 'precio':
      await enviarBotones(contacto, deps, C.T17_PRECIO, C.BOTONES_NUEVA_O_ASESOR);
      return 'respondido';
    case 'pregunta_abierta':
      await enviarBotones(contacto, deps, C.T12_PREGUNTA_ABIERTA, C.BOTONES_ASESOR_O_BUSCAR);
      return 'respondido';
    case 'no_entendi':
      return noEntendi(contacto, deps);
    default:
      return buscarYMostrar(contacto, deps, ahora, { texto });
  }
}

// Bloque: T10 «no entendí»; a la 2.ª seguida ofrece asesor (re-explica en otras palabras, criterio S16).
async function noEntendi(contacto: ContactoWa, deps: DependenciasOrquestador): Promise<ResultadoProceso> {
  const fallos = (contacto.sesion.fallosSeguidos || 0) + 1;
  contacto = await actualizar(contacto, deps, { sesion: { ...contacto.sesion, fallosSeguidos: fallos } });
  if (fallos >= 2) await enviarBotones(contacto, deps, C.T10_REPETIDO, C.BOTONES_ASESOR_O_BUSCAR);
  else await enviarBotones(contacto, deps, C.T10_NO_ENTENDI, C.BOTONES_MENU);
  return 'respondido';
}

// Bloque: T08 «Hola» con sesión vigente: ofrece seguir la última búsqueda o empezar otra (no repite la búsqueda).
async function saludarConSesion(contacto: ContactoWa, deps: DependenciasOrquestador, _ahora: number): Promise<ResultadoProceso> {
  if (contacto.sesion.consulta) {
    await enviarBotones(contacto, deps, C.t08HolaConBusqueda(contacto.sesion.consulta), C.BOTONES_SEGUIR);
  } else {
    await enviarBotones(contacto, deps, C.T08_HOLA_SIN_BUSQUEDA, C.BOTONES_MENU);
  }
  return 'respondido';
}

// Bloque: T16 becas: solo beneficios del catálogo de la última lista; nunca porcentajes inventados.
async function responderBecas(contacto: ContactoWa, deps: DependenciasOrquestador, ahora: number): Promise<ResultadoProceso> {
  const lista = listaVigente(contacto, ahora);
  if (lista.length === 0) {
    // Sin búsqueda previa no hay sobre qué responder: se pide qué programa (derivado de T02).
    await enviarBotones(contacto, deps, C.T02_PEDIR, C.BOTONES_MENU);
    return 'respondido';
  }
  const conBeneficio = lista.filter((o) => o.beneficio).slice(0, 3);
  if (conBeneficio.length === 0) {
    await enviarBotones(contacto, deps, C.T16_SIN_BECAS, C.BOTONES_NUEVA_O_ASESOR);
    return 'respondido';
  }
  const lineas = conBeneficio.map((o) => `*${o.nombre}*\n${C.t16ConBeneficio(o.beneficio!)}`);
  await enviarBotones(contacto, deps, lineas.join('\n\n').slice(0, 600), C.BOTONES_NUEVA_O_ASESOR);
  return 'respondido';
}

// ---------------------------------------------------------------------------
// Consentimiento
// ---------------------------------------------------------------------------

function consentimientoVigente(contacto: ContactoWa): boolean {
  return contacto.consentimientoDatos && contacto.consentimientoVersion === C.VERSION_TEXTO_DATOS_V2;
}

// Bloque: sesión limpia tras STOP o revocación (C-01/C-51). Se conserva solo la marca de QA y la fecha de revocación.
function sesionReiniciada(contacto: ContactoWa, revocadoEn?: string): SesionWa {
  return {
    ...structuredClone(SESION_WA_VACIA),
    v: contacto.sesion?.v,
    ...(contacto.sesion?.simulacionQa ? { simulacionQa: true } : {}),
    ...(revocadoEn ? { consentimientoRevocadoEn: revocadoEn } : {})
  };
}

// Bloque: T01 en 2 mensajes (v1.3): saludo y autorización con botones. Tras STOP (T07) el saludo se reemplaza.
async function enviarBienvenida(contacto: ContactoWa, deps: DependenciasOrquestador, regreso: boolean) {
  await enviarTexto(contacto, deps, regreso ? C.T07_REGRESO : C.T01_SALUDO);
  await enviarBotones(contacto, deps, C.T01_AUTORIZACION, C.BOTONES_CONSENTIMIENTO);
}

async function gestionarConsentimiento(
  contacto: ContactoWa,
  mensaje: MensajeEntrante,
  comando: ReturnType<typeof detectarComando>,
  deps: DependenciasOrquestador,
  ahora: number
): Promise<ResultadoProceso> {
  const respuesta = mensaje.respuestaId || '';
  const plegado = plegarComando(mensaje.texto);
  const dijoSi = respuesta === 'consent:si' || (mensaje.tipo === 'texto' && SI_CONSENTIMIENTO.has(plegado));
  const dijoNo = respuesta === 'consent:no' || (mensaje.tipo === 'texto' && NO_CONSENTIMIENTO.has(plegado));

  if (dijoSi) {
    const parche: ParcheContacto = {
      consentimientoDatos: true,
      consentimientoDatosEn: new Date(ahora).toISOString(),
      consentimientoVersion: C.VERSION_TEXTO_DATOS_V2,
      estado: 'activo',
      sesion: { ...contacto.sesion, recordatorioConsentimiento: false }
    };
    // Con el consentimiento ya se puede vincular el BSUID (si Meta lo mandó) para reconocerlo sin `from`.
    const userIdConsentido = remitenteDe(mensaje).userId;
    if (userIdConsentido && contacto.sesion?.waUserId !== userIdConsentido) {
      parche.sesion = { ...parche.sesion!, waUserId: userIdConsentido };
    }
    const actualizado = await actualizar(contacto, deps, parche);
    await deps.almacen.registrarMensaje(contacto.id, {
      direccion: 'entrante',
      contenido: etiquetaQa(deps, `Autorizo el tratamiento de datos (Ley 1581) · ${C.VERSION_TEXTO_DATOS_V2}.`),
      idMeta: mensaje.id,
      tipo: mensaje.tipo
    });
    await enviarBotones(actualizado, deps, C.T02_ACEPTA, C.BOTONES_MENU);
    return 'respondido';
  }

  if (dijoNo) {
    contacto = await actualizar(contacto, deps, { estado: 'sin_consentimiento' });
    await enviarTexto(contacto, deps, C.T03_NO_ACEPTA);
    return 'respondido';
  }

  // Saludo sin consentimiento (primer «Hola», tras «No acepto» o con versión vieja): T01 completo.
  if (mensaje.tipo === 'texto' && SALUDOS.has(plegado)) {
    await enviarBienvenida(contacto, deps, false);
    return 'respondido';
  }

  if (comando === 'asesor' || respuesta === 'menu:asesor') {
    await enviarBotones(contacto, deps, M.ASESOR_SIN_CONSENTIMIENTO, C.BOTONES_CONSENTIMIENTO);
    return 'respondido';
  }

  // Cualquier otra cosa: no se guarda el texto. Máx 1 recordatorio (T04, C-11); después T03 y no se insiste.
  if (contacto.estado === 'sin_consentimiento' || contacto.sesion.recordatorioConsentimiento) {
    if (contacto.estado !== 'sin_consentimiento') contacto = await actualizar(contacto, deps, { estado: 'sin_consentimiento' });
    await enviarTexto(contacto, deps, C.T03_NO_ACEPTA);
    return 'respondido';
  }
  // Quien aceptó la versión anterior ve T01 v2 completo (C-09); el resto, el recordatorio corto T04.
  contacto = await actualizar(contacto, deps, { sesion: { ...contacto.sesion, recordatorioConsentimiento: true } });
  if (contacto.consentimientoDatos) await enviarBienvenida(contacto, deps, false);
  else await enviarBotones(contacto, deps, C.T04_RECORDATORIO, C.BOTONES_CONSENTIMIENTO);
  return 'respondido';
}

// Bloque: STOP = revocación total (C-01/C-51): solo UPDATE; el contacto y su historial se conservan como evidencia.
async function darDeBaja(contacto: ContactoWa, deps: DependenciasOrquestador, ahora: number): Promise<ResultadoProceso> {
  const fecha = new Date(ahora).toISOString();
  if (contacto.consentimientoDatos) {
    await deps.almacen.registrarMensaje(contacto.id, { direccion: 'entrante', contenido: etiquetaQa(deps, 'STOP'), idMeta: null, tipo: 'texto' });
  }
  const actualizado = await actualizar(contacto, deps, {
    optOut: true,
    optOutEn: fecha,
    estado: 'baja',
    consentimientoDatos: false,
    sesion: sesionReiniciada(contacto, fecha)
  });
  // Única respuesta tras la baja: la confirmación T06 [FIJO]. Luego silencio.
  await enviarTexto({ ...actualizado, optOut: false }, deps, M.BAJA_CONFIRMADA);
  return 'respondido';
}

// Bloque: revocación T05 (C-03/C-51): consentimiento en false, sesión reiniciada (incluido Aplicar), sin DELETE.
async function revocar(contacto: ContactoWa, deps: DependenciasOrquestador, ahora: number): Promise<ResultadoProceso> {
  const fecha = new Date(ahora).toISOString();
  const actualizado = await actualizar(contacto, deps, {
    consentimientoDatos: false,
    estado: 'sin_consentimiento',
    sesion: sesionReiniciada(contacto, fecha)
  });
  await enviarTexto(actualizado, deps, C.T05_REVOCA);
  return 'respondido';
}

// Bloque: T14 asesor una sola vez por sesión (C-20); si ya se avisó, confirma sin crear otro escalamiento.
async function pasarAAsesor(contacto: ContactoWa, deps: DependenciasOrquestador, ahora: number): Promise<ResultadoProceso> {
  if (contacto.sesion.asesorAvisado) {
    await enviarBotones(contacto, deps, C.T14_YA_AVISADO, C.BOTONES_SOLO_BUSCAR);
    return 'respondido';
  }
  const enHorario = enHorarioAsesores(ahora);
  contacto = await actualizar(contacto, deps, {
    estado: 'humano',
    sesion: { ...contacto.sesion, asesorAvisado: true, aplicacion: null, intentosNombre: 0, intentosCorreo: 0 }
  });
  await deps.almacen.registrarEscalamiento(contacto.id, enHorario);
  await enviarTexto(contacto, deps, C.T14_ASESOR);
  return 'respondido';
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

/**
 * Mapea lo que dijo el estudiante a filtros del catálogo. Solo el mensaje actual (C-04): `_previos` se ignora
 * a propósito (se conserva la firma por compatibilidad); «Ver más» y «Seguir» usan los filtros guardados.
 */
export function filtrosDesdeTexto(texto: string, _previos: Record<string, string> = {}): {
  filtros: FiltrosBusquedaWa;
  sesionFiltros: Record<string, string>;
} {
  const { filtros } = filtrosBusqueda(texto);
  const sesionFiltros: Record<string, string> = {};
  if (filtros.programa_o_area) sesionFiltros.intereses = filtros.programa_o_area;
  if (filtros.modalidad) sesionFiltros.modalidad = filtros.modalidad;
  if (filtros.ciudad) sesionFiltros.ciudad = filtros.ciudad;
  if (filtros.nivel_academico) sesionFiltros.nivel = filtros.nivel_academico;
  return { filtros, sesionFiltros };
}

// Bloque: catálogo con tope de tiempo (C-23): si no responde en 5 s o lanza, es error técnico (T13), nunca «0 resultados».
async function buscarConTimeout(
  deps: DependenciasOrquestador,
  filtros: FiltrosBusquedaWa
): Promise<{ ok: true; ofertas: OfertaWa[]; total: number } | { ok: false }> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    const limite = new Promise<{ ok: false }>((resolver) => {
      temporizador = setTimeout(() => resolver({ ok: false }), TIMEOUT_CATALOGO_MS);
    });
    const r = await Promise.race([deps.catalogo.buscar(filtros, MAX_PROGRAMAS_CONSULTA), limite]);
    if (!r.ok) {
      deps.log?.('wa_catalogo_error');
      return { ok: false };
    }
    return { ok: true, ofertas: r.ofertas, total: Math.max(r.total ?? r.ofertas.length, r.ofertas.length) };
  } catch (error) {
    deps.log?.('wa_catalogo_error', { error: error instanceof Error ? error.name : 'desconocido' });
    return { ok: false };
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

function listaVigente(contacto: ContactoWa, ahora: number): OfertaWa[] {
  const s = contacto.sesion;
  if (!s.listaEn || ahora - s.listaEn > VIGENCIA_LISTA_MS) return [];
  return s.ofertas || [];
}

/**
 * Busca y muestra UNA lista interactiva (C-07). Origen: texto nuevo (filtros solo de ese texto) o
 * filtros guardados (Ver más / Seguir / Reintentar). 0 resultados → T11 sin pisar la lista anterior (C-18);
 * error → T13 (C-13). Nunca se manda el bloque largo de 8 fichas con URLs.
 */
async function buscarYMostrar(
  contacto: ContactoWa,
  deps: DependenciasOrquestador,
  ahora: number,
  origen: { texto: string } | { filtros: FiltrosBusquedaWa; etiqueta: string; pagina: number }
): Promise<ResultadoProceso> {
  let filtros: FiltrosBusquedaWa;
  let etiqueta: string;
  let pagina = 0;
  if ('texto' in origen) {
    const r = filtrosBusqueda(origen.texto);
    filtros = r.filtros;
    etiqueta = r.etiqueta;
  } else {
    filtros = origen.filtros;
    etiqueta = origen.etiqueta;
    pagina = origen.pagina;
  }
  if (filtrosVacios(filtros)) return noEntendi(contacto, deps);

  const resultado = await buscarConTimeout(deps, filtros);
  if (!resultado.ok) {
    // Se guarda la consulta para que [Reintentar] la repita tal cual.
    contacto = await actualizar(contacto, deps, { sesion: { ...contacto.sesion, filtrosBusqueda: filtros, consulta: etiqueta, pagina } });
    await enviarBotones(contacto, deps, C.T13_ERROR, C.BOTONES_ERROR);
    return 'respondido';
  }

  const desde = pagina * PROGRAMAS_POR_PAGINA;
  const pag = resultado.ofertas.slice(desde, desde + PROGRAMAS_POR_PAGINA);
  if (pag.length === 0) {
    await enviarBotones(contacto, deps, C.t11SinResultados(etiqueta), C.BOTONES_NUEVA_O_ASESOR);
    return 'respondido';
  }

  // Bloque: la lista nueva vale 24 h; las fichas de listas anteriores se conservan (máx 24) para toques tardíos.
  const recientes = [...pag, ...(contacto.sesion.ofertasRecientes || []).filter((o) => !pag.some((p) => p.id === o.id))].slice(0, 24);
  const sesion: SesionWa = {
    ...contacto.sesion,
    filtros: {},
    filtrosBusqueda: filtros,
    consulta: etiqueta,
    ofertas: pag,
    ofertasRecientes: recientes,
    listaEn: ahora,
    pagina,
    total: resultado.total,
    aplicacion: null
  };
  contacto = await actualizar(contacto, deps, { sesion });
  await enviarListaResultados(contacto, deps, pag, resultado.total, pagina, etiqueta);
  return 'respondido';
}

// Bloque: envía la lista armada por presentacion.ts (FE). Si Meta la rechaza, texto corto top 3 ≤600 (C-39).
async function enviarListaResultados(
  contacto: ContactoWa,
  deps: DependenciasOrquestador,
  pag: OfertaWa[],
  total: number,
  pagina: number,
  etiqueta: string
) {
  const agrupadas = pag.map(aAgrupada);
  const armado = armarResultados(agrupadas, total, pagina, etiqueta);
  const r = await enviarLista(contacto, deps, {
    cuerpo: armado.cuerpo,
    textoBoton: armado.botonTexto,
    tituloSeccion: armado.seccion,
    filas: armado.filas,
    ...(armado.pie ? { pie: armado.pie } : {})
  });
  if (r === 'fallo') await enviarTexto(contacto, deps, textoRespaldoResultados(agrupadas, total, pagina));
}

/** Respaldo si la lista interactiva falla: top 3, sin URLs, ≤600 caracteres (C-39). */
export function textoRespaldoResultados(ofertas: OfertaAgrupadaWa[], total: number, pagina: number): string {
  const desde = pagina * PROGRAMAS_POR_PAGINA;
  const lineas = ofertas.slice(0, 3).map((o, i) => {
    const lugar = o.ciudades.length > 1 ? `${o.ciudades[0]} +${o.ciudades.length - 1} ciudades` : o.ciudades[0] || '';
    return `${desde + i + 1}. *${o.nombre.slice(0, 80)}*\n${[o.universidad, o.modalidad, lugar].filter(Boolean).join(' · ').slice(0, 72)}`;
  });
  const mas = total > desde + 3 ? ' o escribe *más*' : '';
  return `Encontré ${total} programas vigentes:\n${lineas.join('\n')}\nEscribe el número para ver la ficha${mas}.`.slice(0, 600);
}

function aAgrupada(o: OfertaWa): OfertaAgrupadaWa {
  return { ...o, programa_id: o.programa_id || o.id, ciudades: o.ciudades?.length ? o.ciudades : o.ciudad ? [o.ciudad] : [] };
}

// Bloque: «Ver más» = siguiente página de la MISMA consulta (orden estable en BD).
async function verMas(contacto: ContactoWa, deps: DependenciasOrquestador, ahora: number): Promise<ResultadoProceso> {
  const s = contacto.sesion;
  if (!s.filtrosBusqueda || !s.consulta) {
    await enviarBotones(contacto, deps, C.T02_PEDIR, C.BOTONES_MENU);
    return 'respondido';
  }
  const siguiente = (s.pagina || 0) + 1;
  if (s.total !== undefined && siguiente * PROGRAMAS_POR_PAGINA >= s.total) {
    await enviarBotones(contacto, deps, C.T18_YA_NO_ESTA, C.BOTONES_NUEVA_O_ASESOR);
    return 'respondido';
  }
  return buscarYMostrar(contacto, deps, ahora, { filtros: s.filtrosBusqueda, etiqueta: s.consulta, pagina: siguiente });
}

// Bloque: «Seguir» / «Ver otros»: reenvía la lista vigente (<24 h) o la vuelve a buscar con los filtros guardados.
async function reenviarLista(contacto: ContactoWa, deps: DependenciasOrquestador, ahora: number): Promise<ResultadoProceso> {
  const s = contacto.sesion;
  const lista = listaVigente(contacto, ahora);
  if (lista.length > 0) {
    await enviarListaResultados(contacto, deps, lista, s.total ?? lista.length, s.pagina || 0, s.consulta || '');
    return 'respondido';
  }
  if (s.filtrosBusqueda && s.consulta) {
    return buscarYMostrar(contacto, deps, ahora, { filtros: s.filtrosBusqueda, etiqueta: s.consulta, pagina: 0 });
  }
  await enviarBotones(contacto, deps, C.T02_PEDIR, C.BOTONES_MENU);
  return 'respondido';
}

// Bloque: «1/2/3…» abre la ficha con ese número de la lista vigente (C-17); fuera de rango o vencida → T18.
async function elegirPorNumero(contacto: ContactoWa, numero: number, deps: DependenciasOrquestador, ahora: number): Promise<ResultadoProceso> {
  const lista = listaVigente(contacto, ahora);
  const indice = numero - 1 - (contacto.sesion.pagina || 0) * PROGRAMAS_POR_PAGINA;
  const oferta = lista[indice];
  if (!oferta) {
    await enviarBotones(contacto, deps, C.T18_YA_NO_ESTA, C.BOTONES_NUEVA_O_ASESOR);
    return 'respondido';
  }
  return mostrarFicha(contacto, oferta, deps);
}

async function mostrarFicha(contacto: ContactoWa, oferta: OfertaWa, deps: DependenciasOrquestador): Promise<ResultadoProceso> {
  const ficha = armarFicha(aAgrupada(oferta));
  await enviarBotones(contacto, deps, ficha.cuerpo, ficha.botones);
  return 'respondido';
}

// ---------------------------------------------------------------------------
// Mi lista / Aplicar / Autorizar contacto
// ---------------------------------------------------------------------------

// Bloque: busca la ficha en la lista actual o en listas recientes (<24 h), para que un toque tardío funcione (C-18).
function ofertaDeSesion(contacto: ContactoWa, ofertaId: string, ahora: number): OfertaWa | null {
  const s = contacto.sesion;
  const enActual = (s.ofertas || []).find((o) => o.id === ofertaId);
  if (enActual) return enActual;
  if (!s.listaEn || ahora - s.listaEn > VIGENCIA_LISTA_MS) return null;
  return (s.ofertasRecientes || []).find((o) => o.id === ofertaId) || null;
}

async function gestionarRespuestaInteractiva(
  contacto: ContactoWa,
  respuestaId: string,
  deps: DependenciasOrquestador,
  ahora: number
): Promise<ResultadoProceso> {
  const [accion, ofertaId = ''] = respuestaId.split(':');

  if (accion === 'consent') {
    // Ya hay consentimiento: un toque repetido no cambia nada.
    await enviarBotones(contacto, deps, C.T02_PEDIR, C.BOTONES_MENU);
    return 'respondido';
  }

  // Bloque: botones de menú del flujo (copy.ts).
  if (accion === 'menu') {
    switch (ofertaId) {
      case 'asesor':
        return pasarAAsesor(contacto, deps, ahora);
      case 'becas':
        return responderBecas(contacto, deps, ahora);
      case 'mas':
        return verMas(contacto, deps, ahora);
      case 'seguir':
      case 'volver':
        return reenviarLista(contacto, deps, ahora);
      case 'reintentar': {
        const s = contacto.sesion;
        if (s.filtrosBusqueda && s.consulta) {
          return buscarYMostrar(contacto, deps, ahora, { filtros: s.filtrosBusqueda, etiqueta: s.consulta, pagina: s.pagina || 0 });
        }
        break;
      }
      case 'nueva':
        contacto = await actualizar(contacto, deps, { sesion: { ...contacto.sesion, filtros: {}, aplicacion: null } });
        break;
      default:
        break;
    }
    await enviarBotones(contacto, deps, C.T02_PEDIR, C.BOTONES_MENU);
    return 'respondido';
  }

  const oferta = ofertaId ? ofertaDeSesion(contacto, ofertaId, ahora) : null;
  if (!oferta) {
    await enviarBotones(contacto, deps, C.T18_YA_NO_ESTA, C.BOTONES_NUEVA_O_ASESOR);
    return 'respondido';
  }

  if (accion === 'oferta') return mostrarFicha(contacto, oferta, deps);

  if (accion === 'lista') {
    // Mi lista: no inicia aplicación ni autoriza contacto (BA-031, R2).
    const miLista = Array.from(new Set([...(contacto.sesion.miLista || []), oferta.id])).slice(-20);
    contacto = await actualizar(contacto, deps, { sesion: { ...contacto.sesion, miLista } });
    await enviarTexto(contacto, deps, C.t09bGuardado(oferta.nombre));
    return 'respondido';
  }

  if (accion === 'aplicar') {
    contacto = await actualizar(contacto, deps, {
      sesion: {
        ...contacto.sesion,
        intentosNombre: 0,
        intentosCorreo: 0,
        aplicacion: { ofertaId: oferta.id, ofertaNombre: oferta.nombre, universidad: oferta.universidad, paso: 'datos_nombre' }
      }
    });
    await enviarTexto(contacto, deps, C.t19Aplicar(oferta.nombre, oferta.universidad));
    return 'respondido';
  }

  if (accion === 'autorizar' || accion === 'noautorizar') {
    return resolverAutorizacion(contacto, oferta, accion === 'autorizar', deps);
  }

  await enviarBotones(contacto, deps, C.T02_PEDIR, C.BOTONES_MENU);
  return 'respondido';
}

/**
 * Nombre válido (T20): 2+ palabras de letras (tildes, ñ, ü), con guion o apóstrofo (' ’) internos; sin números.
 * Acepta «Ana María Gómez-Ruiz», «D'Angelo Pérez», «QA-WA Prueba Jota».
 */
export const PATRON_NOMBRE = /^(?=.{3,120}$)[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:['’-][A-Za-zÁÉÍÓÚáéíóúÑñÜü]+)*(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+(?:['’-][A-Za-zÁÉÍÓÚáéíóúÑñÜü]+)*)+$/;
const PATRON_CORREO = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const MAX_INTENTOS = 3;

async function capturarDatosAplicacion(
  contacto: ContactoWa,
  texto: string,
  deps: DependenciasOrquestador,
  ahora: number
): Promise<ResultadoProceso> {
  const aplicacion = contacto.sesion.aplicacion!;
  // Regla BA-031: solo se guardan datos en pasos abiertos de una aplicación.
  const guardado = evaluarGuardadoDatos('datos');
  if (guardado.ok === false) {
    await enviarTexto(contacto, deps, guardado.mensaje);
    return 'respondido';
  }

  if (aplicacion.paso === 'datos_nombre') {
    const nombre = texto.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!PATRON_NOMBRE.test(nombre)) {
      // Bloque: contador de intentos T20; al 3.º pasa a asesor (T14).
      const intentos = (contacto.sesion.intentosNombre || 0) + 1;
      if (intentos >= MAX_INTENTOS) return pasarAAsesor(contacto, deps, ahora);
      contacto = await actualizar(contacto, deps, { sesion: { ...contacto.sesion, intentosNombre: intentos } });
      await enviarTexto(contacto, deps, intentos === 1 ? C.T20_NOMBRE_1 : C.T20_NOMBRE_2);
      return 'respondido';
    }
    contacto = await actualizar(contacto, deps, {
      sesion: { ...contacto.sesion, intentosNombre: 0, aplicacion: { ...aplicacion, nombreCompleto: nombre, paso: 'datos_correo' } }
    });
    await enviarTexto(contacto, deps, C.t21PedirCorreo(nombre.split(' ')[0]));
    return 'respondido';
  }

  // datos_correo (OMITIR se mantiene, v1.2).
  const limpio = texto.trim();
  let correo: string | null = null;
  if (plegarComando(limpio) !== 'omitir') {
    if (!PATRON_CORREO.test(limpio)) {
      const intentos = (contacto.sesion.intentosCorreo || 0) + 1;
      if (intentos >= MAX_INTENTOS) return pasarAAsesor(contacto, deps, ahora);
      contacto = await actualizar(contacto, deps, { sesion: { ...contacto.sesion, intentosCorreo: intentos } });
      await enviarTexto(contacto, deps, C.T21_CORREO_INVALIDO);
      return 'respondido';
    }
    correo = limpio.toLowerCase();
  }
  contacto = await actualizar(contacto, deps, {
    sesion: { ...contacto.sesion, intentosCorreo: 0, aplicacion: { ...aplicacion, correo, paso: 'consentimiento' } }
  });
  await enviarBotones(contacto, deps, C.t22Autorizar(aplicacion.universidad, aplicacion.ofertaNombre), C.botonesAutorizarContacto(aplicacion.ofertaId));
  return 'respondido';
}

async function resolverAutorizacion(
  contacto: ContactoWa,
  oferta: OfertaWa,
  autoriza: boolean,
  deps: DependenciasOrquestador
): Promise<ResultadoProceso> {
  const aplicacion = contacto.sesion.aplicacion;
  // El botón solo vale para la aplicación en curso de ESA oferta y en el paso de consentimiento.
  if (!aplicacion || aplicacion.ofertaId !== oferta.id || aplicacion.paso !== 'consentimiento' || !aplicacion.nombreCompleto) {
    await enviarBotones(contacto, deps, C.T18_YA_NO_ESTA, C.BOTONES_NUEVA_O_ASESOR);
    return 'respondido';
  }

  const sesionLimpia: SesionWa = { ...contacto.sesion, aplicacion: null };
  const base = {
    contactoId: contacto.id,
    ofertaId: oferta.id,
    ofertaNombre: oferta.nombre,
    nombreCompleto: aplicacion.nombreCompleto,
    correo: aplicacion.correo ?? null,
    // Simulación de preview: la intención queda marcada como dato de QA (C-56).
    ...(deps.config.simulacion ? { motivo: 'qa_simulacion' } : {})
  };

  if (!autoriza) {
    await deps.almacen.registrarIntencion({ ...base, paso: 'rechazada', consentimientos: [] });
    contacto = await actualizar(contacto, deps, { sesion: sesionLimpia });
    await enviarTexto(contacto, deps, C.T22_NO);
    return 'respondido';
  }

  // Autorización explícita y por oferta: tratamiento de datos (dado al inicio) + contacto + transferencia.
  const tipos = await deps.catalogo.tiposConsentimiento();
  const declarados = [
    { codigo: 'tratamiento_datos', otorgado: true },
    { codigo: 'contacto', otorgado: true },
    { codigo: 'contacto_whatsapp', otorgado: true },
    { codigo: 'transferencia_universidad', otorgado: true }
  ];
  const evaluacion = evaluarDecision({
    paso: 'consentimiento',
    decision: 'aceptar',
    modeloNegocio: null,
    tipos,
    declarados
  });
  if (evaluacion.ok === false || evaluacion.cierre !== 'aceptada') {
    contacto = await actualizar(contacto, deps, { sesion: sesionLimpia });
    await enviarTexto(contacto, deps, evaluacion.ok === false ? evaluacion.mensaje : C.T22_NO);
    return 'respondido';
  }

  const consentimientos = evaluacion.consentimientos.map((c) => ({
    codigo: c.codigo,
    otorgado: c.otorgado,
    version_texto: c.versionTexto
  }));

  // Interruptor de conversión apagado (por defecto, y siempre en simulación): se registra, NO se crea oportunidad.
  if (!deps.config.leadConversionHabilitada || deps.config.simulacion) {
    await deps.almacen.registrarIntencion({ ...base, paso: 'consentimiento_registrado', consentimientos });
    contacto = await actualizar(contacto, deps, { sesion: sesionLimpia });
    await enviarBotones(contacto, deps, C.T23_PILOTO, C.BOTONES_NUEVA_O_ASESOR);
    return 'respondido';
  }

  // Conversión real (fn_ba031_convertir_si_consentido): atómica; si falla no queda lead a medias.
  const partes = aplicacion.nombreCompleto.split(' ');
  const resultado = await deps.conversor.convertir(
    {
      consentimiento_aceptado: true,
      clave_idempotencia: `wa:${contacto.id}:${oferta.id}`,
      celular_e164: contacto.e164,
      // Null-safe: si algún día hay contactos sin teléfono (propuesta BD), no debe lanzar TypeError.
      pais_celular: (contacto.e164 || '').startsWith('+57') ? 'CO' : null,
      nombres: partes[0],
      apellidos: partes.slice(1).join(' '),
      nombre_completo: aplicacion.nombreCompleto,
      correo: aplicacion.correo ?? null,
      visitante_id: null,
      oferta_id: oferta.id,
      ip_origen: null,
      canal_origen: 'whatsapp',
      consentimientos
    },
    { contactoId: contacto.id }
  );

  contacto = await actualizar(contacto, deps, { sesion: sesionLimpia });
  if (resultado.ok === true) {
    await deps.almacen.registrarIntencion({
      ...base,
      paso: 'lead_creado',
      consentimientos,
      oportunidadId: resultado.oportunidadId,
      personaId: resultado.personaId
    });
    // T23b solo tras envío exitoso (sin «Te escribirán pronto»).
    await enviarBotones(contacto, deps, C.t23bEnviada(oferta.universidad), C.BOTONES_NUEVA_O_ASESOR);
  } else {
    // Falla el envío → T23 + aviso al equipo (log enmascarado con el código, sin datos personales).
    await deps.almacen.registrarIntencion({ ...base, paso: 'error_conversion', consentimientos, motivo: resultado.codigo });
    deps.log?.('wa_conversion_fallida_aviso_equipo', { codigo: resultado.codigo });
    await enviarBotones(contacto, deps, C.T23_PILOTO, C.BOTONES_NUEVA_O_ASESOR);
  }
  return 'respondido';
}

// ---------------------------------------------------------------------------
// Envío seguro: ventana 24 h + opt-out + historial (solo con consentimiento)
// ---------------------------------------------------------------------------

// Bloque: en simulación de preview, el historial se marca con prefijo QA (BD compartida con producción, C-56).
function etiquetaQa(deps: DependenciasOrquestador, contenido: string): string {
  return deps.config.simulacion ? `[QA-SIM] ${contenido}` : contenido;
}

/**
 * Bloque: escribe el parche y devuelve el contacto actualizado.
 * Si el parche trae `sesion`, se sube `sesion.v` y se escribe solo si nadie la cambió (control optimista, C-25).
 */
async function actualizar(contacto: ContactoWa, deps: DependenciasOrquestador, parche: ParcheContacto): Promise<ContactoWa> {
  if (!parche.sesion) {
    await deps.almacen.actualizarContacto(contacto.id, parche);
    return { ...contacto, ...parche };
  }
  const previa = deps._versiones?.get(contacto.id) ?? contacto.sesion?.v ?? 0;
  const sesion: SesionWa = { ...parche.sesion, v: previa + 1 };
  const ok = await deps.almacen.actualizarContacto(contacto.id, { ...parche, sesion }, { versionSesion: previa });
  if (ok === false) throw new ConflictoSesion();
  deps._versiones?.set(contacto.id, previa + 1);
  return { ...contacto, ...parche, sesion };
}

function puedeEscribirle(contacto: ContactoWa, deps: DependenciasOrquestador): boolean {
  const ahora = deps.ahora ? deps.ahora() : Date.now();
  if (contacto.optOut) return false;
  return dentroDeVentana24h(contacto.ultimoEntranteMs, ahora);
}

async function trasEnvio(contacto: ContactoWa, deps: DependenciasOrquestador, contenido: string, idMeta: string | null) {
  if (!contacto.consentimientoDatos) return;
  await deps.almacen.registrarMensaje(contacto.id, { direccion: 'saliente', contenido: etiquetaQa(deps, contenido), idMeta, tipo: 'texto' });
}

type DesenlaceEnvio = 'ok' | 'bloqueado' | 'fallo';

async function envolver(
  contacto: ContactoWa,
  deps: DependenciasOrquestador,
  contenido: string,
  enviar: () => Promise<{ idMensaje: string | null }>
): Promise<DesenlaceEnvio> {
  if (!puedeEscribirle(contacto, deps)) {
    deps.log?.('wa_envio_bloqueado_ventana_o_baja', { numero: enmascarar(contacto.e164) });
    return 'bloqueado';
  }
  try {
    const r = await enviar();
    // Hora de envío al ms relativa al inicio del mensaje (C-53).
    deps.log?.('QA_wa_envio', { numero: enmascarar(contacto.e164), msDesdeInicio: Date.now() - (deps._inicioMs || Date.now()) });
    await trasEnvio(contacto, deps, contenido, r.idMensaje);
    return 'ok';
  } catch (error) {
    if (error instanceof WhatsAppApiError) {
      deps.log?.('wa_envio_fallido', { status: error.status, codigoMeta: error.codigoMeta, tipo: error.tipo });
      return 'fallo';
    }
    throw error;
  }
}

function enviarTexto(contacto: ContactoWa, deps: DependenciasOrquestador, texto: string) {
  return envolver(contacto, deps, texto, () => deps.enviador.enviarTexto(contacto.e164, texto));
}

function enviarBotones(contacto: ContactoWa, deps: DependenciasOrquestador, cuerpo: string, botones: BotonRespuesta[]) {
  return envolver(contacto, deps, cuerpo, () => deps.enviador.enviarBotones(contacto.e164, { cuerpo, botones }));
}

function enviarLista(
  contacto: ContactoWa,
  deps: DependenciasOrquestador,
  input: { cuerpo: string; textoBoton: string; tituloSeccion: string; filas: FilaLista[]; pie?: string }
) {
  return envolver(contacto, deps, input.cuerpo, () => deps.enviador.enviarLista(contacto.e164, input));
}

export { SESION_WA_VACIA };
