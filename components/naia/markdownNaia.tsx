/**
 * Markdown corto de las burbujas de NaIA.
 * Solo crea nodos de React: el texto se escapa y no hay HTML crudo.
 * Cubre negrita, cursiva, listas, saltos de línea y enlaces http(s).
 */

import type { ReactNode } from "react";
import { bloquesDe, type Trozo } from "@/components/naia/markdownNaiaParse";

function pintarTrozos(trozos: Trozo[], clave: string): ReactNode[] {
  return trozos.map((trozo, indice) => {
    const id = `${clave}-${indice}`;
    if (trozo.tipo === "fuerte") return <strong key={id}>{trozo.texto}</strong>;
    if (trozo.tipo === "cursiva") return <em key={id}>{trozo.texto}</em>;
    if (trozo.tipo === "enlace") {
      return (
        <a
          key={id}
          href={trozo.href}
          className="underline decoration-2 underline-offset-2"
          rel="noopener noreferrer"
          target="_blank"
        >
          {trozo.texto}
        </a>
      );
    }
    return <span key={id}>{trozo.texto}</span>;
  });
}

/** Pinta el markdown. El color lo hereda la burbuja (banda + tinta, AA). */
export default function MarkdownNaia({ texto }: { texto: string }) {
  const bloques = bloquesDe(texto);
  if (bloques.length === 0) return null;

  return (
    <div className="space-y-2 text-base leading-relaxed">
      {bloques.map((bloque, indice) => {
        if (bloque.tipo === "lista") {
          const Lista = bloque.ordenada ? "ol" : "ul";
          return (
            <Lista
              key={`b-${indice}`}
              className={bloque.ordenada ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}
            >
              {bloque.items.map((item, itemIndice) => (
                <li key={`b-${indice}-${itemIndice}`}>{pintarTrozos(item, `i-${indice}-${itemIndice}`)}</li>
              ))}
            </Lista>
          );
        }
        return <p key={`b-${indice}`}>{pintarTrozos(bloque.trozos, `p-${indice}`)}</p>;
      })}
    </div>
  );
}
