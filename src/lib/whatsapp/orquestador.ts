/**
 * BA-032 · Orquestador de conversación de WhatsApp real.
 *
 * Aplica los criterios de Producto en este orden por cada mensaje entrante:
 *   0. el mensaje es para nuestro phone_number_id
 *   1. piloto cerrado / apertura pública (allowlist WA_PILOTO_NUMEROS o WA_REAL_HABILITADO)
 *   2. idempotencia por id de mensaje (wamid)
 *   3. ventana de 24 h (solo respondemos mensajes recientes)
 *   4. límite por número (rate limit)
 *   5. BAJA/STOP/ALTA, consentimiento de datos (Ley 1581), ASESOR/MENU
 *   6. catálogo (máx 8 fichas reales) → Mi lista | Aplicar → datos → Autorizar contacto
 *   7. conversión a lead solo con WA_LEAD_CONVERSION_ENABLED='true' y autorización explícita
 *
 * Reutiliza: extracción de intereses de NaIA (vozNaia) y reglas del funnel BA-031
 * (evaluarDecision / evaluarGuardadoDatos). No escribe directo en la base: usa interfaces.
 */

import { extraerSlotsDeclarados, fusionarSesion, sanearSesion } from '../../../lib/agentes/vozNaia';
import { evaluarDecision, evaluarGuardadoDatos } from '../demowapp/funnel-aplicar-reglas';
import { detectarComando, enHorarioAsesores, plegarComando } from './comandos';
import type { ConfigWhatsApp } from './config';
import { puedeEnviar, remitentePuedeRecibirRespuesta } from './config';
import type { BotonRespuesta, EnviadorWhatsApp, FilaLista } from './graph-client';
import { destinoRemitente, MAX_FILAS_LISTA_BUSCOEDU, WhatsAppApiError } from './graph-client';
import * as M from './mensajes';
import type { LimitadorTasa } from './rate-limit';
import type {
  AlmacenWhatsApp,
  CatalogoWa,
  ContactoWa,
  ConversorLeadsWa,
  FiltrosBusquedaWa,
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
}

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

