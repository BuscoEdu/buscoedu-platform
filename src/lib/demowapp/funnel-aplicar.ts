import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizarE164, enmascararCelular } from '@/src/lib/phone';
import { listarTiposConsentimientoActivos } from '@/src/lib/leadcenter/tipos-consentimiento';
import { getOrCreateActiveConversation } from './conversacion-service';
import { appendConversationMessage } from './mensaje-service';
import {
  accionesDePaso,
  evaluarDecision,
  evaluarGuardadoDatos,
  esPasoFunnel,
  httpDeCodigo,
  mismoCierre,
  pasoTrasContacto,
  type ConsentimientoNormalizado,
  type PasoFunnel
} from './funnel-aplicar-reglas';
import {
  mensajeAbandono,
  mensajeConfirmacion,
  mensajeConsentimiento,
  mensajeDatosParciales,
  mensajeIniciarSinDatos,
  mensajeMiLista,
  mensajeRechazo
} from './funnel-aplicar-mensajes';

/**
 * BA-031 · Sesión de aplicar en el hilo Demo WhatsApp.
 *
 * El turno de NaIA (mensaje-service) no crea leads. Este módulo tampoco
 * los crea al guardar en Mi lista, al pedir datos o al mostrar el texto.
 * La única escritura de oportunidad pasa por fn_ba031_convertir_si_consentido
 * después de una decisión `aceptar` que ya cumplió las reglas.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PREFIJO_POR_ISO: Record<string, string> = {
  CO: '57',
  MX: '52',
  PE: '51',
  CL: '56',
  EC: '593',
  VE: '58',
  PA: '507',
  US: '1',
  CA: '1'
};

export interface MensajeHilo {
  id: string;
  rol: 'naia' | 'sistema';
  tipo: 'texto' | 'mi_lista' | 'datos' | 'consentimiento' | 'confirmacion' | 'rechazo' | 'abandono' | 'error';
  texto: string;
  en: string;
}

export interface SesionDemoAplicar {
  id: string;
  ofertaId: string;
  ofertaNombre: string | null;
  modeloNegocio: string | null;
  paso: PasoFunnel;
  contacto: {
    nombreCompleto: string | null;
    celularE164: string | null;
    celularEnmascarado: string | null;
    correo: string | null;
    pais: string | null;
  };
}

export interface CuerpoFunnelOk {
  ok: true;
  leadCreado: boolean;
  idempotente: boolean;
  ui: {
    estado: 'success';
    cargando: false;
    paso: PasoFunnel;
    leadCreado: boolean;
    acciones: string[];
  };
  mensajes: MensajeHilo[];
  sesionDemo: SesionDemoAplicar;
  oportunidadId: string | null;
  aplicacionId: string | null;
  personaId: string | null;
  trazaConsentimiento: unknown;
  consentimientos?: ConsentimientoNormalizado[];
  hiloCrm: { conversacionId: string; mensajeId: string } | null;
}

export class FunnelError extends Error {
  codigo: string;
  http: number;
  paso: string | null;
  acciones: string[];
  mensajes: MensajeHilo[];

  constructor(codigo: string, mensaje: string, paso: string | null) {
    super(mensaje);
    this.name = 'FunnelError';
    this.codigo = codigo;
    this.http = httpDeCodigo(codigo);
    this.paso = paso;
    this.acciones = accionesDePaso(paso);
    this.mensajes = [burbuja('error', mensaje)];
  }
}

interface FilaIntencion {
  id: string;
  oferta_id: string;
  paso: string;
  clave_idempotencia: string;
  nombre_completo: string | null;
  correo: string | null;
  celular_e164: string | null;
  pais_celular: string | null;
  visitante_id: string | null;
  modelo_negocio: string | null;
  oferta_nombre: string | null;
  consentimientos: unknown;
  traza_consentimiento: unknown;
  mensajes: unknown;
  persona_id: string | null;
  oportunidad_id: string | null;
  aplicacion_id: string | null;
  motivo_cierre: string | null;
}

interface OfertaAplicable {
  id: string;
  nombre_oferta: string | null;
  modelo_negocio: string | null;
  periodo_academico_id: string | null;
  universidad_id?: string | null;
  activo?: boolean | null;
}

function ahoraIso() {
  return new Date().toISOString();
}

function burbuja(tipo: MensajeHilo['tipo'], texto: string): MensajeHilo {
  return {
    id: randomUUID(),
    rol: 'naia',
    tipo,
    texto,
    en: ahoraIso()
  };
}

function anexar(mensajes: MensajeHilo[], nueva: MensajeHilo): MensajeHilo[] {
  const ultima = mensajes[mensajes.length - 1];
  if (ultima && ultima.tipo === nueva.tipo && ultima.texto === nueva.texto) return mensajes;
  return [...mensajes, nueva];
}

function leerMensajes(valor: unknown): MensajeHilo[] {
  if (!Array.isArray(valor)) return [];
  return valor.filter((item) => item && typeof item === 'object' && typeof (item as MensajeHilo).texto === 'string') as MensajeHilo[];
}

function mapDb(error: { message?: string; code?: string } | null, fallback = 'No pude guardar la sesión del hilo.'): never {
  const msg = error?.message || fallback;
  const blob = `${error?.code || ''} ${msg}`;
  if (
    /intenciones_aplicar_demowapp|fn_ba031_convertir_si_consentido/.test(blob) &&
    /does not exist|schema cache|Could not find|not find|42883|42P01|PGRST205|PGRST202/i.test(blob)
  ) {
    throw new FunnelError(
      'funnel_no_disponible',
      'Falta aplicar la migración BA-031. No creé ningún lead.',
      null
    );
  }
  throw new FunnelError('server_error', msg, null);
}

function prefijoDePais(pais: unknown): string {
  const raw = String(pais || '57').trim().toUpperCase();
  if (PREFIJO_POR_ISO[raw]) return PREFIJO_POR_ISO[raw];
  return raw.replace(/^\+/, '') || '57';
}

function exigirPaso(fila: FilaIntencion): PasoFunnel {
  if (!esPasoFunnel(fila.paso)) {
    throw new FunnelError('paso_invalido', 'La sesión del hilo tiene un paso desconocido.', null);
  }
  return fila.paso;
}

function cuerpoDe(fila: FilaIntencion, extra?: Partial<CuerpoFunnelOk> & { idempotente?: boolean }): CuerpoFunnelOk {
  const paso = exigirPaso(fila);
  const leadCreado = paso === 'aceptada';
  return {
    ok: true,
    leadCreado,
    idempotente: extra?.idempotente === true,
    ui: {
      estado: 'success',
      cargando: false,
      paso,
      leadCreado,
      acciones: accionesDePaso(paso)
    },
    mensajes: leerMensajes(fila.mensajes),
    sesionDemo: sesionDe(fila),
    oportunidadId: fila.oportunidad_id,
    aplicacionId: fila.aplicacion_id,
    personaId: fila.persona_id,
    trazaConsentimiento: fila.traza_consentimiento ?? null,
    consentimientos: extra?.consentimientos,
    hiloCrm: extra?.hiloCrm ?? null
  };
}

function sesionDe(fila: FilaIntencion): SesionDemoAplicar {
  return {
    id: fila.id,
    ofertaId: fila.oferta_id,
    ofertaNombre: fila.oferta_nombre,
    modeloNegocio: fila.modelo_negocio,
    paso: exigirPaso(fila),
    contacto: {
      nombreCompleto: fila.nombre_completo,
      celularE164: fila.celular_e164,
      celularEnmascarado: fila.celular_e164 ? enmascararCelular(fila.celular_e164) : null,
      correo: fila.correo,
      pais: fila.pais_celular
    }
  };
}

async function cargarOferta(db: SupabaseClient, ofertaId: string): Promise<OfertaAplicable> {
  if (!UUID_RE.test(ofertaId)) {
    throw new FunnelError('oferta_invalida', 'La oferta no tiene un id válido.', null);
  }
  const { data, error } = await db
    .from('ofertas_academicas')
    .select('id, nombre_oferta, modelo_negocio, periodo_academico_id, universidad_id, activo')
    .eq('id', ofertaId)
    .maybeSingle();
  if (error) mapDb(error);
  if (!data) {
    throw new FunnelError('oferta_inexistente', 'No encontré esa oferta en el catálogo.', null);
  }
  if ((data as OfertaAplicable).activo === false) {
    throw new FunnelError('oferta_no_disponible', 'Esa oferta no está disponible para aplicar.', null);
  }
  return data as OfertaAplicable;
}

async function porId(db: SupabaseClient, id: string): Promise<FilaIntencion> {
  if (!UUID_RE.test(id)) {
    throw new FunnelError('intencion_invalida', 'La sesión del hilo no tiene un id válido.', null);
  }
  const { data, error } = await db
    .from('intenciones_aplicar_demowapp')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) mapDb(error);
  if (!data) {
    throw new FunnelError('intencion_no_encontrada', 'No encontré esa aplicación en el hilo.', null);
  }
  return data as FilaIntencion;
}

async function porClave(db: SupabaseClient, clave: string): Promise<FilaIntencion | null> {
  const { data, error } = await db
    .from('intenciones_aplicar_demowapp')
    .select('*')
    .eq('clave_idempotencia', clave)
    .maybeSingle();
  if (error) mapDb(error);
  return (data as FilaIntencion) || null;
}

async function actualizar(
  db: SupabaseClient,
  id: string,
  pasoEsperado: PasoFunnel,
  patch: Record<string, unknown>
): Promise<FilaIntencion | null> {
  const { data, error } = await db
    .from('intenciones_aplicar_demowapp')
    .update({ ...patch, actualizado_en: ahoraIso() })
    .eq('id', id)
    .eq('paso', pasoEsperado)
    .select('*')
    .maybeSingle();
  if (error) mapDb(error);
  return (data as FilaIntencion) || null;
}

function claveExigida(valor: unknown): string {
  const clave = String(valor || '').trim();
  if (clave.length < 8 || clave.length > 160) {
    throw new FunnelError(
      'clave_idempotencia_requerida',
      'Hace falta una clave de idempotencia de al menos 8 caracteres.',
      null
    );
  }
  return clave;
}

function nombreLimpio(valor: unknown): string {
  return String(valor || '').replace(/\s+/g, ' ').trim();
}

function leerCorreo(valor: unknown, paso: string | null): string | null {
  const correo = String(valor || '').trim().toLowerCase();
  if (!correo) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw new FunnelError('correo_invalido', 'El correo no parece válido.', paso);
  }
  return correo;
}

function leerCelular(valor: unknown, pais: unknown, paso: string | null) {
  const norm = normalizarE164(String(valor || ''), prefijoDePais(pais));
  if (!norm.valido) {
    throw new FunnelError('celular_invalido', norm.motivo || 'El celular no es válido.', paso);
  }
  return norm;
}

function faltantesContacto(nombre: string, celular: string | null): string[] {
  const faltan: string[] = [];
  if (nombre.length < 3) faltan.push('tu nombre completo');
  if (!celular) faltan.push('tu celular');
  return faltan;
}

function partirNombre(nombreCompleto: string) {
  const partes = nombreCompleto.split(' ').filter(Boolean);
  const nombres = partes.slice(0, Math.max(1, partes.length - 1)).join(' ') || partes[0] || '';
  const apellidos = partes.length > 1 ? partes[partes.length - 1] : '';
  return { nombres, apellidos };
}

async function asegurarVisitante(db: SupabaseClient, visitanteId: unknown): Promise<string | null> {
  const texto = typeof visitanteId === 'string' ? visitanteId.trim() : '';
  if (!texto) return null;
  if (!UUID_RE.test(texto)) return null;

  const { data: existente, error: consultaError } = await db
    .from('visitantes')
    .select('id')
    .eq('id', texto)
    .maybeSingle();
  if (consultaError) {
    throw new FunnelError(
      'visitante_query_error',
      'No se pudo comprobar el identificador de navegación.',
      null
    );
  }
  if (existente) return texto;

  const marca = ahoraIso();
  const { error: insertError } = await db.from('visitantes').insert({
    id: texto,
    identificador_navegacion: texto,
    primer_acceso_en: marca,
    ultimo_acceso_en: marca
  });
  if (insertError) {
    throw new FunnelError(
      'visitante_create_error',
      'No se pudo registrar el identificador de navegación.',
      null
    );
  }
  return texto;
}

function replaySiMismaAccion(fila: FilaIntencion, accion: 'iniciar' | 'mi_lista'): FilaIntencion {
  if (accion === 'mi_lista' && fila.paso === 'mi_lista') return fila;
  if (accion === 'iniciar' && fila.paso !== 'mi_lista') return fila;
  throw new FunnelError(
    'clave_en_uso',
    'Esa clave ya pertenece a otro paso del hilo. Mi lista y Aplicar no se mezclan.',
    fila.paso
  );
}

/**
 * Iniciar Aplicar, o registrar que eligieron Mi lista.
 * Ninguno de los dos caminos crea oportunidad.
 */
