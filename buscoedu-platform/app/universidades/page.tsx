import type { Metadata } from "next";
import SectionHeading from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
  title: "Universidades aliadas | BuscoEdu",
  description:
    "Conoce cómo funciona la red de universidades aliadas de BuscoEdu y el consentimiento para compartir tu perfil educativo."
};

export default function UniversidadesPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Red aliada"
        title="Universidades aliadas"
        description="BuscoEdu puede facilitar conexiones con instituciones aliadas cuando la persona interesada lo autoriza expresamente."
      />

      <div className="space-y-4 rounded-xl border border-buscoedu-border bg-white p-6 shadow-card text-sm leading-relaxed text-buscoedu-muted">
        <p>
          Esta sección describe el modelo de colaboración institucional. En esta fase no mostramos logos ni nombres
          específicos.
        </p>
        <p>
          La transferencia de información de interés educativo solo ocurre con autorización explícita de cada usuario.
        </p>
      </div>
    </div>
  );
}
