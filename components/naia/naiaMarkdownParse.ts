/**
 * Markdown corto de las respuestas de NaIA.
 * Negrita, cursiva y listas. El componente pinta esto; no hay HTML crudo.
 */

export type TrozoInline = {
  texto: string;
  fuerte?: boolean;
  enfasis?: boolean;
};

export type BloqueMarkdown =
  | { tipo: "parrafo"; trozos: TrozoInline[] }
  | { tipo: "lista"; ordenada: boolean; items: TrozoInline[][] };

/** Parte **negrita** y *cursiva* sin tocar el resto de la línea. */
export function trozosInline(linea: string): TrozoInline[] {
  const partes = linea.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).filter((parte) => parte.length > 0);
  return partes.map((parte) => {
    if (parte.startsWith("**") && parte.endsWith("**") && parte.length > 4) {
      return { texto: parte.slice(2, -2), fuerte: true };
    }
    if (parte.startsWith("*") && parte.endsWith("*") && parte.length > 2) {
      return { texto: parte.slice(1, -1), enfasis: true };
    }
    return { texto: parte };
  });
}

/** Párrafos y listas. Una línea en blanco cierra el bloque anterior. */
export function bloquesDeMarkdown(texto: string): BloqueMarkdown[] {
  const lineas = (texto || "").replace(/\r\n/g, "\n").split("\n");
  const bloques: BloqueMarkdown[] = [];
  let parrafo: string[] = [];
  let lista: { ordenada: boolean; items: string[] } | null = null;

  const cerrarParrafo = () => {
    const plano = parrafo.join("\n").trim();
    parrafo = [];
    if (!plano) return;
    bloques.push({ tipo: "parrafo", trozos: trozosInline(plano) });
  };

  const cerrarLista = () => {
    if (!lista || lista.items.length === 0) {
      lista = null;
      return;
    }
    bloques.push({
      tipo: "lista",
      ordenada: lista.ordenada,
      items: lista.items.map((item) => trozosInline(item)),
    });
    lista = null;
  };

  for (const linea of lineas) {
    const marca = linea.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
    if (marca) {
      cerrarParrafo();
      const ordenada = /^\d+\./.test(marca[2]);
      if (!lista || lista.ordenada !== ordenada) {
        cerrarLista();
        lista = { ordenada, items: [] };
      }
      lista.items.push(marca[3]);
      continue;
    }
    if (linea.trim() === "") {
      cerrarParrafo();
      cerrarLista();
      continue;
    }
    cerrarLista();
    parrafo.push(linea);
  }

  cerrarParrafo();
  cerrarLista();
  return bloques;
}