export async function iniciarEnHilo(
  db: SupabaseClient,
  input: {
    accion: unknown;
    ofertaId: unknown;
    claveIdempotencia: unknown;
    nombreCompleto?: unknown;
    celular?: unknown;
    correo?: unknown;
    pais?: unknown;
    visitanteId?: unknown;
    ip?: string | null;
  }
): Promise<CuerpoFunnelOk> {
  const accion = input.accion === 'mi_lista' || input.accion === 'iniciar' ? input.accion : null;
  if (!accion) {
    throw new FunnelError('accion_invalida', 'La acción tiene que ser iniciar o mi_lista.', null);
  }
  const ofertaId = String(input.ofertaId || '').trim();
  if (!ofertaId) {
    throw new FunnelError('oferta_requerida', 'Hace falta la oferta a la que aplica.', null);
  }
  const clave = claveExigida(input.claveIdempotencia);
  const oferta = await cargarOferta(db, ofertaId);
  const nombreOferta = oferta.nombre_oferta || 'esta oferta';

  const previa = await porClave(db, clave);
  if (previa) {
    return cuerpoDe(replaySiMismaAccion(previa, accion), { idempotente: true });
  }

  if (accion === 'mi_lista') {
    const mensajes = [burbuja('mi_lista', mensajeMiLista(nombreOferta))];
    const { data, error } = await db
      .from('intenciones_aplicar_demowapp')
      .insert({
        ...baseInsert(oferta, clave, 'mi_lista', mensajes, input.ip),
        motivo_cierre: 'mi_lista_no_es_aplicar',
        resuelto_en: ahoraIso(),
        traza_consentimiento: {
          canal: 'demo_wapp',
          origen: 'hilo_demowapp',
          decision: 'mi_lista',
          leadCreado: false,
          ofertaId: oferta.id
        }
      })
      .select('*')
      .single();
    if (error) {
      if (error.code === '23505') {
        const otra = await porClave(db, clave);
        if (otra) return cuerpoDe(replaySiMismaAccion(otra, accion), { idempotente: true });
      }
      mapDb(error);
    }
    return cuerpoDe(data as FilaIntencion);
  }

  const contacto = contactoInicial(input);
  const completo = faltantesContacto(contacto.nombre, contacto.celular).length === 0;
  const paso = completo ? 'consentimiento' : contacto.nombre || contacto.celular ? 'datos' : 'iniciada';
  const tipos = paso === 'consentimiento' ? await listarTiposConsentimientoActivos(db) : [];
  let mensajes = [
    burbuja(
      completo ? 'consentimiento' : 'texto',
      completo ? mensajeConsentimiento(nombreOferta, tipos) : mensajeIniciarSinDatos(nombreOferta)
    )
  ];
  if (!completo && (contacto.nombre || contacto.celular)) {
    mensajes = anexar(
      mensajes,
      burbuja('datos', mensajeDatosParciales(faltantesContacto(contacto.nombre, contacto.celular)))
    );
  }

  const visitanteId = await asegurarVisitante(db, input.visitanteId);
  const { data, error } = await db
    .from('intenciones_aplicar_demowapp')
    .insert({
      ...baseInsert(oferta, clave, paso, mensajes, input.ip),
      nombre_completo: contacto.nombre || null,
      correo: contacto.correo,
      celular_e164: contacto.celular,
      pais_celular: contacto.pais,
      visitante_id: visitanteId
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      const otra = await porClave(db, clave);
      if (otra) return cuerpoDe(replaySiMismaAccion(otra, accion), { idempotente: true });
    }
    mapDb(error);
  }

  const fila = data as FilaIntencion;
  return cuerpoDe(fila, {
    consentimientos: paso === 'consentimiento' ? normalizadosVacios(tipos) : undefined
  });
}

