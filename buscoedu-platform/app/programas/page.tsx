import type { Metadata } from "next";
import SectionHeading from "@/components/ui/SectionHeading";
import InfoCard from "@/components/ui/InfoCard";

export const metadata: Metadata = {
  title: "Programas | BuscoEdu",
  description:
    "Explora áreas de formación para orientar tu búsqueda educativa con BuscoEdu."
};

const areas = [
  "Administración",
  "Educación",
  "Tecnología",
  "Salud",
  "Ciencias sociales"
];

export default function ProgramasPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Opciones"
        title="Áreas para explorar"
        description="Estas tarjetas son referenciales para orientar tu búsqueda. No representan una oferta propia de BuscoEdu."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((area) => (
          <InfoCard
            key={area}
            title={area}
            description="Revisa rutas de formación relacionadas y conversa con NaIA para clarificar perfiles, modalidades y próximos pasos."
          />
        ))}
      </div>
    </div>
  );
}
