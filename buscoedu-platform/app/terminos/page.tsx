import type { Metadata } from "next";
import SectionHeading from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
  title: "Términos | BuscoEdu",
  description:
    "Términos base de uso de BuscoEdu como plataforma de orientación educativa."
};

export default function TerminosPage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Términos"
        title="Términos base de uso"
        description="Este contenido es informativo y requiere revisión legal antes de su versión final."
      />

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Nota importante: estos términos son una base informativa, no un texto jurídico definitivo.
      </div>

      <article className="space-y-4 rounded-xl border border-buscoedu-border bg-white p-6 text-sm leading-relaxed text-buscoedu-muted shadow-card">
        <p>
          BuscoEdu es una plataforma de orientación educativa y no es una universidad. No ofrece admisiones directas ni
          garantiza becas, cupos, precios o descuentos.
        </p>
        <p>
          La información presentada tiene carácter orientativo y puede depender de cambios en condiciones de
          universidades aliadas.
        </p>
        <p>
          El uso de la plataforma implica aceptar estos lineamientos base y comprender que la decisión final de ingreso
          o condiciones académicas corresponde a cada institución.
        </p>
      </article>
    </div>
  );
}
