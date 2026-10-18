'use client';

/**
 * E1 · Frontend — Diálogo accesible del módulo.
 *
 * Qué hace: ventana modal con `role="dialog"`, `aria-modal`, título enlazado, foco atrapado,
 * `Esc` para cerrar y regreso del foco al botón que lo abrió. En < 640 px se abre a pantalla
 * completa con «Cancelar» arriba a la izquierda y la acción fija abajo (safe-area).
 * Para qué: el aviso de impacto al apagar un proveedor (C1, P4) y la confirmación de
 * «Revocar clave» (A4), tal como pide el brief UX §5 «Foco y teclado» y «Responsive».
 */

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { BOTON_SECUNDARIO, FOCO } from './estilos';

/** Elementos que pueden recibir foco con Tab. */
const ENFOCABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Dialogo({
  abierto,
  titulo,
  onCerrar,
  children,
  accion,
  textoCancelar = 'Cancelar'
}: {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  /** El botón que confirma; debe nombrar la acción («Apagar xAI»), nunca «Aceptar». */
  accion: ReactNode;
  textoCancelar?: string;
}) {
  const idTitulo = useId();
  const panel = useRef<HTMLDivElement>(null);
  const disparador = useRef<HTMLElement | null>(null);

  // Al abrir: recuerda quién tenía el foco y lo pone en el título del diálogo.
  // Al cerrar: devuelve el foco al disparador.
  useEffect(() => {
    if (!abierto) return;
    disparador.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => panel.current?.querySelector<HTMLElement>('[data-foco-inicial]')?.focus(), 0);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = overflowPrevio;
      disparador.current?.focus?.();
    };
  }, [abierto]);

  // Teclado: Esc cierra; Tab y Shift+Tab dan la vuelta dentro del diálogo (foco atrapado).
  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCerrar();
      return;
    }
    if (e.key !== 'Tab' || !panel.current) return;
    const lista = Array.from(panel.current.querySelectorAll<HTMLElement>(ENFOCABLES)).filter((el) => el.offsetParent !== null);
    if (!lista.length) return;
    const primero = lista[0];
    const ultimo = lista[lista.length - 1];
    if (e.shiftKey && (document.activeElement === primero || document.activeElement === panel.current.querySelector('[data-foco-inicial]'))) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  }

  if (!abierto) return null;

  // z-[60]: por encima de la barra fija de acciones (z-50) y del botón flotante de NaIA (z-40).
  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-[#1a1830]/50 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        onKeyDown={alTeclear}
        className="flex h-full w-full flex-col bg-white text-base sm:h-auto sm:max-h-[85vh] sm:max-w-lg sm:rounded-2xl sm:border sm:border-[#ece8f7] sm:shadow-xl"
      >
        {/* Cabecera: en móvil «Cancelar» va arriba a la izquierda (brief UX §5 Responsive). */}
        <div className="flex items-center gap-3 border-b border-[#ece8f7] px-4 py-2 sm:px-6 sm:py-4">
          <button type="button" onClick={onCerrar} className={`${FOCO} min-h-[44px] rounded px-1 font-semibold text-[#3b2f8f] underline underline-offset-2 sm:hidden`}>
            {textoCancelar}
          </button>
          <h2 id={idTitulo} tabIndex={-1} data-foco-inicial className={`${FOCO} rounded text-lg font-bold text-[#3b2f8f] sm:text-xl`}>{titulo}</h2>
        </div>
        {/* Cuerpo con su propio scroll: la acción nunca queda fuera de la pantalla. */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
        {/* Pie: acción fija abajo con el área segura; en web, Cancelar + acción a la derecha. */}
        <div className="flex flex-col-reverse gap-2 border-t border-[#ece8f7] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6 sm:pb-4">
          <button type="button" onClick={onCerrar} className={`${BOTON_SECUNDARIO} hidden sm:inline-flex`}>{textoCancelar}</button>
          {accion}
        </div>
      </div>
    </div>
  );
}
