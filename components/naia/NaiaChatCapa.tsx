"use client";

import { Suspense, useEffect, useRef } from "react";
import NaiaSearchExperience from "@/components/naia/NaiaSearchExperience";

interface NaiaChatCapaProps {
  onCerrar: () => void;
}

/**
 * BA-028: capa de chat del FAB, la misma NaiaSearchExperience de /naia.
 * Encima va la capa de resultados (Explorar oferta). Volver deja la página.
 */
export default function NaiaChatCapa({ onCerrar }: NaiaChatCapaProps) {
  const onCerrarRef = useRef(onCerrar);
  onCerrarRef.current = onCerrar;

  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    /* Si el viewport pasa a escritorio, la capa móvil no se queda montada. */
    const mq = window.matchMedia("(min-width: 768px)");
    const cerrarSiEscritorio = () => {
      if (mq.matches) onCerrarRef.current();
    };
    mq.addEventListener("change", cerrarSiEscritorio);

    return () => {
      document.body.style.overflow = anterior;
      mq.removeEventListener("change", cerrarSiEscritorio);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[65] flex flex-col bg-[#f7f9fc] md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Conversación con NaIA"
    >
      {/* Volver cierra esta capa y deja la página que estaba debajo. */}
      <div className="flex shrink-0 items-center gap-3 border-b border-buscoedu-border bg-white px-3 py-2">
        <button
          type="button"
          onClick={onCerrar}
          className="inline-flex min-h-11 items-center rounded-lg border border-buscoedu-blue px-3 text-sm font-semibold text-buscoedu-blue"
        >
          ← Volver
        </button>
        <p className="text-sm font-semibold text-buscoedu-blue">NaIA</p>
      </div>

      <div className="min-h-0 flex-1">
        <Suspense fallback={<div className="h-full bg-[#f7f9fc]" />}>
          <NaiaSearchExperience enCapa />
        </Suspense>
      </div>
    </div>
  );
}
