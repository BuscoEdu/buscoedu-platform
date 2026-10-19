/**
 * Búsqueda del bot de WhatsApp: del texto del estudiante a filtros del catálogo · lote Ola 1/2.
 *
 * Qué: limpia stopwords y emojis, extrae ciudad / modalidad / nivel, corrige tildes y errores comunes
 * («sicologia» → «Psicología») y aplica sinónimos («preescolar» → «Educación»).
 * Por qué: la búsqueda en BD usa ilike, que distingue tildes; el texto completo («quiero algo de sicologia»)
 * no coincidía con nada y casi todo terminaba en «No encontré» (QA S6–S17, BD, C-05/C-06).
 * Cada búsqueda nueva arma sus filtros SOLO con lo que dice el mensaje actual (C-04: antes se arrastraban
 * ciudad/modalidad de la búsqueda anterior y la misma consulta daba resultados distintos).
 */

import { extraerSlotsDeclarados } from '../../../lib/agentes/vozNaia';
import { plegarComando } from './comandos';
import { quitarEmojis } from './intenciones';
import type { FiltrosBusquedaWa } from './tipos';

// Bloque: palabras que no describen un programa. Se quitan antes de buscar.
const STOPWORDS = new Set([
  'quiero', 'quisiera', 'busco', 'buscar', 'buscando', 'estudiar', 'estudio', 'me', 'gustaria', 'gusta', 'interesa',
  'algo', 'sobre', 'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'en', 'y', 'o', 'a', 'para', 'por', 'con',
  'programa', 'programas', 'carrera', 'carreras', 'curso', 'cursos', 'opciones', 'hay', 'tienen', 'tiene', 'que', 'mi',
  'yo', 'hola', 'porfa', 'favor', 'gracias', 'info', 'informacion', 'universidad', 'estudios', 'area', 'modalidad',
  'virtual', 'virtuales', 'presencial', 'presenciales', 'online', 'linea', 'distancia', 'hibrida', 'hibrido',
  'maestria', 'maestrias', 'magister', 'especializacion', 'especializaciones', 'doctorado', 'pregrado', 'posgrado',
  'postgrado', 'tecnico', 'tecnologo', 'profesional', 'beca', 'becas', 'ciudad', 'puede', 'ser', 'cerca'
]);

/**
 * Bloque: términos canónicos (con tilde, como están en el catálogo) y sus variantes/sinónimos sin tilde.
 * Por qué con tilde: ilike en BD distingue «psicologia» de «Psicología».
 * «educación / preescolar / pedagogía / docencia» → «Educación» (C-58): en el catálogo real no hay preescolar;
 * así el estudiante ve lo más cercano que SÍ existe (p. ej. Maestría en Educación) o T11. Nunca se inventa programa.
 */
const CANONICOS: Array<{ termino: string; variantes: string[] }> = [
  { termino: 'Psicología', variantes: ['psicologia', 'sicologia', 'psicologo', 'psicologa', 'psicolojia'] },
  { termino: 'Ingeniería', variantes: ['ingenieria', 'injenieria', 'ingeniero', 'ingenieria de'] },
  { termino: 'Administración', variantes: ['administracion', 'administrar', 'adminitracion', 'administracion de empresas'] },
  { termino: 'Educación', variantes: ['educacion', 'preescolar', 'pedagogia', 'docencia', 'licenciatura', 'profesor', 'docente', 'educacion infantil'] },
  { termino: 'Sistemas', variantes: ['sistemas', 'informatica', 'computacion', 'software', 'programacion'] },
  { termino: 'Derecho', variantes: ['derecho', 'leyes', 'abogado', 'abogada'] },
  { termino: 'Medicina', variantes: ['medicina', 'medico'] },
  { termino: 'Enfermería', variantes: ['enfermeria', 'enfermero', 'enfermera'] },
  { termino: 'Contaduría', variantes: ['contaduria', 'contabilidad', 'contador', 'contadora'] },
  { termino: 'Comunicación', variantes: ['comunicacion', 'comunicacion social', 'periodismo'] },
  { termino: 'Mercadeo', variantes: ['mercadeo', 'marketing', 'mercadotecnia'] },
  { termino: 'Diseño', variantes: ['diseno', 'disenador', 'disenadora'] },
  { termino: 'Gestión', variantes: ['gestion'] },
  { termino: 'Economía', variantes: ['economia', 'economista'] },
  { termino: 'Finanzas', variantes: ['finanzas', 'financiera'] },
  { termino: 'Gerencia', variantes: ['gerencia', 'gerente'] },
  { termino: 'Tecnología', variantes: ['tecnologia'] },
  { termino: 'Arquitectura', variantes: ['arquitectura', 'arquitecto'] },
  { termino: 'Salud', variantes: ['salud'] },
  { termino: 'Proyectos', variantes: ['proyectos'] },
  { termino: 'Negocios', variantes: ['negocios', 'negocio', 'empresas', 'empresa'] }
];

