/**
 * BA-030: el hilo de Demo WApp solo muestra texto de conversación.
 * Estas frases pertenecen al portal (Explorar, filtros, vistas) y no
 * deben volverse enlace, botón ni atajo fuera del chat.
 */
const PATRONES_ATAJO_WEB = [
  String.raw`\/explorar\b`,
  String.raw`\bexplorar\s+resultados\b`,
  String.raw`\bexplorar\s+ofertas?\b`,
  String.raw`\bir\s+a\s+explorar\b`,
  String.raw`\bver\s+filtros\b`,
  String.raw`\babrir\s+filtros\b`,
  String.raw`\bquitar\s+vista\b`
];

/**
 * Viñeta corta de NaIA (`-` o `•`). Eso sí puede ser una respuesta rápida.
 * Una línea `1. …` se queda en la prosa: BA-031 numera así los permisos
 * de consentimiento, y el párrafo de abajo pertenece a ese permiso.
 */
const LINEA_OPCION = /^\s*[-•]\s+(.+?)\s*$/;

/** Marca de viñeta que quedó vacía al quitar un atajo web. */
const LINEA_VACIA = /^\s*[-•]\s*$/;

export interface BurbujaHilo {
  cuerpo: string;
  opciones: string[];
}

export interface TrozoTexto {
  fuerte: boolean;
  texto: string;
}

function patronWeb(flags: string) {
  return new RegExp(PATRONES_ATAJO_WEB.join('|'), flags);
}

/** BA-030: true si la frase pide salir al portal web. */
export function esAtajoWeb(texto: string) {
  const limpio = texto.trim();
  if (!limpio) return false;
  return patronWeb('i').test(limpio);
}

/**
 * BA-030: saca del texto visible los llamados a Explorar y a filtros.
 * No reescribe el mensaje guardado; solo lo que pinta el hilo.
 */
export function quitarAtajosWeb(texto: string) {
  const sinAtajos = texto.replace(patronWeb('gi'), '');
  return sinAtajos
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * BA-030: separa la prosa de las opciones.
 * Las opciones se responden dentro del hilo (como un reply de WhatsApp).
 * Como máximo tres, para no armar una grilla de portal.
 */
export function prepararBurbuja(contenido: string, sugerida?: string | null): BurbujaHilo {
  const sinWeb = quitarAtajosWeb(contenido || '');
  const cuerpo: string[] = [];
  const opciones: string[] = [];

  sinWeb.split('\n').forEach((linea) => {
    if (LINEA_VACIA.test(linea)) return;
    const coincidencia = linea.match(LINEA_OPCION);
    if (!coincidencia) {
      cuerpo.push(linea);
      return;
    }

    const opcion = coincidencia[1].replace(/\*\*/g, '').trim();
    if (!opcion || esAtajoWeb(opcion) || opciones.includes(opcion)) return;
    opciones.push(opcion);
  });

  const extra = (sugerida || '').replace(/\*\*/g, '').trim();
  const prosa = cuerpo.join('\n').trim();
  const yaEsta =
    !extra ||
    esAtajoWeb(extra) ||
    extra.length > 80 ||
    opciones.includes(extra) ||
    prosa.toLowerCase().includes(extra.toLowerCase());

  if (!yaEsta) opciones.push(extra);

  return {
    cuerpo: prosa,
    opciones: opciones.slice(0, 3)
  };
}

/** Negrita **así**, el mismo markdown corto que NaIA ya usa en el mensaje. */
export function trozosMarkdown(texto: string): TrozoTexto[] {
  return texto
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((parte) =>
      parte.startsWith('**') && parte.endsWith('**') && parte.length > 4
        ? { fuerte: true, texto: parte.slice(2, -2) }
        : { fuerte: false, texto: parte }
    );
}

/**
 * BA-030: la ficha de la oferta vive en el hilo.
 * El placeholder "Oferta" no es un nombre real y no se pinta.
 */
export function ofertaVisibleEnHilo(nombre?: string | null) {
  const limpio = (nombre || '').trim();
  if (!limpio || limpio.toLowerCase() === 'oferta') return null;
  return limpio;
}
