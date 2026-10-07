"use client";

import { useState } from "react";
import NaiaEntryModal from "@/components/naia/NaiaEntryModal";
import PillButton from "@/components/restyle/PillButton";

/**
 * CTA «Habla con NaIA» del hero.
 * Abre el mismo modal de entrada que ya usa el header. No cambia el flujo:
 * la persona escribe una intención y sigue en /naia.
 */

export default function HablaConNaiaButton({ className = "" }: { className?: string }) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <PillButton
        type="button"
        variant="secondary"
        className={className}
        onClick={() => setAbierto(true)}
      >
        Habla con NaIA
      </PillButton>
      <NaiaEntryModal isOpen={abierto} onClose={() => setAbierto(false)} />
    </>
  );
}
