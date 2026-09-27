/**
 * BA-015: copy visible de NaIA.
 * El saneo de tono a veces parte el saludo y deja «¡Qué He filtrado…».
 * Aquí se reescribe esa frase antes de mostrarla o guardarla.
 */

function capitalizarHeFiltrado(frase: string): string {
  return frase.replace(/^he\b/i, (match) => (match[0] === "H" ? match : "He"));
}

export function repararCopyFiltrado(texto: string): string {
  if (!texto) return "";

  // «¡Qué He filtrado…» al inicio de la respuesta o de un párrafo.
  let salida = texto.replace(
    /(^|[\n])(\s*)(?:¡\s*)?qu[eé]\s*[,!.]?\s+(he\s+filtrado\b)/gi,
    (_match, corte: string, espacios: string, frase: string) =>
      `${corte}${espacios}${capitalizarHeFiltrado(frase)}`
  );

  // La misma frase partida a mitad de la respuesta.
  salida = salida.replace(
    /(?:¡\s*)?qu[eé]\s*[,!.]?\s+(he\s+filtrado\b)/gi,
    (_match, frase: string) => capitalizarHeFiltrado(frase)
  );

  // Residuo «¡!» si el saludo se recortó y quedó el verbo.
  salida = salida.replace(
    /(^|[\n])(\s*)¡+\s*[!.]?\s*(he\s+filtrado\b)/gi,
    (_match, corte: string, espacios: string, frase: string) =>
      `${corte}${espacios}${capitalizarHeFiltrado(frase)}`
  );

  return salida.replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * BA-011 / BA-004: un catálogo sin filtros y con 0 filas es vigencia,
 * no un fallo técnico ni el vacío de “aún no buscaste”.
 */
export const COPY_CERO_VIGENCIA =
  "No hay ofertas vigentes en este momento. Solo mostramos opciones activas, publicadas, validadas y con vigencia abierta. Si una opción ya se venció, no aparece hasta que se renueve. Esto no es un fallo de la búsqueda.";
