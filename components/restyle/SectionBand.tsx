import type { ReactNode } from "react";

/**
 * Banda de sección (lila pálido) para alternar con el fondo crema.
 * Encima de esta banda no se usa --color-highlight.
 */
export default function SectionBand({ children }: { children: ReactNode }) {
  return <div className="bg-[var(--color-band)]">{children}</div>;
}
