"use client";

import { useState } from "react";
import Link from "next/link";
import SectionHeading from "@/components/ui/SectionHeading";
import InfoCard from "@/components/ui/InfoCard";
import NaiaEntryModal from "@/components/naia/NaiaEntryModal";
import NaiaHomeHero from "@/components/naia/NaiaHomeHero";
import { NOMBRES_ALIADAS } from "@/src/lib/aliadas-publicas";

const beneficios = [
  {
    title: "Opciones reales de aliadas",
    description:
      "Ves programas vigentes de cinco instituciones con preacuerdo, no un directorio nacional."
  },
  {
    title: "Tú eliges a quién autorizar",
    description:
      "Tu información solo se comparte con la universidad que marques por nombre."
  },
  {
    title: "BuscoEdu te contacta primero",
    description:
      "Si autorizas, un asesor de BuscoEdu te escribe. La universidad no recibe un dato frío."
  },
  {
    title: "NaIA es opcional",
    description:
      "Puedes recorrer la oferta en silencio o pedir explicaciones a NaIA sobre las mismas fichas."
  }
];

const pasos = [
  {
    title: "1) Dinos qué buscas",
    description: "Nivel, área y modalidad. En pocos pasos, sin teléfono todavía."
  },
  {
    title: "2) Mira 2 a 5 rutas vigentes",
    description: "Solo programas de las aliadas que encajan con lo que pediste."
  },
  {
    title: "3) Autoriza por universidad",
    description: "Cada permiso lleva el nombre de la institución. Nada de “aliadas” en genérico."
  },
  {
    title: "4) Te acompañamos",
    description: "BuscoEdu te contacta. La universidad entra solo con tu sí nominado."
  }
];

export default function HomePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="mx-auto w-full max-w-6xl space-y-14 px-4 py-10 sm:px-6 lg:px-8">
        <NaiaHomeHero />

        <section className="rounded-xl border border-buscoedu-border bg-white p-6 shadow-card sm:p-8">
          <SectionHeading
            title="Elige cómo empezar"
            description="El camino principal es ver la oferta de las aliadas. NaIA explica las mismas opciones si lo prefieres."
          />
          <div className="flex flex-wrap gap-3">
            <Link
              href="/explorar"
              className="inline-flex items-center rounded-md bg-buscoedu-teal px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
            >
              Encontrar opciones
            </Link>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center rounded-md border border-buscoedu-blue px-5 py-2.5 text-sm font-semibold text-buscoedu-blue transition hover:bg-buscoedu-blue/5"
            >
              Hacerlo con NaIA
            </button>
          </div>
        </section>

        <section>
          <SectionHeading
            eyebrow="Aliadas"
            title="Cinco instituciones con preacuerdo"
            description="En esta fase el portal público no muestra otras universidades."
          />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {NOMBRES_ALIADAS.map((nombre) => (
              <li
                key={nombre}
                className="rounded-xl border border-buscoedu-border bg-white px-4 py-3 text-sm font-semibold text-buscoedu-blue shadow-card"
              >
                {nombre}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionHeading
            eyebrow="Cómo funciona"
            title="Un proceso corto para ver si hay cupo de verdad"
            description="BuscoEdu no promete admisión. Promete programas vigentes de estas cinco y un contacto con tu permiso."
          />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {pasos.map((paso) => (
              <InfoCard key={paso.title} title={paso.title} description={paso.description} />
            ))}
          </div>
          <Link href="/como-funciona" className="mt-6 inline-flex text-sm font-semibold text-buscoedu-blue underline">
            Conocer el proceso completo
          </Link>
        </section>

        <section id="beneficios">
          <SectionHeading
            eyebrow="Qué ganas"
            title="Claridad antes del dato"
            description="Primero el resultado. Después el permiso. Nunca al revés."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {beneficios.map((beneficio) => (
              <InfoCard key={beneficio.title} title={beneficio.title} description={beneficio.description} />
            ))}
          </div>
        </section>

        <section
          className="rounded-xl border border-buscoedu-border bg-white p-6 shadow-card sm:p-8"
          id="privacidad-consentimiento"
        >
          <SectionHeading
            eyebrow="Privacidad"
            title="No hay autorización genérica a “universidades aliadas”"
            description="El permiso es por institución, con nombre. Guardar en Mi lista no envía tus datos."
          />
          <Link href="/privacidad" className="inline-flex text-sm font-semibold text-buscoedu-blue underline">
            Ver política de privacidad
          </Link>
        </section>
      </div>

      <NaiaEntryModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
