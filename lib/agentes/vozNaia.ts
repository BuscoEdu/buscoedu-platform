/**
 * BA-024 — Voz, formato y memoria de sesión de NaIA.
 *
 * El Centro de Agentes sigue armando el prompt desde la base. Este módulo
 * corrige en runtime lo que lo volvía cuadriculado:
 *   - una etiqueta de tono ("cercano") en vez de una voz,
 *   - la prohibición de markdown dentro del mensaje,
 *   - la grilla fija de opciones.
 *
 * La recogida solo guarda lo que el estudiante dijo. No completa huecos
 * ni inventa catálogo, consentimiento ni lead a una universidad.
 */

/** Sampling documentado por Abacus (`getConversationResponse`). Natural, sin deriva. */
export const TEMPERATURA_NAIA = 0.6;

export const CLAVES_SESION = [
  'ciudad',
  'modalidad',
  'presupuesto',
  'nivel',
  'intereses',
  'contacto_nombre',
  'contacto_correo',
  'contacto_celular'
] as const;

export type ClaveSesion = (typeof CLAVES_SESION)[number];
export type SesionEstudiante = Partial<Record<ClaveSesion, string>>;

const ETIQUETA_SESION: Record<ClaveSesion, string> = {
  ciudad: 'ciudad',
  modalidad: 'modalidad',
  presupuesto: 'presupuesto',
  nivel: 'nivel',
  intereses: 'intereses',
  contacto_nombre: 'nombre',
  contacto_correo: 'correo',
  contacto_celular: 'celular'
};

/**
 * Voz que prevalece sobre componentes viejos que pedían tono rígido
 * o prohibían markdown en todo el JSON.
 */
export const BLOQUE_VOZ_NAIA = [
  'VOZ NAIA (BA-024; prevalece sobre un tono de formulario y sobre “sin markdown”):',
  'Habla de tú, en español colombiano neutro: cercana, clara y concreta. Guía como asesora de orientación, no como una encuesta ni un call center.',
  'No favoreces ninguna universidad. BuscoEdu solo orienta: no prometas admisión, cupo ni beca.',
  'Una sola pregunta por turno, al final, y solo si de verdad falta un dato. Si la persona ya dijo algo, valídalo en una frase corta y no lo vuelvas a preguntar.',
  'No inventes ciudad, modalidad, presupuesto, nivel, intereses ni contacto. Si no está en SESION_ESTUDIANTE ni en este mensaje, no existe.',
  'No pidas cédula, correo ni celular para explorar. Si los dice, recuérdalos y no los repitas. No crees un lead ni los envíes a una universidad.',
  'FORMATO del campo "mensaje": markdown con vida. **Negrita** en lo clave. Dos a cuatro oraciones y, si hay opciones, viñetas cortas. Sin muro de texto y sin grilla de encuesta.',
  'Responde SOLO JSON válido, sin fences ni texto fuera. El markdown vive dentro del string mensaje.',
  'Estructura: {"mensaje":"...","filtros":{"programa_o_area":null,"modalidad":null,"ciudad":null,"pais":null,"nivel_academico":null,"tipo_beneficio":null,"universidad":null},"pregunta_seguimiento":"una pregunta o null","opciones_sugeridas":[]}',
  'filtros: solo lo que la persona dijo, o null. opciones_sugeridas: [] o como máximo dos frases en sus palabras. No uses una grilla fija.',
  'CATÁLOGO: no inventes ofertas, precios, requisitos ni universidades. Si mencionas fichas, máximo 8 y solo las que vengan en el contexto. Mi lista, Aplicar y Autorizar contacto son pasos distintos; sin consentimiento vigente no hay lead a una universidad y tú no lo creas.',
  // El contexto ya trae la etiqueta; el modelo no debe repetir el código de catálogo.
  'Nunca escribas códigos internos en MAYÚSCULAS_CON_GUIONES, usá la etiqueta humana.'
].join('\n');

