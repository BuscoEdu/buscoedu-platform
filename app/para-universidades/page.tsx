import type { Metadata } from "next";
import SectionHeading from "@/components/ui/SectionHeading";
import SimpleLocalForm from "@/components/forms/SimpleLocalForm";

export const metadata: Metadata = {
  title: "Para universidades | BuscoEdu",
  description:
    "Conoce la propuesta B2B de BuscoEdu para universidades aliadas con oportunidades calificadas y consentimiento explícito."
};

export default function ParaUniversidadesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-xl border border-buscoedu-border bg-white p-6 shadow-card sm:p-8">
        <SectionHeading
          eyebrow="Alianzas"
          title="BuscoEdu para universidades"
          description="BuscoEdu entrega oportunidades con contexto, intención y consentimiento. No vendemos bases indiscriminadas ni compartimos datos sin autorización expresa."
        />
        <p className="text-sm leading-relaxed text-buscoedu-muted">
          Nuestro enfoque prioriza calidad de intención, trazabilidad de consentimiento y una experiencia de
          orientación responsable para futuros estudiantes.
        </p>
      </section>

      <SimpleLocalForm
        title="Solicita una reunión"
        description="Formulario visual local. En esta fase no se envían ni almacenan datos personales."
        submitLabel="Solicitar reunión"
        successMessage="Gracias. Pronto BuscoEdu podrá habilitar este canal para gestionar reuniones con universidades aliadas."
        fields={[
          { id: "nombre", label: "Nombre" },
          { id: "cargo", label: "Cargo" },
          { id: "institucion", label: "Institución" },
          { id: "correo", label: "Correo institucional", type: "email" },
          { id: "whatsapp", label: "WhatsApp", type: "tel" },
          { id: "mensaje", label: "Mensaje", type: "textarea" }
        ]}
      />
    </div>
  );
}
