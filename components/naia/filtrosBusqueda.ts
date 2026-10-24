/**
 * Filtros de una búsqueda escrita en Explorar / NaIA.
 * Puro: no llama a NaIA ni al catálogo. Los tests cubren el caso
 * en que NaIA no devuelve filtros y el panel no debe mostrar todo el catálogo.
 */

export interface FiltrosBusqueda {
  programa_o_area?: string;
  modalidad?: string;
  ciudad?: string;
  pais?: string;
  nivel_academico?: string;
  tipo_beneficio?: string;
  universidad?: string;
}

export function plegarTexto(valor: string): string {
  return valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * El nivel de una consulta anterior vive en el estado (y se reenvía en el
 * contexto). Si esta frase no lo repite, no se vuelve a aplicar: un nivel
 * que no está en el catálogo, o que choca con el programa pedido, deja el
 * panel en cero.
 */
export function filtrosDeEstaConsulta(filtros: FiltrosBusqueda, texto: string): FiltrosBusqueda {
  const siguientes: FiltrosBusqueda = { ...filtros };
  const nivel = (siguientes.nivel_academico ?? "").trim();
  if (!nivel) return siguientes;
  const dicho = plegarTexto(texto);
  const pedido = plegarTexto(nivel);
  const claves = ["pregrado", "posgrado", "tecnico", "tecnologo", "especializacion", "maestria", "doctorado", "continua"];
  const loDice =
    (pedido.length >= 3 && dicho.includes(pedido)) ||
    claves.some((clave) => pedido.includes(clave) && dicho.includes(clave));
  if (!loDice) delete siguientes.nivel_academico;
  return siguientes;
}

function hayAlgunFiltro(filtros: FiltrosBusqueda): boolean {
  return Object.values(filtros).some((valor) => typeof valor === "string" && valor.trim().length > 0);
}

/**
 * Filtros que se aplican al catálogo después de una frase del estudiante.
 * Si NaIA no devolvió ningún filtro (fallo, respuesta vacía), el texto escrito
 * se busca como programa o área. Así `?q=salud` no puede devolver el catálogo
 * completo (las 291 ofertas vigentes) como si la búsqueda no existiera.
 */
export function filtrosEfectivosDeBusqueda(filtrosNaia: FiltrosBusqueda, texto: string): FiltrosBusqueda {
  const deEsta = filtrosDeEstaConsulta(filtrosNaia, texto);
  if (hayAlgunFiltro(deEsta)) return deEsta;
  const q = texto.trim();
  if (!q) return deEsta;
  return { programa_o_area: q };
}
