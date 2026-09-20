import type { Metadata } from "next";
import UniversidadesLanding from "@/components/universidades/UniversidadesLanding";

export const metadata: Metadata = {
  title: "BuscoEdu para universidades | Captación de estudiantes con contexto",
  description:
    "Conecta tu universidad con estudiantes orientados, interesados y autorizados. Recibe oportunidades con contexto y activa condiciones comerciales adaptadas a tus objetivos de matrícula.",
};

export default function UniversidadesPage() {
  return <UniversidadesLanding />;
}
