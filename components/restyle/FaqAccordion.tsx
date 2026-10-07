"use client";

import { useState } from "react";
import HardCard from "@/components/restyle/HardCard";

/**
 * Acordeón del FAQ.
 * Cada pregunta es un botón nativo: Enter y Espacio abren y cierran,
 * y aria-expanded refleja el estado. El «+» es un relleno coral con texto tinta.
 */

export type FaqItem = {
  id: string;
  pregunta: string;
  respuesta: string;
};

export default function FaqAccordion({ items }: { items: FaqItem[] }) {
  const [abiertas, setAbiertas] = useState<string[]>(() => (items[0] ? [items[0].id] : []));

  const alternar = (id: string) => {
    setAbiertas((previas) =>
      previas.includes(id) ? previas.filter((item) => item !== id) : [...previas, id]
    );
  };

  return (
    <div className="mt-7 text-left">
      {items.map((item) => {
        const abierta = abiertas.includes(item.id);
        const idBoton = `faq-${item.id}-boton`;
        const idPanel = `faq-${item.id}-panel`;

        return (
          <HardCard key={item.id} className="mb-3.5 px-[18px] py-4">
            <h3 className="text-base font-bold text-[var(--color-text)]">
              <button
                id={idBoton}
                type="button"
                className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
                aria-expanded={abierta}
                aria-controls={idPanel}
                onClick={() => alternar(item.id)}
              >
                <span>{item.pregunta}</span>
                <span
                  aria-hidden="true"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-lg font-bold leading-none text-[var(--color-text)]"
                >
                  {abierta ? "−" : "+"}
                </span>
              </button>
            </h3>
            {abierta && (
              <p id={idPanel} role="region" aria-labelledby={idBoton} className="mt-2 text-base leading-relaxed text-[var(--color-muted)]">
                {item.respuesta}
              </p>
            )}
          </HardCard>
        );
      })}
    </div>
  );
}