/** Contrato JSON de DemoWapp: el mensaje sigue las mismas reglas de voz. */
export const CONTRATO_JSON_WAPP = [
  'Además del mensaje en markdown, el JSON de este canal incluye:',
  '{"mensaje":"...","resumen_actualizado":"...","intencion_detectada":"...","siguiente_accion_sugerida":"...","requiere_escalamiento":false,"espera_respuesta":true}',
  'No devuelvas un guion de formulario ni una lista de datos pendientes.'
].join('\n');

const CIUDADES = [
  'Bogotá',
  'Medellín',
  'Cali',
  'Barranquilla',
  'Cartagena',
  'Bucaramanga',
  'Pereira',
  'Manizales',
  'Cúcuta',
  'Santa Marta',
  'Ibagué',
  'Villavicencio',
  'Pasto',
  'Montería',
  'Neiva',
  'Armenia',
  'Popayán',
  'Sincelejo',
  'Valledupar',
  'Tunja',
  'Riohacha',
  'Quibdó',
  'Florencia',
  'Yopal',
  'Buenaventura'
];

const PALABRAS_NO_CIUDAD = new Set([
  'virtual',
  'presencial',
  'hibrida',
  'linea',
  'pregrado',
  'posgrado',
  'maestria',
  'universidad',
  'colombia',
  'casa',
  'esto',
  'eso'
]);

