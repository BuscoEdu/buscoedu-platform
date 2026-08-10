"use client";

import { FormEvent, useState } from "react";

type InterestState = {
  nombre: string;
  whatsapp: string;
  correo: string;
  estudio: string;
  modalidad: string;
  ciudad: string;
  aceptaDatos: boolean;
  autorizaContacto: boolean;
};

const initialState: InterestState = {
  nombre: "",
  whatsapp: "",
  correo: "",
  estudio: "",
  modalidad: "",
  ciudad: "",
  aceptaDatos: false,
  autorizaContacto: false
};

export default function InterestForm() {
  const [formData, setFormData] = useState<InterestState>(initialState);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors: string[] = [];

    if (!formData.nombre.trim()) nextErrors.push("Ingresa tu nombre.");
    if (!formData.whatsapp.trim()) nextErrors.push("Ingresa tu WhatsApp.");
    if (!formData.correo.trim()) nextErrors.push("Ingresa tu correo.");
    if (!formData.estudio.trim()) nextErrors.push("Indica qué quieres estudiar.");
    if (!formData.modalidad.trim()) nextErrors.push("Selecciona una modalidad preferida.");
    if (!formData.ciudad.trim()) nextErrors.push("Indica tu ciudad.");
    if (!formData.aceptaDatos) nextErrors.push("Debes aceptar el tratamiento de datos.");
    if (!formData.autorizaContacto) nextErrors.push("Debes autorizar el contacto para orientación.");

    setErrors(nextErrors);
    setSubmitted(nextErrors.length === 0);

    if (nextErrors.length === 0) {
      setFormData(initialState);
    }
  };

  return (
    <section id="formulario-interes" className="rounded-xl border border-buscoedu-border bg-white p-6 shadow-card sm:p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-buscoedu-blue">Inicia tu orientación con BuscoEdu</h2>
        <p className="mt-2 text-sm text-buscoedu-muted">
          Este formulario funciona de forma local en tu navegador. En esta fase no enviamos ni almacenamos tus
          datos personales.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nombre" id="nombre" value={formData.nombre} onChange={(value) => setFormData((prev) => ({ ...prev, nombre: value }))} />
          <FormField label="WhatsApp" id="whatsapp" value={formData.whatsapp} onChange={(value) => setFormData((prev) => ({ ...prev, whatsapp: value }))} />
          <FormField label="Correo" id="correo" type="email" value={formData.correo} onChange={(value) => setFormData((prev) => ({ ...prev, correo: value }))} />
          <FormField label="¿Qué quieres estudiar?" id="estudio" value={formData.estudio} onChange={(value) => setFormData((prev) => ({ ...prev, estudio: value }))} />
          <SelectField label="Modalidad preferida" id="modalidad" value={formData.modalidad} onChange={(value) => setFormData((prev) => ({ ...prev, modalidad: value }))} options={["Presencial", "Virtual", "Híbrida"]} />
          <FormField label="Ciudad" id="ciudad" value={formData.ciudad} onChange={(value) => setFormData((prev) => ({ ...prev, ciudad: value }))} />
        </div>

        <div className="space-y-3">
          <CheckboxField
            id="aceptaDatos"
            checked={formData.aceptaDatos}
            onChange={(checked) => setFormData((prev) => ({ ...prev, aceptaDatos: checked }))}
            label="Acepto el tratamiento de datos para recibir orientación educativa de BuscoEdu."
          />
          <CheckboxField
            id="autorizaContacto"
            checked={formData.autorizaContacto}
            onChange={(checked) => setFormData((prev) => ({ ...prev, autorizaContacto: checked }))}
            label="Autorizo ser contactado(a). BuscoEdu solo comparte información con universidades aliadas si lo autorizo expresamente."
          />
        </div>

        {errors.length > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            <ul className="list-inside list-disc">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {submitted && (
          <p className="rounded-md border border-buscoedu-teal bg-teal-50 p-3 text-sm text-buscoedu-blue" role="status">
            Gracias. Pronto BuscoEdu podrá registrar tu interés y orientarte con NaIA.
          </p>
        )}

        <button
          type="submit"
          className="inline-flex items-center rounded-md bg-buscoedu-blue px-5 py-2.5 font-semibold text-white transition hover:brightness-95"
        >
          Enviar interés
        </button>
      </form>
    </section>
  );
}

type FormFieldProps = {
  id: string;
  label: string;
  value: string;
  type?: "text" | "email";
  onChange: (value: string) => void;
};

function FormField({ id, label, value, onChange, type = "text" }: FormFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-buscoedu-text">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-buscoedu-border bg-white px-3 py-2 text-sm"
      />
    </div>
  );
}

type SelectFieldProps = {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
};

function SelectField({ id, label, value, options, onChange }: SelectFieldProps) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-buscoedu-text">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-buscoedu-border bg-white px-3 py-2 text-sm"
      >
        <option value="">Selecciona una opción</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

type CheckboxFieldProps = {
  id: string;
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
};

function CheckboxField({ id, checked, label, onChange }: CheckboxFieldProps) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-buscoedu-border"
      />
      <label htmlFor={id} className="text-sm text-buscoedu-muted">
        {label}
      </label>
    </div>
  );
}
