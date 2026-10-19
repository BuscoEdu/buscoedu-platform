/**
 * Presentación de resultados (T09) y ficha (T09b) del bot de WhatsApp · dueño: Frontend BuscoEdu.
 *
 * Qué hace: arma el mensaje de lista interactiva de resultados, la ficha de un programa con sus 3
 * botones y un texto de respaldo por si Meta rechaza la lista.
 * Por qué aquí y no en copy.ts: copy.ts (BE) declara que T09/T09b son de Frontend; aquí vive el
 * formato (límites de Meta, cortes, numeración). Los textos que ya existen en copy.ts (T16
 * beneficio, T17 precio, URL de Explorar) se importan de allí, no se duplican. Los textos de T09
 * que copy.ts no tiene se transcriben literal del brief (briefs/copy-bot-wa-v1.md; v1.3 y, desde el
 * 2026-10-19, v1.4: rango en página 2+, «Siguientes k de N programas», «Más información:»).
 *
 * Contrato que usa BE (orquestador.ts) — NO cambia:
 *   armarResultados(ofertasAgrupadas, total, pagina, consulta?) → { cuerpo, filas, botonTexto, seccion, pie? }
 *     - pagina en base 0; filas `oferta:{id}` numeradas desde pagina*8+1;
 *     - fila extra `menu:mas` («Ver más») solo si total > (pagina+1)*8; máx 10 filas.
 *   armarFicha(oferta) → { cuerpo, botones } con ids `lista:{id}`, `aplicar:{id}`, `menu:volver`.
 *   PROGRAMAS_POR_PAGINA = 8 (lo usa el orquestador para «Ver más» y para elegir por número).
 * Nuevo (opcional para BE): armarResultadosTexto(...) → texto de respaldo top 3 ≤600.
 *
 * Vacío ≠ error: con 0 ofertas NO se arma lista. Ese caso es T11 (copy.ts, t11SinResultados) y lo
 * decide el orquestador antes de llamar aquí. Si igual llega una página vacía, armarResultados
 * devuelve filas vacías y armarResultadosTexto el mismo encabezado sin líneas: nunca inventa filas.
 */

import { T17_PRECIO, URL_EXPLORAR, t16ConBeneficio } from './copy';
import type { BotonRespuesta, FilaLista } from './graph-client';
import type { OfertaAgrupadaWa } from './tipos';

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 1 · Límites de Meta y del formato FE aprobado.
 * Qué: todos los topes en un solo lugar (los usan las funciones y las pruebas).
 * Por qué: Meta rechaza el mensaje entero si se pasa un solo campo (filas 24/72, botón 20…).
 * ──────────────────────────────────────────────────────────────────────────── */

export const PROGRAMAS_POR_PAGINA = 8;
export const LIMITES = {
  /** Cuerpo de la lista: meta FE 300; límite duro de Meta 1024. */
  cuerpoLista: 300,
  cuerpoMeta: 1024,
  tituloFila: 24,
  descripcionFila: 72,
  botonLista: 20,
  seccion: 24,
  pie: 60,
  filas: 10,
  tituloBoton: 20,
  botones: 3,
  /** Ficha y texto de respaldo: ≤600 (criterio QA; Meta permite 1024 en mensajes con botones). */
  ficha: 600,
  textoRespaldo: 600
} as const;

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 2 · Textos de T09 (brief v1.3, literal) y etiquetas de botones T09b.
 * Qué: frases del mensaje de resultados que copy.ts no trae.
 * Por qué aquí: copy.ts dice que T09/T09b son de FE. Si BE las mueve a copy.ts, basta con importarlas.
 * ──────────────────────────────────────────────────────────────────────────── */