export function plegar(texto: string): string {
  return (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function escaparRegExp(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function indicePalabra(textoPlegado: string, terminoPlegado: string): number {
  const re = new RegExp(`(?:^|[^a-z])${escaparRegExp(terminoPlegado)}(?:$|[^a-z])`);
  const match = re.exec(textoPlegado);
  return match ? match.index : -1;
}

function recortar(valor: string, max = 80): string {
  return valor.replace(/\s+/g, ' ').trim().slice(0, max);
}

function extraerCiudad(texto: string): string | null {
  const plegado = plegar(texto);
  let mejor: { index: number; nombre: string } | null = null;

  for (const nombre of CIUDADES) {
    const index = indicePalabra(plegado, plegar(nombre));
    if (index >= 0 && (!mejor || index < mejor.index)) {
      mejor = { index, nombre };
    }
  }
  if (mejor) return mejor.nombre;

  const explicita = texto.match(
    /(?:vivo\s+en|soy\s+de|estoy\s+en|ciudad\s+de)\s+([A-Za-zÁÉÍÓÚáéíóúÑñ]{3,}(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñ]{3,})?)/i
  );
  if (!explicita?.[1]) return null;

  const candidata = recortar(explicita[1], 40);
  const primera = plegar(candidata).split(' ')[0];
  if (PALABRAS_NO_CIUDAD.has(primera)) return null;
  return candidata;
}

function extraerModalidad(texto: string): string | null {
  const t = plegar(texto);
  const virtual = /virtual|en linea|online|a distancia|remot/.test(t);
  const presencial = /\bpresencial\b|\bcampus\b/.test(t);
  const hibrida = /hibrid|semi\s*presencial/.test(t);
  if (hibrida) return 'híbrida';
  if (virtual && presencial) return 'virtual o presencial';
  if (virtual) return 'virtual';
  if (presencial) return 'presencial';
  return null;
}

function extraerNivel(texto: string): string | null {
  const t = plegar(texto);
  if (/\bdoctorado\b|\bphd\b/.test(t)) return 'doctorado';
  if (/\bmaestr/.test(t) || /\bmagister\b/.test(t)) return 'maestría';
  if (/\bespecializacion\b/.test(t)) return 'especialización';
  if (/\btecnologo\b/.test(t)) return 'tecnólogo';
  if (/\btecnico\b/.test(t)) return 'técnico';
  if (/\bpregrado\b|\bprofesional\b/.test(t)) return 'pregrado';
  if (/\bposgrado\b|\bpostgrado\b/.test(t)) return 'posgrado';
  return null;
}

function extraerPresupuesto(texto: string): string | null {
  const conEtiqueta = texto.match(
    /presupuesto(?:\s+(?:de|hasta|maximo|máximo|aprox(?:imado)?))?\s*(?:es\s+)?(?:de\s+)?([^.\n?]{1,40})/i
  );
  if (conEtiqueta?.[1] && /\d|millon|millón|peso|cop|\$/i.test(conEtiqueta[1])) {
    return recortar(conEtiqueta[1].split(/\b(?:y|pero|me llamo|mi correo)\b/i)[0], 40);
  }

  const monto = texto.match(
    /(?:hasta|máximo|maximo)\s+(\$?\s?\d[\d.\s]{1,14}(?:\s*(?:mil|millones?|cop|pesos))?)/i
  );
  if (monto?.[1] && /presupuesto|pesos|cop|\$|millon/i.test(texto)) {
    return recortar(monto[1], 40);
  }
  return null;
}

function extraerIntereses(texto: string, ciudad: string | null): string | null {
  const match = texto.match(
    /(?:me\s+interesa(?:n)?(?:\s+estudiar)?|quiero\s+estudiar|quisiera\s+estudiar|busco\s+(?:estudiar\s+)?|carrera\s+de|área\s+de|area\s+de|programa\s+de)\s+([^.\n?]{3,80})/i
  );
  if (!match?.[1]) return null;

  let valor = match[1];
  valor = valor.split(/\b(?:presupuesto|me\s+llamo|mi\s+correo|mi\s+celular|modalidad)\b/i)[0];
  if (ciudad) {
    valor = valor.replace(new RegExp(`\\s+en\\s+${escaparRegExp(ciudad)}\\b`, 'i'), '');
  }
  valor = valor.replace(/^(?:la|el|los|las|un|una)\s+/i, '');
  valor = recortar(valor.replace(/[.,;:]+$/, ''), 60);
  if (valor.length < 3) return null;
  if (PALABRAS_NO_CIUDAD.has(plegar(valor))) return null;
  return valor;
}

function extraerNombre(texto: string): string | null {
  const explicito = texto.match(
    /(?:me\s+llamo|mi\s+nombre\s+es)\s+([A-Za-zÁÉÍÓÚáéíóúÑñ]{2,}(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñ]{2,}){0,3})/i
  );
  const candidato = explicito?.[1]
    ? explicito[1]
    : texto.match(/\bsoy\s+([A-Za-zÁÉÍÓÚáéíóúÑñ]{2,}(?:\s+[A-Za-zÁÉÍÓÚáéíóúÑñ]{2,}){0,2})\b/i)?.[1];
  if (!candidato) return null;

  const recortado = candidato.split(/\s+\b(?:y|e|mi|con|correo|celular)\b/i)[0];
  const primera = plegar(recortado).split(/\s+/)[0];
  const bloqueadas = new Set([
    'de',
    'del',
    'en',
    'un',
    'una',
    'estudiante',
    'interesado',
    'interesada',
    'colombiano',
    'colombiana'
  ]);
  if (bloqueadas.has(primera)) return null;
  return recortar(recortado, 60);
}

function extraerCorreo(texto: string): string | null {
  const match = texto.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

function extraerCelular(texto: string): string | null {
  const match = texto.match(/(?:\+?57[\s-]?)?(3\d{2}[\s-]?\d{3}[\s-]?\d{4})\b/);
  if (!match?.[1]) return null;
  const digitos = match[1].replace(/\D/g, '');
  if (digitos.length !== 10) return null;
  return digitos;
}

/** Solo lo declarado en este texto. Lo que no aparece, no se inventa. */
export function extraerSlotsDeclarados(texto: string): SesionEstudiante {
  const limpio = (texto || '').trim();
  if (!limpio) return {};

  const sesion: SesionEstudiante = {};
  const ciudad = extraerCiudad(limpio);
  const modalidad = extraerModalidad(limpio);
  const presupuesto = extraerPresupuesto(limpio);
  const nivel = extraerNivel(limpio);
  const intereses = extraerIntereses(limpio, ciudad);
  const nombre = extraerNombre(limpio);
  const correo = extraerCorreo(limpio);
  const celular = extraerCelular(limpio);

  if (ciudad) sesion.ciudad = ciudad;
  if (modalidad) sesion.modalidad = modalidad;
  if (presupuesto) sesion.presupuesto = presupuesto;
  if (nivel) sesion.nivel = nivel;
  if (intereses) sesion.intereses = intereses;
  if (nombre) sesion.contacto_nombre = nombre;
  if (correo) sesion.contacto_correo = correo;
  if (celular) sesion.contacto_celular = celular;
  return sesion;
}

/** La persona abre un dato (“cualquier ciudad”): se olvida solo ese slot. */
export function detectarAperturas(texto: string): ClaveSesion[] {
  const t = plegar(texto);
  const abiertas: ClaveSesion[] = [];
  if (/cualquier ciudad|cualquier lugar|donde sea|da igual la ciudad|sin importar la ciudad/.test(t)) {
    abiertas.push('ciudad');
  }
  if (/cualquier modalidad|da igual la modalidad|sin importar la modalidad/.test(t)) {
    abiertas.push('modalidad');
  }
  return abiertas;
}

/**
 * Lo nuevo pisa lo anterior solo si vino dicho.
 * Una apertura borra ese slot; no rellena los demás.
 */
export function fusionarSesion(
  previa: SesionEstudiante,
  declarada: SesionEstudiante,
  aperturas: ClaveSesion[] = []
): SesionEstudiante {
  const salida: SesionEstudiante = { ...sanearSesion(previa) };
  for (const clave of aperturas) delete salida[clave];
  const limpia = sanearSesion(declarada);
  for (const clave of CLAVES_SESION) {
    if (limpia[clave]) salida[clave] = limpia[clave];
  }
  return salida;
}

export function sanearSesion(valor: unknown): SesionEstudiante {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
  const fuente = valor as Record<string, unknown>;
  const salida: SesionEstudiante = {};
  for (const clave of CLAVES_SESION) {
    const item = fuente[clave];
    if (typeof item === 'string' && item.trim()) {
      salida[clave] = recortar(item);
    }
  }
  return salida;
}

export function serializarSesion(sesion: SesionEstudiante): string {
  const lineas = CLAVES_SESION.filter((clave) => sesion[clave]).map(
    (clave) => `- ${ETIQUETA_SESION[clave]}: ${sesion[clave]}`
  );
  if (lineas.length === 0) {
    return 'SESION_ESTUDIANTE: sin datos declarados. No inventes ciudad, modalidad, presupuesto, nivel, intereses ni contacto.';
  }
  return [
    'SESION_ESTUDIANTE (dicho por el estudiante; reúsala en el hilo; no repreguntes; no completes huecos):',
    ...lineas
  ].join('\n');
}

const CLAVES_FILTRO = [
  'programa_o_area',
  'modalidad',
  'ciudad',
  'pais',
  'nivel_academico',
  'tipo_beneficio',
  'universidad'
] as const;

export function sanearFiltros(valor: unknown): Record<string, string | null> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
  const fuente = valor as Record<string, unknown>;
  const salida: Record<string, string | null> = {};
  for (const clave of CLAVES_FILTRO) {
    const item = fuente[clave];
    if (typeof item === 'string' && item.trim()) salida[clave] = recortar(item, 80);
  }
  return salida;
}

function valorDicho(valor: string, texto: string): boolean {
  const aguja = plegar(valor).trim();
  if (aguja.length < 2) return false;
  return indicePalabra(plegar(texto), aguja) >= 0 || plegar(texto).includes(aguja);
}

function filtroCompatibleConSesion(clave: string, valor: string, sesion: SesionEstudiante): boolean {
  if (clave === 'ciudad' && sesion.ciudad && plegar(sesion.ciudad) === plegar(valor)) return true;
  if (clave === 'modalidad' && sesion.modalidad && plegar(sesion.modalidad).includes(plegar(valor))) return true;
  if (clave === 'nivel_academico' && sesion.nivel && plegar(sesion.nivel) === plegar(valor)) return true;
  if (clave === 'programa_o_area' && sesion.intereses && plegar(sesion.intereses).includes(plegar(valor))) {
    return true;
  }
  return false;
}

/**
 * Filtros de catálogo que el hilo puede seguir usando.
 * Un valor nuevo solo entra si está en el mensaje o ya estaba en la sesión.
 * Ciudad, modalidad concreta e interés dicho rellenan huecos para no perder
 * la búsqueda; nivel no se proyecta solo (un token que no exista en catálogo
 * vacía resultados).
 */
export function acumularFiltros(input: {
  previos: Record<string, string | null>;
  delModelo: Record<string, string | null>;
  textoUsuario: string;
  sesion: SesionEstudiante;
  aperturas: ClaveSesion[];
}): Record<string, string | null> {
  const salida = sanearFiltros(input.previos);

  if (input.aperturas.includes('ciudad')) delete salida.ciudad;
  if (input.aperturas.includes('modalidad')) delete salida.modalidad;

  for (const clave of CLAVES_FILTRO) {
    const valor = input.delModelo[clave];
    if (typeof valor !== 'string' || !valor.trim()) continue;
    const limpio = recortar(valor, 80);
    const repetido = salida[clave] && plegar(salida[clave] as string) === plegar(limpio);
    const dicho = valorDicho(limpio, input.textoUsuario);
    const enSesion = filtroCompatibleConSesion(clave, limpio, input.sesion);
    if (dicho || repetido || enSesion) salida[clave] = limpio;
  }

  if (!salida.ciudad && input.sesion.ciudad && !input.aperturas.includes('ciudad')) {
    salida.ciudad = input.sesion.ciudad;
  }

  const modalidad = input.sesion.modalidad;
  if (
    !salida.modalidad &&
    modalidad &&
    modalidad !== 'virtual o presencial' &&
    !input.aperturas.includes('modalidad')
  ) {
    salida.modalidad = modalidad;
  }

  if (!salida.programa_o_area && input.sesion.intereses && input.sesion.intereses.length <= 40) {
    salida.programa_o_area = input.sesion.intereses;
  }

  return salida;
}

/** Si el modelo repite un dato que sí está en el texto, también queda en sesión. */
export function incorporarFiltrosDichos(
  sesion: SesionEstudiante,
  filtros: Record<string, string | null>,
  texto: string
): SesionEstudiante {
  const salida: SesionEstudiante = { ...sesion };
  if (filtros.ciudad && valorDicho(filtros.ciudad, texto) && !salida.ciudad) salida.ciudad = filtros.ciudad;
  if (filtros.modalidad && valorDicho(filtros.modalidad, texto) && !salida.modalidad) {
    salida.modalidad = extraerModalidad(filtros.modalidad) || filtros.modalidad;
  }
  if (filtros.nivel_academico && valorDicho(filtros.nivel_academico, texto) && !salida.nivel) {
    salida.nivel = filtros.nivel_academico;
  }
  if (filtros.programa_o_area && valorDicho(filtros.programa_o_area, texto) && !salida.intereses) {
    salida.intereses = recortar(filtros.programa_o_area, 60);
  }
  return salida;
}

export function temperaturaNaia(configuracion: Record<string, unknown> | null | undefined): number {
  const raw = configuracion?.temperature ?? configuracion?.temperatura;
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw <= 1) return raw;
  return TEMPERATURA_NAIA;
}

