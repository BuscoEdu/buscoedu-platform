import type { Metadata } from "next";
import SectionHeading from "@/components/ui/SectionHeading";
import SimpleLocalForm from "@/components/forms/SimpleLocalForm";

export const metadata: Metadata = {
  title: "Contacto | BuscoEdu",
  description:
    "Contáctanos para resolver dudas sobre la plataforma de orientación educativa BuscoEdu."
};

export default function ContactoPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10 sm:px-6 lg:px-8">
      <SectionHeading
        eyebrow="Contacto"
        title="¿En qué podemos orientarte?"
        description="Comparte tu consulta y te responderemos cuando el canal esté habilitado. En esta fase el formulario es visual y local."
      />

      <SimpleLocalForm
        title="Formulario de contacto"
        description="BuscoEdu no envía ni almacena datos en esta fase de implementación."
        submitLabel="Enviar consulta"
        successMessage="Gracias por tu mensaje. Pronto BuscoEdu habilitará este canal de atención."
        fields={[
          { id: "nombre", label: "Nombre" },
          { id: "correo", label: "Correo", type: "email" },
          { id: "whatsapp", label: "WhatsApp", type: "tel" },
          {
            id: "tipoConsulta",
            label: "Tipo de consulta",
            type: "select",
            options: ["Orientación educativa", "Universidades aliadas", "Alianzas", "Soporte general"]
          },
          { id: "mensaje", label: "Mensaje", type: "textarea" }
        ]}
      />
    </div>
  );
}
