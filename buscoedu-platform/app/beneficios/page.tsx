import type { Metadata } from "next";
import SectionHeading from "@/components/ui/SectionHeading";
import InfoCard from "@/components/ui/InfoCard";

export const metadata: Metadata = {
  title: "Beneficios | BuscoEdu",
  description:
    "Conoce los beneficios de usar BuscoEdu para orientarte en decisiones de formación con apoyo de NaIA."
};

const beneficios = [
  {
    title: "Orientación clara",
    description: "Aterriza tus objetivos de estudio con acompañamiento paso a paso."
  },
  {
    title: "Comparación con contexto",
    description: "Analiza alternativas según modalidad, nivel y objetivos personales."
  },
  {
    title: "Apoyo en la decisión",
    description: "Organiza información clave antes de conversar con instituciones aliadas."
  },
  {
    title: "Información sobre financiación",
    description:
      "Puedes conocer alternativas sujetas a condiciones definidas por cada universidad aliada."
  }
];

export default function BeneficiosPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Beneficios"
        title="Por qué usar BuscoEdu"
        description="BuscoEdu orienta, acompaña y ayuda a comparar opciones. No promete becas, descuentos, admisión, precios ni cupos."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {beneficios.map((beneficio) => (
          <InfoCard key={beneficio.title} title={beneficio.title} description={beneficio.description} />
        ))}
      </div>
    </div>
  );
}