function baseInsert(
  oferta: OfertaAplicable,
  clave: string,
  paso: PasoFunnel,
  mensajes: MensajeHilo[],
  ip?: string | null
) {
  return {
    oferta_id: oferta.id,
    paso,
    clave_idempotencia: clave,
    modelo_negocio: oferta.modelo_negocio || 'por_inscrito',
    oferta_nombre: oferta.nombre_oferta,
    mensajes,
    consentimientos: [],
    ip_origen: ip || null,
    persona_id: null,
    oportunidad_id: null,
    aplicacion_id: null
  };
}

function contactoInicial(input: {
  nombreCompleto?: unknown;
  celular?: unknown;
  correo?: unknown;
  pais?: unknown;
}) {
  const nombre = nombreLimpio(input.nombreCompleto);
  if (nombre && nombre.length < 3) {
    throw new FunnelError('datos_incompletos', 'El nombre tiene que tener al menos 3 caracteres.', 'iniciada');
  }
  if (nombre.length > 120) {
    throw new FunnelError('datos_incompletos', 'El nombre es demasiado largo.', 'iniciada');
  }
  const correo = input.correo === undefined || input.correo === null || input.correo === ''
    ? null
    : leerCorreo(input.correo, 'iniciada');
  const hayCelular = String(input.celular || '').trim().length > 0;
  const norm = hayCelular ? leerCelular(input.celular, input.pais, 'iniciada') : null;
  return {
    nombre,
    correo,
    celular: norm?.e164 || null,
    pais: norm?.pais || null
  };
}