// Bloque: palabras que cuentan como sí/no al consentimiento cuando se escriben en vez de tocar el botón.
const SI_CONSENTIMIENTO = new Set(['si', 'si autorizo', 'autorizo', 'acepto', 'de acuerdo', 'ok', 'dale', 'listo']);
const NO_CONSENTIMIENTO = new Set(['no', 'no autorizo', 'no acepto']);
const SALUDOS = new Set(['hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'holi', 'info', 'informacion']);

const BOTONES_CONSENTIMIENTO: BotonRespuesta[] = [
  { id: 'consent:si', titulo: 'Sí, autorizo' },
  { id: 'consent:no', titulo: 'No autorizo' }
];

export async function procesarMensajeEntrante(
  mensaje: MensajeEntrante,
  deps: DependenciasOrquestador
): Promise<ResultadoProceso> {
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

  try {
    return await atender(mensaje, deps, ahora, log);
  } catch (error) {
    // 7) Error inesperado: mensaje honesto + link. Nada de lead a medias (la conversión es atómica en SQL).
    log('wa_error_orquestador', { error: error instanceof Error ? error.message.slice(0, 200) : 'desconocido' });
    try {
      await deps.enviador.enviarTexto(destinoRemitente(remitenteDe(mensaje)), M.ERROR_HONESTO);
    } catch {
      // Si la API de Meta también está caída no hay nada más que hacer en este turno.
    }
    return 'error';
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

  // Bloque: contacto. Si es nuevo, se guarda SOLO el número y la hora del último entrante.
  let contacto = await almacen.obtenerContacto(mensaje.e164);
  if (!contacto) {
    contacto = await almacen.crearContactoSoloNumero(mensaje.e164, mensaje.timestampMs);
    contacto = await vincularUserIdSiCorresponde(contacto, mensaje, deps);
    if (comando === 'baja') return darDeBaja(contacto, deps, ahora);
    await enviarBotones(contacto, deps, M.BIENVENIDA_CONSENTIMIENTO, BOTONES_CONSENTIMIENTO);
    return 'respondido';
  }

  contacto = await vincularUserIdSiCorresponde(contacto, mensaje, deps);
  const ultimo = Math.max(contacto.ultimoEntranteMs || 0, mensaje.timestampMs);
  await almacen.actualizarContacto(contacto.id, { ultimoEntranteMs: ultimo });
  contacto = { ...contacto, ultimoEntranteMs: ultimo };

  // Bloque: BAJA / ALTA. Una baja silencia todo salvo ALTA.
  if (comando === 'baja') return darDeBaja(contacto, deps, ahora);
  if (contacto.optOut || contacto.estado === 'baja') {
    if (comando !== 'alta') {
      log('wa_silencio_baja');
      return 'silencio_baja';
    }
    const estado = contacto.consentimientoDatos ? 'activo' : 'esperando_consentimiento';
    await actualizar(contacto, deps, { optOut: false, optOutEn: null, estado });
    contacto = { ...contacto, optOut: false, estado };
    if (estado === 'activo') {
      await enviarTexto(contacto, deps, M.VOLVER_MENU);
    } else {
      await enviarBotones(contacto, deps, M.BIENVENIDA_CONSENTIMIENTO, BOTONES_CONSENTIMIENTO);
    }
    return 'respondido';
  }

  // Bloque: consentimiento de datos (Ley 1581). Sin OK no se guarda más que el número.
  if (!contacto.consentimientoDatos) {
    return gestionarConsentimiento(contacto, mensaje, comando, deps, ahora);
  }

  // Desde aquí hay consentimiento: el historial sí se guarda.
  await almacen.registrarMensaje(contacto.id, {
    direccion: 'entrante',
    contenido: mensaje.texto || `[${mensaje.tipo}]`,
    idMeta: mensaje.id,
    tipo: mensaje.tipo
  });

  // Bloque: modo asesor. NaIA no responde hasta que el usuario escriba MENU.
  if (contacto.estado === 'humano') {
    if (comando === 'menu') {
      await actualizar(contacto, deps, { estado: 'activo' });
      await enviarTexto({ ...contacto, estado: 'activo' }, deps, M.VOLVER_MENU);
      return 'respondido';
    }
    log('wa_silencio_humano');
    return 'silencio_humano';
  }

  if (comando === 'asesor') {
    const enHorario = enHorarioAsesores(ahora);
    await actualizar(contacto, deps, { estado: 'humano' });
    await almacen.registrarEscalamiento(contacto.id, enHorario);
    await enviarTexto({ ...contacto, estado: 'humano' }, deps, M.textoAsesor(enHorario));
    return 'respondido';
  }

  if (comando === 'menu' || comando === 'alta') {
    await enviarTexto(contacto, deps, M.VOLVER_MENU);
    return 'respondido';
  }

  // Bloque: respuestas a botones y listas.
  if ((mensaje.tipo === 'lista' || mensaje.tipo === 'boton') && mensaje.respuestaId) {
    return gestionarRespuestaInteractiva(contacto, mensaje.respuestaId, deps);
  }

  if (mensaje.tipo !== 'texto' || !mensaje.texto) {
    await enviarTexto(contacto, deps, M.TIPO_NO_SOPORTADO);
    return 'respondido';
  }

  // Bloque: aplicación en curso esperando datos escritos.
  const aplicacion = contacto.sesion.aplicacion;
  if (aplicacion && (aplicacion.paso === 'datos_nombre' || aplicacion.paso === 'datos_correo')) {
    return capturarDatosAplicacion(contacto, mensaje.texto, deps);
  }

  return buscarYMostrar(contacto, mensaje.texto, deps);
}

// ---------------------------------------------------------------------------
// Consentimiento
// ---------------------------------------------------------------------------

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
      consentimientoVersion: M.VERSION_TEXTO_DATOS,
      estado: 'activo'
    };
    // Con el consentimiento ya se puede vincular el BSUID (si Meta lo mandó) para reconocerlo sin `from`.
    const userIdConsentido = remitenteDe(mensaje).userId;
    if (userIdConsentido && contacto.sesion?.waUserId !== userIdConsentido) {
      parche.sesion = { ...contacto.sesion, waUserId: userIdConsentido };
    }
    await actualizar(contacto, deps, parche);
    const actualizado = { ...contacto, ...parche } as ContactoWa;
    await deps.almacen.registrarMensaje(contacto.id, {
      direccion: 'entrante',
      contenido: 'Autorizo el tratamiento de datos (Ley 1581).',
      idMeta: mensaje.id,
      tipo: mensaje.tipo
    });
    await enviarTexto(actualizado, deps, M.CONSENTIMIENTO_OK);
    return 'respondido';
  }

  if (dijoNo) {
    await actualizar(contacto, deps, { estado: 'sin_consentimiento' });
    await enviarTexto(contacto, deps, M.SIN_CONSENTIMIENTO);
    return 'respondido';
  }

  if (comando === 'asesor') {
    await enviarBotones(contacto, deps, M.ASESOR_SIN_CONSENTIMIENTO, BOTONES_CONSENTIMIENTO);
    return 'respondido';
  }

  // Cualquier otra cosa: no se guarda el texto; se vuelve a pedir la autorización.
  if (contacto.estado === 'sin_consentimiento') {
    await enviarTexto(contacto, deps, M.SIN_CONSENTIMIENTO);
  } else {
    await enviarBotones(contacto, deps, M.RECORDATORIO_CONSENTIMIENTO, BOTONES_CONSENTIMIENTO);
  }
  return 'respondido';
}

