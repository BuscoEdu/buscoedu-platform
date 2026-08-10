import Link from "next/link";
import type { Metadata } from "next";
import SectionHeading from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
  title: "NaIA | BuscoEdu",
  description:
    "Conoce a NaIA, la asesora virtual de BuscoEdu: qué puede hacer, qué no puede hacer y cómo se maneja el consentimiento de datos."
};

export default function NaIAPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Asesoría virtual"
        title="NaIA, la asesora virtual de BuscoEdu"
        description="NaIA te acompaña con orientación cercana y neutral para ayudarte a organizar tus ideas de estudio."
      />

      <div className="space-y-4 rounded-xl border border-buscoedu-border bg-white p-6 shadow-card text-sm leading-relaxed text-buscoedu-muted">
        <p>
          <strong className="text-buscoedu-text">Qué puede hacer:</strong> ayudarte a definir objetivos educativos,
          comparar caminos de formación y preparar preguntas para instituciones aliadas.
        </p>
        <p>
          <strong className="text-buscoedu-text">Qué no puede hacer:</strong> no promete admisión, becas, precios,
          descuentos ni cupos.
        </p>
        <p>
          <strong className="text-buscoedu-text">Uso de datos:</strong> BuscoEdu solo comparte información con
          universidades aliadas si tú lo autorizas expresamente.
        </p>
      </div>

      <Link
        href="/#formulario-interes"
        className="mt-6 inline-flex items-center rounded-md bg-buscoedu-teal px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
      >
        Iniciar orientación
      </Link>
    </div>
  );
}
