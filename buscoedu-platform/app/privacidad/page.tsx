import type { Metadata } from "next";
import SectionHeading from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
  title: "Privacidad | BuscoEdu",
  description:
    "Política base de privacidad de BuscoEdu con foco en consentimiento y uso responsable de datos."
};

export default function PrivacidadPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Privacidad"
        title="Política de privacidad base"
        description="Este contenido es informativo y debe pasar por revisión legal para su versión definitiva."
      />

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Nota importante: esta política es una base informativa, no un documento jurídico definitivo.
      </div>

      <article className="space-y-4 rounded-xl border border-buscoedu-border bg-white p-6 text-sm leading-relaxed text-buscoedu-muted shadow-card">
        <p>
          BuscoEdu es una plataforma de orientación educativa. Los datos que una persona comparta en canales
          habilitados se utilizarán para apoyar procesos de orientación y mejorar la experiencia.
        </p>
        <p>
          BuscoEdu solo comparte datos con universidades aliadas cuando existe autorización expresa y verificable del
          titular.
        </p>
        <p>
          La persona usuaria puede solicitar información sobre el tratamiento de sus datos y revocar autorizaciones en
          los términos aplicables una vez los canales formales estén habilitados.
        </p>
      </article>
    </div>
  );
}
