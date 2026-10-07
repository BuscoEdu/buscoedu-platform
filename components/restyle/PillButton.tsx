import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Botón pastilla del restyle A2.
 * primary: relleno índigo y texto blanco (acción principal).
 * accent: relleno coral y texto #1a1830. El coral no va como texto ni con blanco.
 * secondary: superficie blanca, borde de tinta, para la acción de al lado.
 */

type Variant = "primary" | "accent" | "secondary";
type Size = "md" | "sm";

const VARIANTE: Record<Variant, string> = {
  primary: "border-[var(--color-text)] bg-[var(--color-primary)] text-white hover:bg-[#2a2166]",
  accent: "border-[var(--color-text)] bg-[var(--color-accent)] text-[var(--color-text)] hover:brightness-[0.97]",
  secondary: "border-[var(--color-text)] bg-white text-[var(--color-text)] hover:bg-[var(--color-band)]"
};

const TAMANO: Record<Size, string> = {
  md: "px-7 py-[13px] text-base",
  sm: "px-3.5 py-2 text-sm"
};

type Comun = {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
};

type PropsEnlace = Comun & { href: string; onClick?: () => void };
type PropsBoton = Comun & { href?: undefined } & ButtonHTMLAttributes<HTMLButtonElement>;

function clases(variant: Variant, size: Size, className?: string) {
  return [
    "inline-flex shrink-0 items-center justify-center rounded-full border-2 text-center font-bold leading-none shadow-[var(--shadow-hard)] transition",
    VARIANTE[variant],
    TAMANO[size],
    className ?? ""
  ].join(" ");
}

export default function PillButton(props: PropsEnlace | PropsBoton) {
  const variant = props.variant ?? "primary";
  const size = props.size ?? "md";
  const className = clases(variant, size, props.className);

  if ("href" in props && props.href) {
    const enlace = props as PropsEnlace;
    return (
      <Link href={enlace.href} className={className} onClick={enlace.onClick}>
        {enlace.children}
      </Link>
    );
  }

  const boton = props as PropsBoton;
  const { variant: _variante, size: _tamano, className: _clase, children, type = "button", ...resto } = boton;

  return (
    <button type={type} className={className} {...resto}>
      {children}
    </button>
  );
}