function normalizadosVacios(tipos: Awaited<ReturnType<typeof listarTiposConsentimientoActivos>>): ConsentimientoNormalizado[] {
  return tipos.map((tipo) => ({
    codigo: tipo.codigo,
    nombre: tipo.nombre,
    esObligatorio: tipo.es_obligatorio === true,
    otorgado: false,
    versionTexto: tipo.version || 'v1'
  }));
}

/**
 * Guarda nombre, celular y correo en la sesión demo.
 * Sigue sin crear lead. Si el contacto queda completo, presenta el consentimiento.
 */
export async function guardarDatosEnHilo(
  db: SupabaseClient,
  intencionId: string,
  input: {
    nombreCompleto?: unknown;
    celular?: unknown;
    correo?: unknown;
    pais?: unknown;
  }
): Promise<CuerpoFunnelOk> {
  const fila = await porId(db, intencionId);
  const paso = exigirPaso(fila);
  const permitido = evaluarGuardadoDatos(paso);
  if (permitido.ok === false) throw new FunnelError(permitido.code, permitido.mensaje, paso);

  const envioNombre = input.nombreCompleto !== undefined;
  const envioCelular = input.celular !== undefined && String(input.celular || '').trim() !== '';
  const envioCorreo = input.correo !== undefined;
  if (!envioNombre && !envioCelular && !envioCorreo) {
    throw new FunnelError('datos_incompletos', 'Envía el nombre, el celular o el correo.', paso);
  }

  const nombre = envioNombre ? nombreLimpio(input.nombreCompleto) : fila.nombre_completo || '';
  if (envioNombre && (nombre.length < 3 || nombre.length > 120)) {
    throw new FunnelError('datos_incompletos', 'El nombre tiene que tener entre 3 y 120 caracteres.', paso);
  }
  const correo = envioCorreo ? leerCorreo(input.correo, paso) : fila.correo;
  const celular = envioCelular ? leerCelular(input.celular, input.pais, paso) : null;
  const celularE164 = celular?.e164 || (envioCelular ? null : fila.celular_e164);
  const pais = celular?.pais || fila.pais_celular;
  const faltan = faltantesContacto(nombre, celularE164);
  const siguiente = pasoTrasContacto(faltan.length === 0);
  const tipos = siguiente === 'consentimiento' ? await listarTiposConsentimientoActivos(db) : [];
  const texto =
    siguiente === 'consentimiento'
      ? mensajeConsentimiento(fila.oferta_nombre || 'esta oferta', tipos)
      : mensajeDatosParciales(faltan);
  const mensajes = anexar(leerMensajes(fila.mensajes), burbuja(siguiente === 'consentimiento' ? 'consentimiento' : 'datos', texto));

  const guardada = await actualizar(db, fila.id, paso, {
    paso: siguiente,
    nombre_completo: nombre || null,
    correo,
    celular_e164: celularE164,
    pais_celular: pais,
    mensajes
  });
  const vigente = guardada || (await porId(db, fila.id));
  if (!guardada && vigente.paso !== siguiente && vigente.paso !== paso) {
    return cuerpoDe(vigente, { idempotente: true });
  }
  return cuerpoDe(vigente, {
    consentimientos: siguiente === 'consentimiento' ? normalizadosVacios(tipos) : undefined
  });
}

