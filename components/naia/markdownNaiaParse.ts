/**
 * Parser del markdown corto de NaIA. No genera HTML: solo datos.
 * Un marcador sin cerrar no se devuelve; así no se ven los asteriscos.
 */

export type Trozo =
  | { tipo: "texto"; texto: string }
  | { tipo: "fuerte"; texto: string }
  | { tipo: "cursiva"; texto: string }
  | { tipo: "enlace"; texto: string; href: string };

export type Bloque =
  | { tipo: "parrafo"; trozos: Trozo[] }
  | { tipo: "lista"; ordenada: boolean; items: Trozo[][] };

function esEnlaceSeguro(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function trozosDeLinea(linea: string): Trozo[] {
  const trozos: Trozo[] = [];
  let i = 0;

  const empujarTexto = (texto: string) => {
    if (!texto) return;
    const ultimo = trozos[trozos.length - 1];
    if (ultimo?.tipo === "texto") ultimo.texto += texto;
    else trozos.push({ tipo: "texto", texto });
  };

  while (i < linea.length) {
    const resto = linea.slice(i);
    const enlace = resto.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (enlace) {
      let consumido = enlace[0].length;
      const abiertos = (enlace[2].match(/\(/g) || []).length;
      const cerrados = (enlace[2].match(/\)/g) || []).length;
      if (abiertos > cerrados && linea[i + consumido] === ")") consumido += 1;
      if (esEnlaceSeguro(enlace[2])) {
        trozos.push({ tipo: "enlace", texto: enlace[1], href: enlace[2] });
      } else {
        empujarTexto(enlace[1]);
      }
      i += consumido;
      continue;
    }

    if (resto.startsWith("**")) {
      const fin = resto.indexOf("**", 2);
      if (fin === -1) {
        empujarTexto(resto.slice(2));
        break;
      }
      trozos.push({ tipo: "fuerte", texto: resto.slice(2, fin) });
      i += fin + 2;
      continue;
    }

    if (resto.startsWith("*") || resto.startsWith("_")) {
      const marca = resto[0];
      const fin = resto.indexOf(marca, 1);
      if (fin === -1) {
        empujarTexto(resto.slice(1));
        break;
      }
      trozos.push({ tipo: "cursiva", texto: resto.slice(1, fin) });
      i += fin + 1;
      continue;
    }

    const corte = resto.slice(1).search(/\[|\*\*|\*|_/);
    const hasta = corte === -1 ? resto.length : corte + 1;
    empujarTexto(resto.slice(0, hasta));
    i += hasta;
  }

  return trozos;
}

export function bloquesDe(texto: string): Bloque[] {
  const lineas = texto.replace(/\r\n/g, "\n").split("\n");
  const bloques: Bloque[] = [];
  let parrafo: string[] = [];
  let lista: { ordenada: boolean; items: string[] } | null = null;

  const cerrarParrafo = () => {
    const unido = parrafo.join("\n").trim();
    parrafo = [];
    if (!unido) return;
    bloques.push({ tipo: "parrafo", trozos: trozosDeLinea(unido) });
  };

  const cerrarLista = () => {
    if (!lista) return;
    bloques.push({
      tipo: "lista",
      ordenada: lista.ordenada,
      items: lista.items.map((item) => trozosDeLinea(item))
    });
    lista = null;
  };

  for (const linea of lineas) {
    const vineta = linea.match(/^\s*[-*•]\s+(.+)$/);
    const numerada = linea.match(/^\s*\d+\.\s+(.+)$/);
    if (vineta || numerada) {
      cerrarParrafo();
      const ordenada = Boolean(numerada);
      const item = (vineta ?? numerada)![1];
      if (!lista || lista.ordenada !== ordenada) {
        cerrarLista();
        lista = { ordenada, items: [] };
      }
      lista.items.push(item);
      continue;
    }
    cerrarLista();
    if (!linea.trim()) {
      cerrarParrafo();
      continue;
    }
    parrafo.push(linea);
  }
  cerrarLista();
  cerrarParrafo();
  return bloques;
}
