import type { Metadata } from "next";
import SectionHeading from "@/components/ui/SectionHeading";
import InfoCard from "@/components/ui/InfoCard";

export const metadata: Metadata = {
  title: "Cómo funciona | BuscoEdu",
  description:
    "Conoce cómo BuscoEdu orienta tu decisión educativa con NaIA y consentimiento explícito para cualquier conexión con universidades aliadas."
};

export default function ComoFuncionaPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Proceso"
        title="Cómo funciona BuscoEdu"
        description="BuscoEdu es una plataforma de orientación educativa. No es una universidad y no garantiza admisión, precios, becas ni cupos."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard
          title="Paso 1: Cuéntanos tu objetivo"
          description="Describe qué quieres estudiar, tu modalidad ideal y el contexto en el que quieres avanzar."
        />
        <InfoCard
          title="Paso 2: Orientación con NaIA"
          description="NaIA, la asesora virtual de BuscoEdu, te ayuda a aclarar posibilidades y priorizar rutas educativas."
        />
        <InfoCard
          title="Paso 3: Conexión autorizada"
          description="Solo si autorizas expresamente, BuscoEdu puede compartir tu intención con universidades aliadas."
        />
      </div>
    </div>
  );
}
