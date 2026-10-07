import type { HTMLAttributes, ReactNode } from "react";

/**
 * Tarjeta blanca del restyle: radio 16px, borde de tinta y sombra dura.
 * Sirve para pasos, cifras y barras del FAQ. No lleva degradado.
 */

type Props = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  className?: string;
};

export default function HardCard({ children, className = "", ...resto }: Props) {
  return (
    <article
      className={[
        "rounded-[var(--radius-card)] border-2 border-[var(--color-text)] bg-white shadow-[var(--shadow-hard)]",
        className
      ].join(" ")}
      {...resto}
    >
      {children}
    </article>
  );
}