const POR_VARIANTE = new Map<string, string>();
for (const c of CANONICOS) for (const v of c.variantes) POR_VARIANTE.set(v, c.termino);

// Bloque: distancia de edición acotada (tolerancia a errores de tipeo: «psicolgia», «administarcion»).
function distancia(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previa = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    let minimo = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(previa[j] + 1, fila[j - 1] + 1, previa[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      fila.push(v);
      if (v < minimo) minimo = v;
    }
    if (minimo > max) return max + 1;
    previa = fila;
  }
  return previa[b.length];
}

/** Término canónico de una palabra (exacta, variante o con 1–2 errores de tipeo); null si no se reconoce. */
export function canonico(palabra: string): string | null {
  const p = plegarComando(palabra);
  if (!p) return null;
  const exacto = POR_VARIANTE.get(p);
  if (exacto) return exacto;
  if (p.length < 5) return null;
  const max = p.length >= 8 ? 2 : 1;
  let mejor: { termino: string; d: number } | null = null;
  for (const [variante, termino] of POR_VARIANTE) {
    if (variante.includes(' ')) continue;
    const d = distancia(p, variante, max);
    if (d <= max && (!mejor || d < mejor.d)) mejor = { termino, d };
  }
  return mejor?.termino ?? null;
}

/**
 * Bloque: texto → término de programa/área para ilike.
 * Si hay un término reconocido, se usa SOLO ese (con tilde). Si no, la frase sin stopwords
 * (construirTerminosBusqueda la parte en palabras). Nunca la frase completa con «quiero estudiar…».
 */
export function terminoPrograma(texto: string, excluir: string[] = []): string | null {
  const fuera = new Set(excluir.flatMap((e) => plegarComando(e).split(' ')).filter(Boolean));
  // Se conserva la forma original de cada palabra (con tilde) para palabras no reconocidas:
  // «mecatrónica» debe seguir siendo «mecatrónica» en el ilike, no «mecatronica».
  const tokens = quitarEmojis(texto)
    .split(/[^\p{L}\p{N}]+/u)
    .map((original) => ({ original: original.toLowerCase(), plegado: plegarComando(original) }))
    .filter((t) => t.plegado && !STOPWORDS.has(t.plegado) && !fuera.has(t.plegado));
  if (tokens.length === 0) return null;
  // Frases de dos palabras reconocidas («comunicacion social», «educacion infantil»).
  for (let i = 0; i < tokens.length - 1; i++) {
    const doble = POR_VARIANTE.get(`${tokens[i].plegado} ${tokens[i + 1].plegado}`);
    if (doble) return doble;
  }
  for (const t of tokens) {
    const c = canonico(t.plegado);
    if (c) return c;
  }
  const frase = tokens.filter((t) => t.plegado.length >= 3).map((t) => t.original).join(' ').slice(0, 60);
  return frase || null;
}

/** Filtros del catálogo a partir SOLO del mensaje actual (C-04). Etiqueta = lo que se muestra en «para «…»». */
export function filtrosDesdeTexto(texto: string): { filtros: FiltrosBusquedaWa; etiqueta: string } {
  const limpio = quitarEmojis(texto);
  const slots = extraerSlotsDeclarados(limpio);
  const filtros: FiltrosBusquedaWa = {};
  if (slots.ciudad) filtros.ciudad = slots.ciudad;
  if (slots.modalidad && slots.modalidad !== 'virtual o presencial') filtros.modalidad = slots.modalidad;
  if (slots.nivel) filtros.nivel_academico = slots.nivel;
  const termino = terminoPrograma(limpio, slots.ciudad ? [slots.ciudad] : []);
  if (termino) filtros.programa_o_area = termino;
  const etiqueta = [filtros.nivel_academico, termino, filtros.modalidad, filtros.ciudad].filter(Boolean).join(' · ') || limpio.slice(0, 40);
  return { filtros, etiqueta: etiqueta.slice(0, 60) };
}

export function filtrosVacios(f: FiltrosBusquedaWa): boolean {
  return !f.programa_o_area && !f.ciudad && !f.modalidad && !f.nivel_academico;
}
