"use client";

import { FormEvent, useState } from "react";

type Field = {
  id: string;
  label: string;
  type?: "text" | "email" | "tel" | "textarea" | "select";
  options?: string[];
};

type Props = {
  title: string;
  description: string;
  submitLabel: string;
  successMessage: string;
  fields: Field[];
};

export default function SimpleLocalForm({ title, description, submitLabel, successMessage, fields }: Props) {
  const initialState = Object.fromEntries(fields.map((field) => [field.id, ""])) as Record<string, string>;
  const [formData, setFormData] = useState<Record<string, string>>(initialState);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = fields
      .filter((field) => !String(formData[field.id] ?? "").trim())
      .map((field) => `Completa el campo: ${field.label}.`);

    setErrors(nextErrors);
    setSubmitted(nextErrors.length === 0);

    if (nextErrors.length === 0) {
      setFormData(initialState);
    }
  };

  return (
    <section className="rounded-xl border border-buscoedu-border bg-white p-6 shadow-card sm:p-8">
      <h2 className="text-2xl font-bold text-buscoedu-blue">{title}</h2>
      <p className="mt-2 text-sm text-buscoedu-muted">{description}</p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.id} className={field.type === "textarea" ? "space-y-2 sm:col-span-2" : "space-y-2"}>
              <label htmlFor={field.id} className="text-sm font-medium text-buscoedu-text">
                {field.label}
              </label>

              {field.type === "textarea" ? (
                <textarea
                  id={field.id}
                  value={formData[field.id]}
                  onChange={(event) => setFormData((prev) => ({ ...prev, [field.id]: event.target.value }))}
                  className="min-h-28 w-full rounded-md border border-buscoedu-border bg-white px-3 py-2 text-sm"
                />
              ) : field.type === "select" ? (
                <select
                  id={field.id}
                  value={formData[field.id]}
                  onChange={(event) => setFormData((prev) => ({ ...prev, [field.id]: event.target.value }))}
                  className="w-full rounded-md border border-buscoedu-border bg-white px-3 py-2 text-sm"
                >
                  <option value="">Selecciona una opción</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={field.id}
                  type={field.type ?? "text"}
                  value={formData[field.id]}
                  onChange={(event) => setFormData((prev) => ({ ...prev, [field.id]: event.target.value }))}
                  className="w-full rounded-md border border-buscoedu-border bg-white px-3 py-2 text-sm"
                />
              )}
            </div>
          ))}
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
            {successMessage}
          </p>
        )}

        <button className="inline-flex items-center rounded-md bg-buscoedu-blue px-5 py-2.5 font-semibold text-white transition hover:brightness-95" type="submit">
          {submitLabel}
        </button>
      </form>
    </section>
  );
}