/** Vuelve a mostrar el texto legal. No marca casillas y no crea lead. */
export async function presentarConsentimiento(db: SupabaseClient, intencionId: string): Promise<CuerpoFunnelOk> {
  const fila = await porId(db, intencionId);
  const paso = exigirPaso(fila);
  if (paso !== 'consentimiento') {
    throw new FunnelError(
      'paso_invalido',
      'El consentimiento se presenta cuando ya están el nombre y el celular en el chat.',
      paso
    );
  }
  const tipos = await listarTiposConsentimientoActivos(db);
  const mensajes = anexar(
    leerMensajes(fila.mensajes),
    burbuja('consentimiento', mensajeConsentimiento(fila.oferta_nombre || 'esta oferta', tipos))
  );
  const guardada = await actualizar(db, fila.id, 'consentimiento', { mensajes });
  return cuerpoDe(guardada || fila, { consentimientos: normalizadosVacios(tipos) });
}

export async function obtenerSesionDemo(db: SupabaseClient, intencionId: string): Promise<CuerpoFunnelOk> {
  const fila = await porId(db, intencionId);
  const paso = exigirPaso(fila);
  if (paso !== 'consentimiento') return cuerpoDe(fila);
  const tipos = await listarTiposConsentimientoActivos(db);
  return cuerpoDe(fila, { consentimientos: normalizadosVacios(tipos) });
}

/**
 * Aceptar, rechazar o abandonar.
 * Rechazo y abandono cierran la sesión con los ids de lead en null.
 * Aceptar llama a la RPC solo después de las reglas, y liga la traza.
 */