export const T09_BOTON_LISTA = 'Ver programas';
export const T09_SECCION = 'Programas vigentes';
export const T09_INDICACION = 'Toca *Ver programas* o escribe el número.';
export const T09_VER_MAS = 'Ver más';
// Copy v1.4 (2026-10-19): negrita solo en nombres y acciones («*Ver programas*» es una acción, se queda).
/** v1.4 · cuerpo de la página 2 en adelante: «Programas 9 a 12 de 12 👇». */
export function t09Rango(desde: number, hasta: number, total: number): string {
  return `Programas ${desde} a ${hasta} de ${total}`;
}
/** v1.4 · descripción de la fila «Ver más»: cuántos programas trae la página siguiente. */
export function t09VerMasDescripcion(k: number, total: number): string {
  return `Siguientes ${k} de ${total} programas`;
}
/** v1.4 · etiqueta del link de la ficha: hoy la URL es /explorar?q=…, no la ficha exacta (no decir «Ficha:»). */
export const T09B_MAS_INFORMACION = 'Más información:';
export const T09B_GUARDAR = 'Guardar en Mi lista';
export const T09B_APLICAR = 'Aplicar';
export const T09B_VER_OTROS = 'Ver otros';

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 3 · Utilidades de texto.
 * Qué: limpiar formato de WhatsApp, cortar por palabra y describir ciudades.
 * Por qué: los nombres vienen del catálogo; un «*» suelto rompería las negritas, y Meta exige
 * cortes exactos sin que el usuario vea palabras partidas.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Quita marcas de formato de WhatsApp (*, _, ~, `) y espacios repetidos de un texto del catálogo. */
export function limpiar(texto: string | null | undefined): string {
  return String(texto ?? '').replace(/[*_~`]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Corta a `max` caracteres en límite de palabra y agrega «…» (el «…» cuenta).
 * Si ni la primera palabra cabe, corte duro + «…». Nunca deja la palabra partida en otro caso.
 */
export function cortarPorPalabra(texto: string, max: number): string {
  const t = limpiar(texto);
  if (t.length <= max) return t;
  if (max <= 1) return '…'.slice(0, max);
  const base = t.slice(0, max - 1);
  // ¿El corte cae justo al final de una palabra? Entonces se puede conservar entera.
  const cortaEnLimite = t[max - 1] === ' ';
  const espacio = cortaEnLimite ? base.length : base.lastIndexOf(' ');
  const recorte = espacio > 0 ? base.slice(0, espacio) : base;
  return `${recorte.replace(/[\s·,;:.\-–]+$/, '')}…`;
}

/** Ciudades únicas, en el orden del catálogo (la primera es la principal). */
function ciudadesDe(o: OfertaAgrupadaWa): string[] {
  const lista = (o.ciudades?.length ? o.ciudades : o.ciudad ? [o.ciudad] : []).map(limpiar).filter(Boolean);
  return [...new Set(lista)];
}

/** «Bogotá», «Bogotá +1 ciudad», «Bogotá +3 ciudades» (formato T09). */
export function lugarCorto(ciudades: string[]): string {
  if (ciudades.length === 0) return '';
  const resto = ciudades.length - 1;
  return resto === 0 ? ciudades[0] : `${ciudades[0]} +${resto} ${resto === 1 ? 'ciudad' : 'ciudades'}`;
}

