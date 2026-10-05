/**
 * BA-031 · Reglas puras del funnel en el hilo.
 *
 * Mi lista, Aplicar y Autorizar contacto son pasos distintos.
 * Ninguna función de este archivo escribe en base de datos.
 * Aceptar es el único resultado con lead=true, y solo si el
 * consentimiento explícito cubre obligatorios y contacto.
 */

export const PASOS_FUNNEL = [
  'mi_lista',
  'iniciada',
  'datos',
  'consentimiento',
  'aceptada',
  'rechazada',
  'abandonada'
] as const;

export type PasoFunnel = (typeof PASOS_FUNNEL)[number];

export const CODIGOS_AUTORIZAN_CONTACTO = [
  'contacto',
  'contacto_whatsapp',
  'transferencia_universidad'
] as const;

export interface TipoConsentimientoRegla {
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  version?: string | null;
  texto_completo?: string | null;
  es_obligatorio?: boolean | null;
}

export interface DeclaracionConsentimiento {
  codigo?: string;
  otorgado?: unknown;
  versionTexto?: string;
}

export interface ConsentimientoNormalizado {
  codigo: string;
  nombre: string;
  esObligatorio: boolean;
  otorgado: boolean;
  versionTexto: string;
}

export interface FalloRegla {
  ok: false;
  code: string;
  mensaje: string;
}

export type DecisionFunnel = 'aceptar' | 'rechazar' | 'abandonar';

const PASOS_ABIERTOS_DATOS: PasoFunnel[] = ['iniciada', 'datos', 'consentimiento'];
const PASOS_TERMINALES: PasoFunnel[] = ['aceptada', 'rechazada', 'abandonada'];

export function esPasoFunnel(value: string): value is PasoFunnel {
  return (PASOS_FUNNEL as readonly string[]).includes(value);
}

export function accionesDePaso(paso: string | null): string[] {
  if (paso === 'iniciada' || paso === 'datos') return ['enviar_datos', 'abandonar'];
  if (paso === 'consentimiento') return ['aceptar', 'rechazar', 'abandonar'];
  return [];
}

/**
 * Solo `true` booleano cuenta como otorgado.
 * "true", 1 o un campo ausente se quedan en false: nada viene marcado.
 */
export function normalizarConsentimientos(
  tipos: TipoConsentimientoRegla[],
  declarados: DeclaracionConsentimiento[] | null | undefined
): ConsentimientoNormalizado[] {
  const otorgadoPorCodigo = new Map<string, boolean>();
  for (const declarado of declarados || []) {
    const codigo = String(declarado?.codigo || '').trim();
    if (!codigo) continue;
    otorgadoPorCodigo.set(codigo, declarado?.otorgado === true);
  }

  return tipos.map((tipo) => ({
    codigo: tipo.codigo,
    nombre: tipo.nombre,
    esObligatorio: tipo.es_obligatorio === true,
    otorgado: otorgadoPorCodigo.get(tipo.codigo) === true,
    versionTexto: tipo.version || 'v1'
  }));
}

export function evaluarDecision(input: {
  paso: PasoFunnel;
  decision: string;
  modeloNegocio: string | null;
  tipos: TipoConsentimientoRegla[];
  declarados?: DeclaracionConsentimiento[] | null;
}):
  | { ok: true; cierre: 'abandonada' | 'rechazada'; lead: false }
  | { ok: true; cierre: 'aceptada'; lead: true; consentimientos: ConsentimientoNormalizado[] }
  | FalloRegla {
  const decision = input.decision;
  if (decision !== 'aceptar' && decision !== 'rechazar' && decision !== 'abandonar') {
    return {
      ok: false,
      code: 'decision_invalida',
      mensaje: 'La decisión tiene que ser aceptar, rechazar o abandonar.'
    };
  }

  if (input.paso === 'mi_lista') {
    return {
      ok: false,
      code: 'mi_lista_no_es_aplicar',
      mensaje: 'Guardar en Mi lista no inicia una aplicación ni autoriza contacto.'
    };
  }

  if (PASOS_TERMINALES.includes(input.paso)) {
    return {
      ok: false,
      code: 'ya_resuelta',
      mensaje: 'Esta aplicación del hilo ya quedó cerrada.'
    };
  }

  if (decision === 'abandonar') {
    if (input.paso === 'iniciada' || input.paso === 'datos' || input.paso === 'consentimiento') {
      return { ok: true, cierre: 'abandonada', lead: false };
    }
    return {
      ok: false,
      code: 'paso_invalido',
      mensaje: 'No puedo abandonar esta aplicación desde el paso actual.'
    };
  }

  if (input.paso !== 'consentimiento') {
    return {
      ok: false,
      code: 'paso_invalido',
      mensaje: 'Primero necesito tus datos y el texto del consentimiento en el chat.'
    };
  }

  if (decision === 'rechazar') {
    return { ok: true, cierre: 'rechazada', lead: false };
  }

  const consentimientos = normalizarConsentimientos(input.tipos, input.declarados);
  const faltante = consentimientos.find((item) => item.esObligatorio && !item.otorgado);
  if (faltante) {
    return {
      ok: false,
      code: 'consentimiento_obligatorio_faltante',
      mensaje: `Falta aceptar «${faltante.nombre}». Sin esa autorización no creo la solicitud.`
    };
  }

  const modelo = input.modeloNegocio || 'por_inscrito';
  const transfer = consentimientos.find((item) => item.codigo === 'transferencia_universidad');
  if (modelo === 'por_lead' && !transfer?.otorgado) {
    return {
      ok: false,
      code: 'consentimiento_transferencia_requerido',
      mensaje:
        'Esta oferta solo sigue si autorizas la transferencia a la universidad. Sin eso no creo el lead.'
    };
  }

  const autorizaContacto = consentimientos.some(
    (item) =>
      (CODIGOS_AUTORIZAN_CONTACTO as readonly string[]).includes(item.codigo) && item.otorgado
  );
  if (!autorizaContacto) {
    return {
      ok: false,
      code: 'consentimiento_no_aceptado',
      mensaje:
        'Aplicar no autoriza el contacto. Sin esa autorización no creo la solicitud ni la comparto.'
    };
  }

  return { ok: true, cierre: 'aceptada', lead: true, consentimientos };
}