export async function resolverConsentimientoEnHilo(
  db: SupabaseClient,
  intencionId: string,
  input: {
    decision: unknown;
    consentimientos?: unknown;
    ip?: string | null;
  }
): Promise<CuerpoFunnelOk> {
  const fila = await porId(db, intencionId);
  const paso = exigirPaso(fila);
  const decision = String(input.decision || '').trim();

  if (mismoCierre(paso, decision)) {
    return cuerpoDe(fila, { idempotente: true });
  }

  const declarados = Array.isArray(input.consentimientos) ? input.consentimientos : [];

  // Rechazo y abandono no dependen de que la oferta siga publicada.
  if (decision !== 'aceptar') {
    const cierre = evaluarDecision({
      paso,
      decision,
      modeloNegocio: fila.modelo_negocio,
      tipos: [],
      declarados
    });
    if (cierre.ok === false) throw new FunnelError(cierre.code, cierre.mensaje, paso);
    if (cierre.cierre === 'aceptada') {
      throw new FunnelError('decision_invalida', 'La decisión tiene que ser aceptar, rechazar o abandonar.', paso);
    }
    return cerrarSinLead(db, fila, cierre.cierre, declarados);
  }

  const oferta = await cargarOferta(db, fila.oferta_id);
  if (!oferta.periodo_academico_id) {
    throw new FunnelError(
      'oferta_sin_periodo',
      'Esta oferta no tiene periodo académico. No creo la solicitud.',
      paso
    );
  }
  const tipos = await listarTiposConsentimientoActivos(db);
  const evaluacion = evaluarDecision({
    paso,
    decision,
    modeloNegocio: oferta.modelo_negocio,
    tipos,
    declarados
  });
  if (evaluacion.ok === false) {
    throw new FunnelError(evaluacion.code, evaluacion.mensaje, paso);
  }
  if (evaluacion.cierre !== 'aceptada') {
    return cerrarSinLead(db, fila, evaluacion.cierre, declarados);
  }

  return aceptarYCrearLead(db, fila, oferta, evaluacion.consentimientos, input.ip || null);
}

async function cerrarSinLead(
  db: SupabaseClient,
  fila: FilaIntencion,
  cierre: 'rechazada' | 'abandonada',
  declarados: unknown
): Promise<CuerpoFunnelOk> {
  const paso = exigirPaso(fila);
  const texto = cierre === 'rechazada'
    ? mensajeRechazo(fila.oferta_nombre || 'esta oferta')
    : mensajeAbandono();
  const mensajes = anexar(leerMensajes(fila.mensajes), burbuja(cierre === 'rechazada' ? 'rechazo' : 'abandono', texto));
  const traza = {
    canal: 'demo_wapp',
    origen: 'hilo_demowapp',
    decision: cierre === 'rechazada' ? 'rechazar' : 'abandonar',
    leadCreado: false,
    intencionId: fila.id,
    ofertaId: fila.oferta_id,
    decididoEn: ahoraIso(),
    items: Array.isArray(declarados) ? declarados : []
  };
  const guardada = await actualizar(db, fila.id, paso, {
    paso: cierre,
    motivo_cierre: cierre === 'rechazada' ? 'rechazo_en_hilo' : 'abandono_en_hilo',
    traza_consentimiento: traza,
    consentimientos: Array.isArray(declarados) ? declarados : [],
    mensajes,
    resuelto_en: ahoraIso(),
    persona_id: null,
    oportunidad_id: null,
    aplicacion_id: null
  });
  if (!guardada) {
    const vigente = await porId(db, fila.id);
    if (vigente.paso === cierre) return cuerpoDe(vigente, { idempotente: true });
    throw new FunnelError('ya_resuelta', 'Esta aplicación del hilo ya quedó cerrada.', vigente.paso);
  }
  return cuerpoDe(guardada);
}

