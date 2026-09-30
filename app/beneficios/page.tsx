import type { Metadata } from "next";
import SectionHeading from "@/components/ui/SectionHeading";
import InfoCard from "@/components/ui/InfoCard";
import ClosingCtas from "@/components/ui/ClosingCtas";

export const metadata: Metadata = {
  title: "Beneficios | BuscoEdu",
  description:
    "Claridad antes del dato: programas vigentes de universidades con acuerdo y contacto solo con tu permiso.",
};

const beneficios = [
  {
    title: "Orientación clara",
    description: "Aterriza qué buscar antes de dejar un dato.",
  },
  {
    title: "Comparación con contexto",
    description: "Ves programas vigentes de universidades con acuerdo, no un directorio nacional.",
  },
  {
    title: "Tú autorizas a quién",
    description: "El permiso va a una institución por nombre. No hay un sí genérico.",
  },
  {
    title: "Financiación con letra chica",
    description:
      "Becas y precios los define cada universidad. BuscoEdu no los garantiza.",
  },
];

export default function BeneficiosPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Beneficios"
        title="Por qué usar BuscoEdu"
        description="BuscoEdu orienta y compara. No promete becas, descuentos, admisión, precios ni cupos."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {beneficios.map((beneficio) => (
          <InfoCard key={beneficio.title} title={beneficio.title} description={beneficio.description} />
        ))}
      </div>

      <ClosingCtas description="El camino principal es ver programas vigentes. NaIA explica si lo prefieres." />
    </div>
  );
}
