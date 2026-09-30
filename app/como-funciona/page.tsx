import type { Metadata } from "next";
import SectionHeading from "@/components/ui/SectionHeading";
import InfoCard from "@/components/ui/InfoCard";
import ClosingCtas from "@/components/ui/ClosingCtas";

export const metadata: Metadata = {
  title: "Cómo funciona | BuscoEdu",
  description:
    "Ves programas vigentes de universidades con acuerdo. Si autorizas por nombre, BuscoEdu te contacta.",
};

export default function ComoFuncionaPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Proceso"
        title="Cómo funciona BuscoEdu"
        description="BuscoEdu no es una universidad y no garantiza admisión, precios, becas ni cupos. Mostramos oferta vigente de universidades con las que ya hay acuerdo."
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <InfoCard
          title="1) Dinos qué buscas"
          description="Nivel, área y modalidad. Todavía no pedimos teléfono."
        />
        <InfoCard
          title="2) Mira rutas vigentes"
          description="Programas de instituciones con acuerdo. Si no hay para lo que buscas, te lo decimos."
        />
        <InfoCard
          title="3) Autoriza por universidad"
          description="Cada permiso lleva el nombre de la institución. No existe un sí genérico."
        />
        <InfoCard
          title="4) Te acompañamos"
          description="Si autorizas, un asesor de BuscoEdu te contacta. NaIA es opcional para explicar las mismas fichas."
        />
      </div>

      <ClosingCtas description="El camino principal es ver la oferta vigente. NaIA explica si lo prefieres." />
    </div>
  );
}