async function darDeBaja(contacto: ContactoWa, deps: DependenciasOrquestador, ahora: number): Promise<ResultadoProceso> {
  await deps.almacen.actualizarContacto(contacto.id, {
    optOut: true,
    optOutEn: new Date(ahora).toISOString(),
    estado: 'baja'
  });
  // Única respuesta tras la baja: la confirmación. Luego silencio.
  await enviarTexto({ ...contacto, optOut: false }, deps, M.BAJA_CONFIRMADA);
  return 'respondido';
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

/** Mapea lo que dijo el estudiante a filtros del catálogo (misma semántica que filtrosDesdeSesion de Demo WApp). */
export function filtrosDesdeTexto(texto: string, previos: Record<string, string>): {
  filtros: FiltrosBusquedaWa;
  sesionFiltros: Record<string, string>;
} {
  const declarados = extraerSlotsDeclarados(texto);
  const plegado = plegarComando(texto);
  // Si no hubo frase tipo "quiero estudiar X", el texto corto completo se toma como área/programa.
  if (!declarados.intereses && !SALUDOS.has(plegado) && plegado.length >= 3 && plegado.split(' ').length <= 6) {
    const sinCiudadNiModalidad = !declarados.ciudad && !declarados.modalidad && !declarados.nivel;
    if (sinCiudadNiModalidad) declarados.intereses = texto.trim().slice(0, 60);
  }
  const sesion = sanearSesion(fusionarSesion(sanearSesion(previos), declarados)) as Record<string, string>;
  const filtros: FiltrosBusquedaWa = {};
  if (sesion.intereses) filtros.programa_o_area = sesion.intereses;
  if (sesion.modalidad && sesion.modalidad !== 'virtual o presencial') filtros.modalidad = sesion.modalidad;
  if (sesion.ciudad) filtros.ciudad = sesion.ciudad;
  if (sesion.nivel) filtros.nivel_academico = sesion.nivel;
  const sesionFiltros: Record<string, string> = {};
  for (const clave of ['intereses', 'modalidad', 'ciudad', 'nivel']) {
    if (sesion[clave]) sesionFiltros[clave] = sesion[clave];
  }
  return { filtros, sesionFiltros };
}

async function buscarYMostrar(contacto: ContactoWa, texto: string, deps: DependenciasOrquestador): Promise<ResultadoProceso> {
  const { filtros, sesionFiltros } = filtrosDesdeTexto(texto, contacto.sesion.filtros || {});
  if (!filtros.programa_o_area && !filtros.ciudad && !filtros.modalidad && !filtros.nivel_academico) {
    await enviarTexto(contacto, deps, M.PEDIR_INTERES);
    return 'respondido';
  }

  const resultado = await deps.catalogo.buscar(filtros, MAX_FILAS_LISTA_BUSCOEDU);
  if (!resultado.ok) {
    await enviarTexto(contacto, deps, M.ERROR_HONESTO);
    return 'respondido';
  }

  // NaIA solo muestra lo que devolvió el catálogo, máximo 8 fichas.
  const ofertas = resultado.ofertas.slice(0, MAX_FILAS_LISTA_BUSCOEDU);
  const sesion: SesionWa = { ...contacto.sesion, filtros: sesionFiltros, ofertas, aplicacion: null };
  await actualizar(contacto, deps, { sesion });
  const conSesion = { ...contacto, sesion };

  if (ofertas.length === 0) {
    await enviarTexto(conSesion, deps, M.SIN_RESULTADOS);
    return 'respondido';
  }

  await enviarTexto(conSesion, deps, M.textoResultados(ofertas));
  const filas: FilaLista[] = ofertas.map((o) => ({
    id: `oferta:${o.id}`,
    titulo: o.nombre,
    descripcion: [o.universidad, o.modalidad].filter(Boolean).join(' · ')
  }));
  await enviarLista(conSesion, deps, { cuerpo: M.CUERPO_LISTA, textoBoton: 'Ver fichas', tituloSeccion: 'Programas vigentes', filas });
  return 'respondido';
}

// ---------------------------------------------------------------------------
// Mi lista / Aplicar / Autorizar contacto
// ---------------------------------------------------------------------------

function ofertaDeSesion(contacto: ContactoWa, ofertaId: string): OfertaWa | null {
  return contacto.sesion.ofertas.find((o) => o.id === ofertaId) || null;
}

async function gestionarRespuestaInteractiva(
  contacto: ContactoWa,
  respuestaId: string,
  deps: DependenciasOrquestador
): Promise<ResultadoProceso> {
  const [accion, ofertaId = ''] = respuestaId.split(':');

  if (accion === 'consent') {
    // Ya hay consentimiento: un toque repetido no cambia nada.
    await enviarTexto(contacto, deps, M.PEDIR_INTERES);
    return 'respondido';
  }

  const oferta = ofertaId ? ofertaDeSesion(contacto, ofertaId) : null;
  if (!oferta) {
    await enviarTexto(contacto, deps, M.OFERTA_YA_NO_ESTA);
    return 'respondido';
  }

  if (accion === 'oferta') {
    await enviarBotones(contacto, deps, M.textoFicha(oferta), [
      { id: `lista:${oferta.id}`, titulo: 'Guardar en Mi lista' },
      { id: `aplicar:${oferta.id}`, titulo: 'Aplicar' }
    ]);
    return 'respondido';
  }

  if (accion === 'lista') {
    // Mi lista: no inicia aplicación ni autoriza contacto (BA-031).
    const miLista = Array.from(new Set([...(contacto.sesion.miLista || []), oferta.id])).slice(-20);
    const sesion = { ...contacto.sesion, miLista };
    await actualizar(contacto, deps, { sesion });
    await enviarTexto({ ...contacto, sesion }, deps, M.textoMiLista(oferta.nombre));
    return 'respondido';
  }

  if (accion === 'aplicar') {
    const sesion: SesionWa = {
      ...contacto.sesion,
      aplicacion: { ofertaId: oferta.id, ofertaNombre: oferta.nombre, universidad: oferta.universidad, paso: 'datos_nombre' }
    };
    await actualizar(contacto, deps, { sesion });
    await enviarTexto({ ...contacto, sesion }, deps, M.textoPedirNombre(oferta.nombre));
    return 'respondido';
  }

  if (accion === 'autorizar' || accion === 'noautorizar') {
    return resolverAutorizacion(contacto, oferta, accion === 'autorizar', deps);
  }

  await enviarTexto(contacto, deps, M.PEDIR_INTERES);
  return 'respondido';
}

const PATRON_NOMBRE = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü' ]{2,}(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñÜü' ]{2,})+$/;
const PATRON_CORREO = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