/** Cuenta emojis (pictogramas) para la regla «máx 1 por mensaje». */
export function contarEmojis(texto: string): number {
  return (texto.match(/\p{Extended_Pictographic}/gu) || []).length;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 4 · Filas de la lista.
 * Qué: título «N. Programa» ≤24 y descripción «universidad · modalidad · ciudad» ≤72.
 * Por qué: es lo único que el usuario ve al abrir la lista; el número permite elegir escribiendo.
 * Orden de recorte de la descripción (de menos a más importante): primero se quita la modalidad,
 * luego la ciudad y, al final, se corta la universidad por palabra. La universidad es lo que más
 * ayuda a distinguir dos programas con el mismo nombre.
 * ──────────────────────────────────────────────────────────────────────────── */

/*
 * Bloque 4a · Nivel abreviado en el título (QA ronda 2, MEDIA · copy Producto v1.5, 19/10/2026).
 * Qué: «Especialización en Gerencia…» → «Esp. Gerencia…» solo en el título de la fila.
 * Abreviaturas fijas de Producto: Esp. / Mtría. / Tec. / Tecnól. / Prof. (otros niveles no se tocan).
 * Por qué: con 24 caracteres, tres filas quedaban «Especialización en…» iguales; lo que distingue
 * (el área) va primero. El nivel completo va al inicio de la descripción y el nombre completo en la ficha.
 */
const ABREVIATURAS_NIVEL: Array<[RegExp, string, string]> = [
  // [patrón al inicio del nombre, abreviatura del título, nivel completo para la descripción]
  [/^especializaci[oó]n( en| de)?\s+/i, 'Esp. ', 'Especialización'],
  [/^maestr[ií]a( en| de)?\s+/i, 'Mtría. ', 'Maestría'],
  [/^t[eé]cnic[oa] profesional( en| de)?\s+/i, 'Tec. ', 'Técnico profesional'],
  [/^tecnolog[ií]a( en| de)?\s+/i, 'Tecnól. ', 'Tecnología'],
  [/^profesional en\s+/i, 'Prof. ', 'Profesional']
];

/** Nivel reconocido al inicio del nombre (o null): abreviatura + nombre completo del nivel. */
function nivelDe(nombre: string): { abreviado: string; nivel: string } | null {
  const t = limpiar(nombre);
  for (const [patron, abreviatura, nivel] of ABREVIATURAS_NIVEL) {
    if (!patron.test(t)) continue;
    const resto = t.replace(patron, '');
    // Solo se abrevia si queda algo después del nivel (nunca un título «Esp. » vacío).
    return resto ? { abreviado: `${abreviatura}${resto}`, nivel } : null;
  }
  return null;
}

/** Nombre con el nivel abreviado; si no empieza por un nivel conocido, queda igual. */
export function nombreCortoFila(nombre: string): string {
  return nivelDe(nombre)?.abreviado ?? limpiar(nombre);
}

/*
 * Bloque 4b · WA-fix-1b (QA ronda 4, MEDIA · cambio de BE en archivo FE, estrictamente necesario para el ítem
 * «títulos de fila»). Qué: si el nombre no cabe, (1) se quitan los conectores («de», «en», «y»…) y (2) se corta
 * por palabra sin dejar un conector colgando («Ingeniería de…» → «Ingeniería Sistemas…»). Si solo cabría la
 * abreviatura («Mtría…»), se usa el nombre sin nivel (el nivel ya va en la descripción). Nunca corta a media palabra.
 * Por qué: en el preview salían «Ingeniería de…» ×2 y «Esp. Neuropsicología…» ×3, sin saber cuál era cuál.
 */
const CONECTORES = new Set(['de', 'del', 'en', 'y', 'e', 'la', 'el', 'los', 'las', 'para', 'a', 'con', 'o', 'u', 'al', '-', '–']);

function sinConectores(texto: string): string {
  return texto
    .split(' ')
    .filter((w, i) => i === 0 || !CONECTORES.has(w.toLowerCase()))
    .join(' ');
}

/** Corte por palabra que además quita conectores sueltos al final («Gestión de…» → «Gestión…»). */
function cortarTitulo(texto: string, max: number): string {
  const t = limpiar(texto);
  if (t.length <= max) return t;
  let corte = cortarPorPalabra(t, max).replace(/…$/, '');
  const palabras = corte.split(' ');
  while (palabras.length > 1 && CONECTORES.has(palabras[palabras.length - 1].toLowerCase())) palabras.pop();
  corte = palabras.join(' ');
  return `${corte}…`;
}

export function tituloFila(numero: number, nombre: string): string {
  const prefijo = `${numero}. `;
  const max = LIMITES.tituloFila - prefijo.length;
  const corto = nombreCortoFila(nombre);
  const nivel = nivelDe(nombre);
  const candidatos = [corto, sinConectores(corto)];
  if (nivel) {
    const resto = limpiar(nombre).replace(ABREVIATURAS_NIVEL.find(([p]) => p.test(limpiar(nombre)))![0], '');
    candidatos.push(sinConectores(resto));
  }
  // Orden: (1) con nivel abreviado, entero; (2) el corte que conserve más texto, salvo que solo quede la
  // abreviatura («Mtría…»); (3) sin nivel (va en la descripción), entero o cortado.
  const [conNivel, conNivelSinConectores, sinNivel] = candidatos;
  for (const c of [conNivel, conNivelSinConectores]) if (c.length <= max) return `${prefijo}${c}`;
  const cortes = [conNivel, conNivelSinConectores].map((c) => cortarTitulo(c, max)).sort((x, y) => y.length - x.length);
  const util = cortes.find((r) => !(nivel && r.split(' ').length < 2));
  if (util) return `${prefijo}${util}`;
  if (sinNivel) return `${prefijo}${sinNivel.length <= max ? sinNivel : cortarTitulo(sinNivel, max)}`;
  return `${prefijo}${cortes[0]}`;
}

/*
 * Si el título abrevió el nivel, la descripción empieza por el nivel completo
 * («Especialización · Areandina · Virtual»), como pide Producto. Mismo orden de recorte de siempre:
 * primero sale la modalidad, luego la ciudad; si ni nivel + universidad caben, queda la de siempre.
 */
export function descripcionFila(o: OfertaAgrupadaWa, distinguir = false): string {
  const universidad = limpiar(o.universidad);
  const modalidad = limpiar(o.modalidad);
  // Si el catálogo trae «Virtual» como ciudad y también como modalidad, no se repite.
  const lugarCrudo = lugarCorto(ciudadesDe(o));
  const lugar = lugarCrudo.toLowerCase() === modalidad.toLowerCase() ? '' : lugarCrudo;
  const nivel = nivelDe(o.nombre)?.nivel;
  const conNivel = nivel
    ? [
        [nivel, universidad, modalidad, lugar],
        [nivel, universidad, lugar],
        [nivel, universidad]
      ]
    : [];
  // WA-fix-1b · si otra fila de la misma página tiene el mismo título, lo que distingue (modalidad y sede)
  // va primero, antes de la universidad, para que no se vean dos filas iguales.
  const distintivo = distinguir
    ? [
        [modalidad, lugar, nivel, universidad],
        [modalidad, lugar, universidad],
        [modalidad, lugar]
      ]
    : [];
  const intentos = [
    ...distintivo,
    ...conNivel,
    [universidad, modalidad, lugar],
    [universidad, lugar], // sin modalidad
    [universidad] // sin ciudad
  ];
  for (const partes of intentos) {
    const t = partes.filter(Boolean).join(' · ');
    if (t.length <= LIMITES.descripcionFila) return t;
  }
  return cortarPorPalabra(universidad, LIMITES.descripcionFila);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 5 · Encabezado de resultados (T09).
 * Qué: «Encontré N programas vigentes para «consulta». Te muestro k de N 👇» (o sin «de N» si N ≤ 8).
 * Por qué: N es el conteo real de BD (nunca las mostradas); 1 solo emoji; 0 URLs en el cuerpo.
 * ──────────────────────────────────────────────────────────────────────────── */

function textoPara(consulta: string, max: number): string {
  const q = cortarPorPalabra(consulta, max);
  return q ? ` para «${q}»` : '';
}

// v1.4: en la página 2+ (pagina ≥ 1) el encabezado es el rango «Programas desde a hasta de N»;
// la página 0 conserva el texto T09 de siempre.
function encabezado(total: number, k: number, consulta: string, conEmoji: boolean, pagina = 0): string {
  const para = textoPara(consulta, 60);
  const emoji = conEmoji ? ' 👇' : '';
  if (pagina >= 1) {
    const desde = pagina * PROGRAMAS_POR_PAGINA + 1;
    return `${t09Rango(desde, desde + Math.max(k, 1) - 1, total)}${emoji}`;
  }
  return total > PROGRAMAS_POR_PAGINA
    ? `Encontré ${total} programas vigentes${para}. Te muestro ${k} de ${total}${emoji}`
    : `Encontré ${total} programas vigentes${para}${emoji}`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 6 · Pie (footer de la lista, ≤60).
 * Qué: 1 link a Explorar con la consulta (URL_EXPLORAR de copy.ts), solo si hay más de una página.
 * Por qué: el brief pide el link en el footer cuando N > 8; si la consulta no cabe se acorta por
 * palabra y, si ni así, se usa Explorar sin consulta. Si ni eso cabe, no hay pie.
 * ──────────────────────────────────────────────────────────────────────────── */

export function pieResultados(total: number, consulta: string): string | undefined {
  if (total <= PROGRAMAS_POR_PAGINA) return undefined;
  // WA-fix-1b · el separador «·» de la etiqueta no es parte de la búsqueda: antes quedaba «?q=virtual%20%C2%B7».
  const palabras = limpiar(consulta).split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w));
  for (let n = palabras.length; n > 0; n--) {
    const pie = `${URL_EXPLORAR}?q=${encodeURIComponent(palabras.slice(0, n).join(' '))}`;
    if (pie.length <= LIMITES.pie) return pie;
  }
  return URL_EXPLORAR.length <= LIMITES.pie ? URL_EXPLORAR : undefined;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 7 · armarResultados (contrato BE).
 * Qué: 1 solo mensaje de lista: cuerpo ≤300, hasta 8 programas + «Ver más» (≤10 filas).
 * Por qué: «Ver más» solo si existe la página siguiente (mismo criterio que verMas del orquestador:
 * total > (pagina+1)*8), así nunca lleva a T18 por error.
 * ──────────────────────────────────────────────────────────────────────────── */

export function armarResultados(
  ofertasAgrupadas: OfertaAgrupadaWa[],
  total: number,
  pagina: number,
  consulta = ''
): { cuerpo: string; filas: FilaLista[]; botonTexto: string; seccion: string; pie?: string } {
  const p = Math.max(0, Math.floor(pagina || 0));
  const desde = p * PROGRAMAS_POR_PAGINA;
  const visibles = (ofertasAgrupadas || []).slice(0, PROGRAMAS_POR_PAGINA);
  // WA-fix-1b · títulos repetidos dentro de la página (sin el número) → descripción con modalidad/sede primero.
  const titulos = visibles.map((o, i) => tituloFila(desde + i + 1, o.nombre).replace(/^\d+\. /, ''));
  const filas: FilaLista[] = visibles.map((o, i) => ({
    id: `oferta:${o.id}`,
    titulo: tituloFila(desde + i + 1, o.nombre),
    descripcion: descripcionFila(o, titulos.filter((t) => t === titulos[i]).length > 1)
  }));
  // v1.4: la fila «Ver más» dice cuántos programas trae la página siguiente: k = min(8, N - (pagina+1)*8).
  const siguientes = Math.min(PROGRAMAS_POR_PAGINA, total - (p + 1) * PROGRAMAS_POR_PAGINA);
  if (siguientes > 0) {
    filas.push({ id: 'menu:mas', titulo: T09_VER_MAS, descripcion: cortarPorPalabra(t09VerMasDescripcion(siguientes, total), LIMITES.descripcionFila) });
  }

  // Página 0: T09 + indicación. Página 2+ (v1.4): solo el rango «Programas X a Y de N 👇».
  let cuerpo = p >= 1 ? encabezado(total, visibles.length, consulta, true, p) : `${encabezado(total, visibles.length, consulta, true)}\n${T09_INDICACION}`;
  // Respaldo: si la consulta es muy larga y el cuerpo se pasa de 300, se quita «para «…»».
  if (cuerpo.length > LIMITES.cuerpoLista) cuerpo = `${encabezado(total, visibles.length, '', true)}\n${T09_INDICACION}`;

  const pie = pieResultados(total, consulta);
  return {
    cuerpo,
    filas: filas.slice(0, LIMITES.filas),
    botonTexto: T09_BOTON_LISTA,
    seccion: T09_SECCION,
    ...(pie ? { pie } : {})
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 8 · armarResultadosTexto (respaldo si la lista falla, C-39).
 * Qué: top 3 en texto plano ≤600, sin URLs, numerado como la lista, con «escribe *más*» solo si
 * hay página siguiente.
 * Por qué: si Meta rechaza la lista, el usuario igual puede elegir por número. El orquestador
 * (BE) la usa como único respaldo de texto desde PR #69; reemplazó a textoRespaldoResultados.
 * ──────────────────────────────────────────────────────────────────────────── */

export function armarResultadosTexto(ofertasAgrupadas: OfertaAgrupadaWa[], total: number, pagina: number, consulta = ''): string {
  const p = Math.max(0, Math.floor(pagina || 0));
  const desde = p * PROGRAMAS_POR_PAGINA;
  const top = (ofertasAgrupadas || []).slice(0, 3);
  const hayMas = total > (p + 1) * PROGRAMAS_POR_PAGINA;
  const cierre = `Escribe el número para ver la ficha${hayMas ? ' o escribe *más*' : ''}.`;
  const armar = (maxNombre: number, q: string) => {
    const lineas = top.map((o, i) => `${desde + i + 1}. *${cortarPorPalabra(o.nombre, maxNombre)}*\n${descripcionFila(o)}`);
    // v1.4: en la página 2+ el encabezado es el rango de los que se listan aquí («Programas 9 a 11 de 12:»).
    return [`${encabezado(total, top.length, q, false, p)}:`, ...lineas, cierre].join('\n');
  };
  // Se acorta primero el nombre y luego se quita la consulta hasta caber en 600.
  for (const maxNombre of [120, 80, 50, 30]) {
    const t = armar(maxNombre, consulta);
    if (t.length <= LIMITES.textoRespaldo) return t;
  }
  return armar(30, '').slice(0, LIMITES.textoRespaldo);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Bloque 9 · armarFicha (T09b, contrato BE).
 * Qué: nombre completo en negrita, detalle (universidad · modalidad · nivel · ciudades), beneficio
 * (T16 de copy.ts), precio (T17 de copy.ts) y 1 link con «Más información:» (v1.4: la URL hoy es
 * /explorar?q=…, no la ficha exacta). Botones [Guardar en Mi lista]
 * [Aplicar] [Ver otros] con ids `lista:{id}`, `aplicar:{id}`, `menu:volver`.
 * Por qué: guardar ≠ aplicar (2 botones distintos) y la URL nunca se corta: si no cabe en 600, se
 * acortan primero el beneficio, luego las ciudades y por último el nombre.
 * ──────────────────────────────────────────────────────────────────────────── */

function ciudadesFicha(ciudades: string[], max: number): string {
  if (ciudades.length <= max) return ciudades.join(', ');
  const resto = ciudades.length - max;
  return `${ciudades.slice(0, max).join(', ')} +${resto} ${resto === 1 ? 'ciudad' : 'ciudades'}`;
}

export function armarFicha(oferta: OfertaAgrupadaWa): { cuerpo: string; botones: BotonRespuesta[] } {
  const url = String(oferta.url || '').trim();
  const ciudades = ciudadesDe(oferta);
  const armar = (maxNombre: number, maxCiudades: number, maxBeneficio: number) => {
    const detalle = [limpiar(oferta.universidad), limpiar(oferta.modalidad), limpiar(oferta.nivel), ciudadesFicha(ciudades, maxCiudades)]
      .filter(Boolean)
      .join(' · ');
    const beneficio = limpiar(oferta.beneficio) && maxBeneficio > 0 ? t16ConBeneficio(cortarPorPalabra(oferta.beneficio!, maxBeneficio)) : '';
    // WA-fix-1 (MEDIA) · precio publicable de BE si viene; si no, T17 (nunca un precio inventado).
    const precio = limpiar(oferta.texto_precio) || T17_PRECIO;
    // WA-fix-1b · S13 · duración del catálogo si viene (mismo rótulo «Duración:» que la ficha web).
    const duracion = limpiar(oferta.duracion) ? `Duración: ${limpiar(oferta.duracion)}` : '';
    return [`*${cortarPorPalabra(oferta.nombre, maxNombre)}*`, detalle, duracion, beneficio, precio, url ? `${T09B_MAS_INFORMACION} ${url}` : '']
      .filter(Boolean)
      .join('\n');
  };
  let cuerpo = '';
  for (const [n, c, b] of [[200, 5, 200], [200, 5, 100], [200, 3, 100], [120, 3, 60], [80, 2, 40], [60, 1, 0]] as const) {
    cuerpo = armar(n, c, b);
    if (cuerpo.length <= LIMITES.ficha) break;
  }
  return {
    cuerpo,
    botones: [
      { id: `lista:${oferta.id}`, titulo: T09B_GUARDAR },
      { id: `aplicar:${oferta.id}`, titulo: T09B_APLICAR },
      { id: 'menu:volver', titulo: T09B_VER_OTROS }
    ]
  };
}
