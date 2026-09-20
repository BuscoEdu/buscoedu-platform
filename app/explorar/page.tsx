import { Suspense } from "react";
import type { Metadata } from "next";
import NaiaSearchExperience from "@/components/naia/NaiaSearchExperience";

export const metadata: Metadata = {
  title: "Explorar programas | BuscoEdu",
  description: "Explora opciones educativas con NaIA y revisa resultados con contexto en tiempo real.",
};

export default function ExplorarPage() {
  return (
    <Suspense fallback={<div className="min-h-[70vh] bg-buscoedu-bg" />}>
      {/*
        /explorar hereda la lógica de /naia, pero prioriza visualmente resultados
        (columna derecha más amplia) y mantiene el chat como columna compacta.
      */}
      <NaiaSearchExperience layoutVariant="explorar" />
    </Suspense>
  );
}