async function capturarDatosAplicacion(
  contacto: ContactoWa,
  texto: string,
  deps: DependenciasOrquestador
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
      await enviarTexto(contacto, deps, M.NOMBRE_INVALIDO);
      return 'respondido';
    }
    const sesion: SesionWa = { ...contacto.sesion, aplicacion: { ...aplicacion, nombreCompleto: nombre, paso: 'datos_correo' } };
    await actualizar(contacto, deps, { sesion });
    await enviarTexto({ ...contacto, sesion }, deps, M.PEDIR_CORREO);
    return 'respondido';
  }

  // datos_correo
  const limpio = texto.trim();
  let correo: string | null = null;
  if (plegarComando(limpio) !== 'omitir') {
    if (!PATRON_CORREO.test(limpio)) {
      await enviarTexto(contacto, deps, M.CORREO_INVALIDO);
      return 'respondido';
    }
    correo = limpio.toLowerCase();
  }
  const sesion: SesionWa = { ...contacto.sesion, aplicacion: { ...aplicacion, correo, paso: 'consentimiento' } };
  await actualizar(contacto, deps, { sesion });
  await enviarBotones({ ...contacto, sesion }, deps, M.textoAutorizarContacto(aplicacion.ofertaNombre, aplicacion.universidad), [
    { id: `autorizar:${aplicacion.ofertaId}`, titulo: 'Autorizo contacto' },
    { id: `noautorizar:${aplicacion.ofertaId}`, titulo: 'No autorizo' }
  ]);
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
    await enviarTexto(contacto, deps, M.OFERTA_YA_NO_ESTA);
    return 'respondido';
  }

  const sesionLimpia: SesionWa = { ...contacto.sesion, aplicacion: null };
  const base = {
    contactoId: contacto.id,
    ofertaId: oferta.id,
    ofertaNombre: oferta.nombre,
    nombreCompleto: aplicacion.nombreCompleto,
    correo: aplicacion.correo ?? null
  };

  if (!autoriza) {
    await deps.almacen.registrarIntencion({ ...base, paso: 'rechazada', consentimientos: [] });
    await actualizar(contacto, deps, { sesion: sesionLimpia });
    await enviarTexto(contacto, deps, M.CONTACTO_NO_AUTORIZADO);
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
    await actualizar(contacto, deps, { sesion: sesionLimpia });
    await enviarTexto(contacto, deps, evaluacion.ok === false ? evaluacion.mensaje : M.CONTACTO_NO_AUTORIZADO);
    return 'respondido';
  }

  const consentimientos = evaluacion.consentimientos.map((c) => ({
    codigo: c.codigo,
    otorgado: c.otorgado,
    version_texto: c.versionTexto
  }));

  // Interruptor de conversión apagado (por defecto): se registra, NO se crea oportunidad ni transferencia.
  if (!deps.config.leadConversionHabilitada) {
    await deps.almacen.registrarIntencion({ ...base, paso: 'consentimiento_registrado', consentimientos });
    await actualizar(contacto, deps, { sesion: sesionLimpia });
    await enviarTexto(contacto, deps, M.textoSolicitudRegistradaSinConversion(oferta.nombre));
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

  await actualizar(contacto, deps, { sesion: sesionLimpia });
  if (resultado.ok === true) {
    await deps.almacen.registrarIntencion({
      ...base,
      paso: 'lead_creado',
      consentimientos,
      oportunidadId: resultado.oportunidadId,
      personaId: resultado.personaId
    });
    await enviarTexto(contacto, deps, M.textoLeadCreado(oferta.nombre, oferta.universidad));
  } else {
    await deps.almacen.registrarIntencion({ ...base, paso: 'error_conversion', consentimientos, motivo: resultado.codigo });
    await enviarTexto(contacto, deps, M.textoConversionRechazada());
  }
  return 'respondido';
}

