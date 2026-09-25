import type { Metadata } from "next";
import UniversidadesLanding from "@/components/universidades/UniversidadesLanding";
import ClosingCtas from "@/components/ui/ClosingCtas";

export const metadata: Metadata = {
  title: "BuscoEdu para universidades | Captación de estudiantes con contexto",
  description:
    "Conecta tu universidad con estudiantes orientados, interesados y autorizados. Recibe oportunidades con contexto y activa condiciones comerciales adaptadas a tus objetivos de matrícula.",
};

export default function ParaUniversidadesPage() {
  return (
    <>
      <UniversidadesLanding />
      <div className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
        <ClosingCtas description="¿Eres estudiante? Habla con NaIA o explora ofertas académicas vigentes." />
      </div>
    </>
  );
}
