"use client";

import { useEffect, useRef, useState } from "react";
import type { LogoAliada } from "@/src/lib/logos-aliadas";

/**
 * Franja de logos reales. Lista vacía o todas las URL rotas: no se pinta,
 * sin hueco y sin icono roto. Cada alt es el nombre de la universidad.
 * Las celdas miden igual para no destacar a una aliada.
 */

function logoPintable(logo: LogoAliada): boolean {
  if (!logo || typeof logo.alt !== "string" || logo.alt.trim().length === 0) return false;
  if (typeof logo.url !== "string") return false;
  try {
    const parsed = new URL(logo.url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export default function LogoStrip({ logos }: { logos: LogoAliada[] }) {
  const candidatos = logos.filter(logoPintable);
  const [rotos, setRotos] = useState<Record<string, true>>({});
  const imagenes = useRef<Record<string, HTMLImageElement | null>>({});

  const clave = (logo: LogoAliada, indice: number) => `${indice}:${logo.url}`;

  /*
   * Una imagen que falla antes de hidratar no dispara onError.
   * Al montar, si el navegador ya la dio por terminada y no tiene píxeles,
   * se marca rota con el mismo estado que usa onError.
   */
  useEffect(() => {
    const detectados: Record<string, true> = {};
    for (const [id, img] of Object.entries(imagenes.current)) {
      if (img && img.complete && img.naturalWidth === 0) detectados[id] = true;
    }
    if (Object.keys(detectados).length === 0) return;
    setRotos((previo) => ({ ...previo, ...detectados }));
  }, []);

  if (candidatos.length === 0) return null;

  const visibles = candidatos.filter((logo, indice) => !rotos[clave(logo, indice)]);
  if (visibles.length === 0) return null;

  return (
    <div className="mt-10">
      <p id="logos-aliadas" className="text-center font-semibold text-[var(--color-text)]">
        Universidades aliadas
      </p>
      <ul
        className="mt-3.5 grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 lg:grid-cols-5"
        aria-labelledby="logos-aliadas"
      >
        {candidatos.map((logo, indice) => {
          const id = clave(logo, indice);
          if (rotos[id]) return null;

          return (
            <li
              key={id}
              className="flex h-16 items-center justify-center rounded-xl border border-[var(--color-line)] bg-white px-3"
            >
              <img
                ref={(nodo) => {
                  imagenes.current[id] = nodo;
                }}
                src={logo.url}
                alt={logo.alt.trim()}
                className="max-h-10 w-auto max-w-full object-contain"
                decoding="async"
                onError={() => setRotos((previo) => ({ ...previo, [id]: true }))}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