// ---------------------------------------------------------------------------
// Envío seguro: ventana 24 h + opt-out + historial (solo con consentimiento)
// ---------------------------------------------------------------------------

async function actualizar(contacto: ContactoWa, deps: DependenciasOrquestador, parche: ParcheContacto) {
  await deps.almacen.actualizarContacto(contacto.id, parche);
}

function puedeEscribirle(contacto: ContactoWa, deps: DependenciasOrquestador): boolean {
  const ahora = deps.ahora ? deps.ahora() : Date.now();
  if (contacto.optOut) return false;
  return dentroDeVentana24h(contacto.ultimoEntranteMs, ahora);
}

async function trasEnvio(contacto: ContactoWa, deps: DependenciasOrquestador, contenido: string, idMeta: string | null) {
  if (!contacto.consentimientoDatos) return;
  await deps.almacen.registrarMensaje(contacto.id, { direccion: 'saliente', contenido, idMeta, tipo: 'texto' });
}

async function envolver(
  contacto: ContactoWa,
  deps: DependenciasOrquestador,
  contenido: string,
  enviar: () => Promise<{ idMensaje: string | null }>
): Promise<boolean> {
  if (!puedeEscribirle(contacto, deps)) {
    deps.log?.('wa_envio_bloqueado_ventana_o_baja', { numero: enmascarar(contacto.e164) });
    return false;
  }
  try {
    const r = await enviar();
    await trasEnvio(contacto, deps, contenido, r.idMensaje);
    return true;
  } catch (error) {
    if (error instanceof WhatsAppApiError) {
      deps.log?.('wa_envio_fallido', { status: error.status, codigoMeta: error.codigoMeta, tipo: error.tipo });
      return false;
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
  input: { cuerpo: string; textoBoton: string; tituloSeccion: string; filas: FilaLista[] }
) {
  return envolver(contacto, deps, input.cuerpo, () => deps.enviador.enviarLista(contacto.e164, input));
}

export { SESION_WA_VACIA };
