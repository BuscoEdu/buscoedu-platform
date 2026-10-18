/**
 * E1 · Frontend — Íconos SVG del módulo.
 *
 * Qué hace: íconos pequeños de línea (✓, ✗, alerta, info, candado, ⏻) que heredan el color del texto.
 * Para qué: que cada estado semántico vaya con ícono + texto y nunca solo con color (brief UX §5).
 * Son decorativos (`aria-hidden`): el texto al lado es el que leen los lectores de pantalla.
 */

import type { ReactNode } from 'react';

type Props = { className?: string };

/** Base común: 20 px, trazo actual, oculto para lectores de pantalla. */
function Svg({ className = 'h-5 w-5', children }: Props & { children: ReactNode }) {
  return (
    <svg className={`shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** ✓ éxito / configurado. */
export function IconoCheck(p: Props) {
  return <Svg {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
}

/** ✗ error. */
export function IconoError(p: Props) {
  return <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></Svg>;
}

/** ⚠ alerta. */
export function IconoAlerta(p: Props) {
  return <Svg {...p}><path d="M12 3l9.5 17h-19L12 3z" /><path d="M12 10v4.5M12 17.5v.01" /></Svg>;
}

/** ⓘ información (caja ¿Por qué? / ¿Para qué?). */
export function IconoInfo(p: Props) {
  return <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></Svg>;
}

/** Candado (sin permiso / clave). */
export function IconoCandado(p: Props) {
  return <Svg {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 018 0v3" /></Svg>;
}

/** ⏻ encendido. */
export function IconoEncendido(p: Props) {
  return <Svg {...p}><path d="M12 3v8" /><path d="M6.3 7.3a8 8 0 1011.4 0" /></Svg>;
}

/** Engranaje (configurado). */
export function IconoConfigurado(p: Props) {
  return <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></Svg>;
}

/** Caja vacía (estado vacío). */
export function IconoVacio(p: Props) {
  return <Svg {...p}><path d="M3 8l9-5 9 5v8l-9 5-9-5V8z" /><path d="M3 8l9 5 9-5M12 13v8" /></Svg>;
}
