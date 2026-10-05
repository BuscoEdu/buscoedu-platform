/**
 * Pinta el markdown corto de NaIA (negrita, cursiva, listas).
 * React escapa el texto: no se inserta HTML del modelo.
 */

import { bloquesDeMarkdown, type TrozoInline } from "./naiaMarkdownParse";

function Trozo({ trozo }: { trozo: TrozoInline }) {
  if (trozo.fuerte) return <strong className="font-semibold">{trozo.texto}</strong>;
  if (trozo.enfasis) return <em>{trozo.texto}</em>;
  return <>{trozo.texto}</>;
}

export default function NaiaMarkdown({
  texto,
  className = "",
}: {
  texto: string;
  className?: string;
}) {
  const bloques = bloquesDeMarkdown(texto);
  if (!bloques.length) return null;

  return (
    <div className={`space-y-2 leading-relaxed ${className}`}>
      {bloques.map((bloque, indice) => {
        if (bloque.tipo === "lista") {
          const Lista = bloque.ordenada ? "ol" : "ul";
          return (
            <Lista
              key={`lista-${indice}`}
              className={bloque.ordenada ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}
            >
              {bloque.items.map((item, itemIndice) => (
                <li key={`item-${indice}-${itemIndice}`}>
                  {item.map((trozo, trozoIndice) => (
                    <Trozo key={`t-${indice}-${itemIndice}-${trozoIndice}`} trozo={trozo} />
                  ))}
                </li>
              ))}
            </Lista>
          );
        }
        return (
          <p key={`p-${indice}`} className="whitespace-pre-line">
            {bloque.trozos.map((trozo, trozoIndice) => (
              <Trozo key={`p-${indice}-${trozoIndice}`} trozo={trozo} />
            ))}
          </p>
        );
      })}
    </div>
  );
}