async function aceptarYCrearLead(
  db: SupabaseClient,
  fila: FilaIntencion,
  oferta: OfertaAplicable,
  consentimientos: ConsentimientoNormalizado[],
  ip: string | null
): Promise<CuerpoFunnelOk> {
  if (!fila.nombre_completo || !fila.celular_e164) {
    throw new FunnelError('datos_incompletos', 'Faltan el nombre o el celular en la sesión del hilo.', fila.paso);
  }

  const visitanteId = await asegurarVisitante(db, fila.visitante_id);
  const { nombres, apellidos } = partirNombre(fila.nombre_completo);
  const claveRpc = `demowapp-ba031:${fila.id}`;
  const marca = new Date(Date.now() - 5000).toISOString();
  const payload = {
    consentimiento_aceptado: true,
    clave_idempotencia: claveRpc,
    celular_e164: fila.celular_e164,
    pais_celular: fila.pais_celular,
    nombres,
    apellidos,
    nombre_completo: fila.nombre_completo,
    correo: fila.correo,
    visitante_id: visitanteId,
    oferta_id: oferta.id,
    ip_origen: ip,
    consentimientos: consentimientos.map((item) => ({
      codigo: item.codigo,
      otorgado: item.otorgado,
      version_texto: item.versionTexto
    }))
  };

  const { data, error } = await db.rpc('fn_ba031_convertir_si_consentido', { p_payload: payload });
  if (error) {
    const codigo = codigoDesdeExcepcion(error.message || '');
    if (codigo) {
      throw new FunnelError(codigo, mensajeDeCodigoRpc(codigo), 'consentimiento');
    }
    mapDb(error);
  }

  const resultado = (data || {}) as {
    ok?: boolean;
    error?: string;
    persona_id?: string;
    oportunidad_id?: string;
    aplicacion_id?: string;
    idempotente?: boolean;
  };
  if (!resultado.ok) {
    const codigo = resultado.error || 'rpc_error';
    throw new FunnelError(codigo, mensajeDeCodigoRpc(codigo), 'consentimiento');
  }
  if (!resultado.persona_id || !resultado.oportunidad_id) {
    throw new FunnelError('lead_no_creado', 'La conversión no devolvió la oportunidad. No marco el hilo como aceptado.', 'consentimiento');
  }

  const aplicacionId = await resolverAplicacion(db, resultado.oportunidad_id, resultado.aplicacion_id);
  if (!aplicacionId) {
    throw new FunnelError(
      'lead_no_creado',
      'La oportunidad no tiene aplicación ligada. No marco el hilo como aceptado.',
      'consentimiento'
    );
  }

  const filasConsent = await ligarConsentimientos(db, {
    personaId: resultado.persona_id,
    intencionId: fila.id,
    oportunidadId: resultado.oportunidad_id,
    desdeIso: marca
  });

  const decididoEn = ahoraIso();
  const traza = {
    canal: 'demo_wapp',
    origen: 'hilo_demowapp',
    decision: 'aceptar',
    leadCreado: true,
    intencionId: fila.id,
    ofertaId: oferta.id,
    personaId: resultado.persona_id,
    oportunidadId: resultado.oportunidad_id,
    aplicacionId,
    modeloNegocio: oferta.modelo_negocio || 'por_inscrito',
    decididoEn,
    ipOrigen: ip,
    verificacionCelular: 'declarada_en_hilo_sin_otp',
    items: consentimientos.map((item) => ({
      codigo: item.codigo,
      nombre: item.nombre,
      otorgado: item.otorgado,
      versionTexto: item.versionTexto,
      esObligatorio: item.esObligatorio
    })),
    consentimientoIds: filasConsent.map((item) => item.id)
  };

  await registrarEventoTraza(db, {
    personaId: resultado.persona_id,
    oportunidadId: resultado.oportunidad_id,
    ofertaId: oferta.id,
    universidadId: oferta.universidad_id || null,
    visitanteId,
    traza
  });

  const texto = mensajeConfirmacion(fila.oferta_nombre || oferta.nombre_oferta || 'esta oferta');
  const mensajes = anexar(leerMensajes(fila.mensajes), burbuja('confirmacion', texto));
  const guardada = await actualizar(db, fila.id, 'consentimiento', {
    paso: 'aceptada',
    motivo_cierre: 'consentimiento_aceptado_en_hilo',
    modelo_negocio: oferta.modelo_negocio || 'por_inscrito',
    consentimientos,
    traza_consentimiento: traza,
    mensajes,
    persona_id: resultado.persona_id,
    oportunidad_id: resultado.oportunidad_id,
    aplicacion_id: aplicacionId,
    resuelto_en: decididoEn,
    ip_origen: ip || null
  });

  if (!guardada) {
    const vigente = await porId(db, fila.id);
    if (vigente.paso === 'aceptada') return cuerpoDe(vigente, { idempotente: true });
    throw new FunnelError('ya_resuelta', 'Esta aplicación del hilo ya quedó cerrada.', vigente.paso);
  }

  const hiloCrm = await anexarConfirmacionCrm(db, {
    oportunidadId: resultado.oportunidad_id,
    personaId: resultado.persona_id,
    intencionId: fila.id,
    texto
  });

  return cuerpoDe(guardada, { hiloCrm, consentimientos });
}

function codigoDesdeExcepcion(mensaje: string): string | null {
  const match = /ba031_sin_lead:([a-z0-9_]+)/i.exec(mensaje);
  return match?.[1] || null;
}