export function evaluarGuardadoDatos(paso: PasoFunnel): FalloRegla | { ok: true } {
  if (paso === 'mi_lista') {
    return {
      ok: false,
      code: 'mi_lista_no_es_aplicar',
      mensaje: 'Guardar en Mi lista no pide datos ni crea una solicitud.'
    };
  }
  if (PASOS_TERMINALES.includes(paso)) {
    return {
      ok: false,
      code: 'ya_resuelta',
      mensaje: 'Esta aplicación del hilo ya quedó cerrada. No cambio los datos.'
    };
  }
  if (!PASOS_ABIERTOS_DATOS.includes(paso)) {
    return {
      ok: false,
      code: 'paso_invalido',
      mensaje: 'No puedo guardar datos de contacto en este paso.'
    };
  }
  return { ok: true };
}

export function pasoTrasContacto(completo: boolean): 'datos' | 'consentimiento' {
  return completo ? 'consentimiento' : 'datos';
}

const UUID_HILO_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * El hilo activo es la oportunidad de la conversación.
 * Sin uuid no hay a quién atribuir la intención: no se reutiliza la de otro contacto.
 */
export function validarOportunidadHilo(
  valor: unknown
): { ok: true; oportunidadId: string } | { ok: false; code: 'hilo_requerido' } {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  if (!UUID_HILO_RE.test(texto)) return { ok: false, code: 'hilo_requerido' };
  return { ok: true, oportunidadId: texto };
}

/**
 * Replay solo si la fila ya pertenece a este hilo.
 * Nulo (filas viejas) u otro uuid es cruce: nunca se devuelve esa intención.
 */
export function coincidenciaHilo(
  hiloGuardado: string | null | undefined,
  hiloSolicitado: string
): { ok: true } | { ok: false; code: 'hilo_no_coincide' } {
  if (!hiloGuardado || hiloGuardado !== hiloSolicitado) {
    return { ok: false, code: 'hilo_no_coincide' };
  }
  return { ok: true };
}

const HTTP_POR_CODIGO: Record<string, number> = {
  json_invalido: 400,
  hilo_requerido: 400,
  hilo_no_encontrado: 404,
  hilo_no_coincide: 409,
  oferta_requerida: 400,
  oferta_invalida: 400,
  accion_invalida: 400,
  clave_idempotencia_requerida: 400,
  clave_en_uso: 409,
  celular_invalido: 400,
  correo_invalido: 400,
  datos_incompletos: 400,
  decision_invalida: 400,
  intencion_invalida: 400,
  intencion_no_encontrada: 404,
  oferta_inexistente: 404,
  oferta_no_disponible: 422,
  oferta_sin_periodo: 422,
  oferta_id_requerida: 400,
  celular_requerido: 400,
  forbidden: 403,
  mi_lista_no_es_aplicar: 409,
  paso_invalido: 409,
  ya_resuelta: 409,
  consentimiento_obligatorio_faltante: 422,
  consentimiento_transferencia_requerido: 422,
  consentimiento_no_aceptado: 422,
  duplicada: 400,
  limite_alcanzado: 400,
  parametros_invalidos: 422,
  lead_no_creado: 422,
  funnel_no_disponible: 503,
  rpc_error: 500,
  server_error: 500,
  visitante_query_error: 500,
  visitante_create_error: 500,
  excepcion: 500
};

export function httpDeCodigo(codigo: string): number {
  return HTTP_POR_CODIGO[codigo] || 500;
}

export function mismoCierre(paso: PasoFunnel, decision: string): boolean {
  return (
    (paso === 'aceptada' && decision === 'aceptar') ||
    (paso === 'rechazada' && decision === 'rechazar') ||
    (paso === 'abandonada' && decision === 'abandonar') ||
    (paso === 'mi_lista' && decision === 'mi_lista')
  );
}
