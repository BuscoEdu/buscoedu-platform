'use client';

import { useState, type ReactNode } from 'react';

interface CajaAyudaProps {
  /** Título de la sección de ayuda. */
  titulo: string;
  /** Contenido: texto simple, lista de pasos o cualquier nodo React. */
  children: ReactNode;
  /** Variante de color del recuadro. */
  variante?: 'azul' | 'amarillo';
  /** Si la caja puede ocultarse/mostrarse. Por defecto true. */
  colapsable?: boolean;
  /** Estado inicial: expandida (true) o colapsada (false). Por defecto true. */
  inicialAbierta?: boolean;
}

/**
 * Bloque de ayuda contextual reutilizable para las secciones del panel admin.
 * Explica en lenguaje simple para qué sirve cada sección y qué debe hacer el usuario.
 */
export default function CajaAyuda({
  titulo,
  children,
  variante = 'azul',
  colapsable = true,
  inicialAbierta = true
}: CajaAyudaProps) {
  const [abierta, setAbierta] = useState(inicialAbierta);

  const estilos =
    variante === 'amarillo'
      ? {
          contenedor: 'border-amber-200 bg-amber-50',
          titulo: 'text-amber-900',
          texto: 'text-amber-800',
          boton: 'text-amber-700 hover:text-amber-900'
        }
      : {
          contenedor: 'border-sky-200 bg-sky-50',
          titulo: 'text-sky-900',
          texto: 'text-sky-800',
          boton: 'text-sky-700 hover:text-sky-900'
        };

  return (
    <section
      className={`mb-6 rounded-xl border ${estilos.contenedor} p-4`}
      aria-label={`Ayuda: ${titulo}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {/* Ícono de bombilla / información */}
          <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center" aria-hidden="true">
            <svg
              className={`h-5 w-5 ${estilos.titulo}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </span>
          <h3 className={`text-base font-bold ${estilos.titulo}`}>{titulo}</h3>
        </div>

        {colapsable && (
          <button
            type="button"
            onClick={() => setAbierta((v) => !v)}
            className={`flex-shrink-0 text-xs font-semibold ${estilos.boton}`}
            aria-expanded={abierta}
          >
            {abierta ? 'Ocultar ayuda' : 'Mostrar ayuda'}
          </button>
        )}
      </div>

      {abierta && (
        <div className={`mt-3 space-y-2 pl-9 text-sm leading-relaxed ${estilos.texto}`}>
          {children}
        </div>
      )}
    </section>
  );
}