function mensajeDeCodigoRpc(codigo: string): string {
  switch (codigo) {
    case 'duplicada':
      return 'Ya había una solicitud activa para esta oferta. No creé otra.';
    case 'limite_alcanzado':
      return 'Ya hay 3 solicitudes activas. No creo otra hasta cerrar una.';
    case 'consentimiento_no_aceptado':
      return 'Sin autorización de contacto no creo la solicitud.';
    case 'consentimiento_transferencia_requerido':
      return 'Sin autorización de transferencia a la universidad no creo el lead.';
    case 'consentimiento_obligatorio_faltante':
      return 'Falta una autorización obligatoria. No creo la solicitud.';
    case 'oferta_inexistente':
      return 'No encontré esa oferta en el catálogo.';
    case 'oferta_sin_periodo':
      return 'Esta oferta no tiene periodo académico. No creo la solicitud.';
    case 'celular_requerido':
      return 'Falta un celular válido en la sesión del hilo.';
    default:
      return 'No pude crear la solicitud. No quedó un lead nuevo de este hilo.';
  }
}

async function resolverAplicacion(
  db: SupabaseClient,
  oportunidadId: string,
  explicita?: string | null
): Promise<string | null> {
  if (explicita) return explicita;
  const { data, error } = await db
    .from('aplicaciones')
    .select('id')
    .eq('oportunidad_id', oportunidadId)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data as { id?: string } | null)?.id || null;
}

async function ligarConsentimientos(
  db: SupabaseClient,
  input: { personaId: string; intencionId: string; oportunidadId: string; desdeIso: string }
): Promise<Array<{ id: string }>> {
  try {
    const { data, error } = await db
      .from('consentimientos_persona')
      .select('id')
      .eq('persona_id', input.personaId)
      .eq('canal', 'explorador')
      .gte('creado_en', input.desdeIso)
      .is('notas', null);
    if (error || !data?.length) return [];
    const ids = (data as Array<{ id: string }>).map((fila) => fila.id);
    const nota = `BA-031 hilo demo. intencion=${input.intencionId} oportunidad=${input.oportunidadId}`;
    const conCanal = await db
      .from('consentimientos_persona')
      .update({ canal: 'demo_wapp', notas: nota, actualizado_en: ahoraIso() })
      .in('id', ids);
    if (conCanal.error) {
      await db
        .from('consentimientos_persona')
        .update({ notas: nota, actualizado_en: ahoraIso() })
        .in('id', ids);
    }
    return ids.map((id) => ({ id }));
  } catch (error) {
    console.error('[ba031] traza en consentimientos_persona', error);
    return [];
  }
}

async function registrarEventoTraza(
  db: SupabaseClient,
  input: {
    personaId: string;
    oportunidadId: string;
    ofertaId: string;
    universidadId: string | null;
    visitanteId: string | null;
    traza: Record<string, unknown>;
  }
) {
  try {
    const { error } = await db.from('eventos_negocio').insert({
      evento: 'demowapp_consentimiento_hilo',
      persona_id: input.personaId,
      oportunidad_id: input.oportunidadId,
      oferta_id: input.ofertaId,
      universidad_id: input.universidadId,
      metadatos: {
        ...input.traza,
        idempotency_key: `ba031:traza:${input.traza.intencionId}`,
        origen: 'demowapp'
      },
      generado_por: 'demowapp_ba031',
      creado_en: ahoraIso(),
      visitante_id: input.visitanteId
    });
    if (error) console.error('[ba031] evento de traza', error.message);
  } catch (error) {
    console.error('[ba031] evento de traza', error);
  }
}

async function anexarConfirmacionCrm(
  db: SupabaseClient,
  input: { oportunidadId: string; personaId: string; intencionId: string; texto: string }
): Promise<{ conversacionId: string; mensajeId: string } | null> {
  try {
    const conversacion = await getOrCreateActiveConversation(db, {
      oportunidadId: input.oportunidadId,
      personaId: input.personaId,
      tipoInicio: 'aplicacion_exitosa'
    });
    const mensaje = await appendConversationMessage(db, {
      conversacionId: conversacion.id,
      remitenteTipo: 'naia',
      contenido: input.texto,
      referenciaExterna: `ba031:confirmacion:${input.intencionId}`,
      metadatos: {
        origen: 'ba031_funnel_hilo',
        canal: 'demo_wapp',
        intencion_id: input.intencionId,
        lead_creado: true
      }
    });
    return { conversacionId: conversacion.id, mensajeId: mensaje.id };
  } catch (error) {
    console.error('[ba031] confirmación en conversación CRM', error);
    return null;
  }
}