/**
 * Smoke conceptual de 3 turnos: suena con la voz pedida, reusa lo dicho
 * y no inventa un dato que el estudiante no dio.
 */
export function auditarVozNaia(): string[] {
  const errores: string[] = [];
  const voz = plegar(BLOQUE_VOZ_NAIA);
  if (!voz.includes('colombiano neutro')) errores.push('voz sin colombiano neutro');
  if (!voz.includes('de tu')) errores.push('voz sin tutéo');
  if (!BLOQUE_VOZ_NAIA.includes('**')) errores.push('voz sin markdown');
  if (TEMPERATURA_NAIA < 0.4 || TEMPERATURA_NAIA > 0.8) errores.push('temperatura fuera de rango natural');

  const turno1 = extraerSlotsDeclarados(
    'Hola, quiero estudiar derecho en Bogotá, modalidad virtual. Mi presupuesto es de 2 millones.'
  );
  if (turno1.ciudad !== 'Bogotá') errores.push(`turno1 ciudad: ${turno1.ciudad || 'vacia'}`);
  if (turno1.modalidad !== 'virtual') errores.push(`turno1 modalidad: ${turno1.modalidad || 'vacia'}`);
  if (!turno1.intereses || !plegar(turno1.intereses).includes('derecho')) {
    errores.push(`turno1 intereses: ${turno1.intereses || 'vacios'}`);
  }
  if (!turno1.presupuesto || !plegar(turno1.presupuesto).includes('2 millones')) {
    errores.push(`turno1 presupuesto: ${turno1.presupuesto || 'vacio'}`);
  }
  if (turno1.contacto_correo || turno1.contacto_celular) errores.push('turno1 inventó contacto');

  const sesion1 = fusionarSesion({}, turno1);
  const turno2 = extraerSlotsDeclarados(
    'Es pregrado. Me llamo Laura Pérez y mi correo es laura@correo.com'
  );
  const sesion2 = fusionarSesion(sesion1, turno2);
  if (sesion2.ciudad !== 'Bogotá') errores.push('turno2 perdió la ciudad');
  if (sesion2.modalidad !== 'virtual') errores.push('turno2 perdió la modalidad');
  if (sesion2.nivel !== 'pregrado') errores.push(`turno2 nivel: ${sesion2.nivel || 'vacio'}`);
  if (sesion2.contacto_nombre !== 'Laura Pérez') errores.push(`turno2 nombre: ${sesion2.contacto_nombre || 'vacio'}`);
  if (sesion2.contacto_correo !== 'laura@correo.com') errores.push('turno2 correo');

  const turno3 = extraerSlotsDeclarados('¿Qué opciones ves con eso?');
  const sesion3 = fusionarSesion(sesion2, turno3);
  if (Object.keys(turno3).length !== 0) errores.push('turno3 inventó slots');
  if (sesion3.ciudad !== 'Bogotá' || sesion3.contacto_correo !== 'laura@correo.com') {
    errores.push('turno3 no reusó la sesión');
  }
  const textoSesion = serializarSesion(sesion3);
  if (!textoSesion.includes('Bogotá') || !textoSesion.includes('laura@correo.com')) {
    errores.push('serialización sin lo dicho');
  }
  if (textoSesion.toLowerCase().includes('celular:')) errores.push('serialización inventó celular');

  const filtros = acumularFiltros({
    previos: { ciudad: 'Bogotá', modalidad: 'virtual', programa_o_area: 'derecho' },
    delModelo: { ciudad: 'Medellín', modalidad: 'virtual' },
    textoUsuario: '¿Qué opciones ves con eso?',
    sesion: sesion3,
    aperturas: []
  });
  if (filtros.ciudad === 'Medellín') errores.push('aceptó una ciudad no dicha');
  if (filtros.ciudad !== 'Bogotá') errores.push('perdió la ciudad al reusar');
  if (filtros.modalidad !== 'virtual') errores.push('perdió la modalidad al reusar');

  const abierta = fusionarSesion(sesion3, {}, detectarAperturas('Me sirve cualquier ciudad'));
  if (abierta.ciudad) errores.push('no olvidó la ciudad cuando la abrió');
  if (abierta.modalidad !== 'virtual') errores.push('al abrir la ciudad borró la modalidad');
  const sinTelefono = extraerSlotsDeclarados('Mi presupuesto es de 2 millones');
  if (sinTelefono.contacto_celular) errores.push('leyó el presupuesto como celular');

  return errores;
}
