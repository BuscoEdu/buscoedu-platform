import Link from "next/link";
import type { Metadata } from "next";
import InterestForm from "@/components/forms/InterestForm";
import SectionHeading from "@/components/ui/SectionHeading";
import InfoCard from "@/components/ui/InfoCard";

export const metadata: Metadata = {
  title: "BuscoEdu | Encuentra opciones educativas con orientación inteligente",
  description:
    "Explora alternativas de estudio con BuscoEdu y NaIA. Solo compartimos tus datos con universidades aliadas cuando lo autorizas expresamente."
};

const beneficios = [
  {
    title: "Orientación personalizada",
    description:
      "Recibe apoyo para entender tus intereses y construir una ruta educativa alineada con tus metas."
  },
  {
    title: "Comparación de opciones",
    description:
      "Revisa rutas de formación por áreas, modalidades y niveles académicos con información clara."
  },
  {
    title: "Modalidades flexibles",
    description:
      "Explora alternativas presenciales, virtuales e híbridas según tu contexto personal y disponibilidad."
  },
  {
    title: "Contacto con autorización",
    description:
      "Tu información solo se comparte con universidades aliadas si das tu autorización expresa."
  }
];

const pasos = [
  {
    title: "1) Cuéntanos qué buscas",
    description: "Comparte tus intereses de estudio y preferencias de forma simple y guiada."
  },
  {
    title: "2) NaIA te ayuda a aclarar opciones",
    description: "La asesora virtual de BuscoEdu te orienta con un enfoque cercano, neutral y práctico."
  },
  {
    title: "3) Si autorizas, conectamos tu perfil",
    description:
      "Solo con tu consentimiento, tu intención educativa puede compartirse con universidades aliadas."
  }
];

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-14 px-4 py-10 sm:px-6 lg:px-8">
      <section className="rounded-2xl bg-gradient-to-br from-buscoedu-blue to-[#1d4d88] px-6 py-12 text-white sm:px-10">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-buscoedu-yellow">Orientación educativa</p>
          <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-5xl">
            Encuentra opciones educativas con orientación inteligente.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-100 sm:text-lg">
            BuscoEdu te ayuda a explorar alternativas de estudio, aclarar tu perfil educativo y, solo si lo
            autorizas, conectarte con universidades aliadas.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="#formulario-interes"
              className="inline-flex items-center rounded-md bg-buscoedu-teal px-5 py-2.5 font-semibold text-white transition hover:brightness-95"
            >
              Hablar con NaIA
            </Link>
            <Link
              href="/programas"
              className="inline-flex items-center rounded-md border border-white px-5 py-2.5 font-semibold text-white transition hover:bg-white/10"
            >
              Explorar opciones
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-100">No compartimos tus datos con universidades sin tu autorización.</p>
        </div>
      </section>

      <section className="rounded-xl border border-buscoedu-border bg-white p-6 shadow-card sm:p-8">
        <SectionHeading
          title="Buscador inicial"
          description="Visualiza cómo podrás filtrar opciones educativas por área y contexto. En esta fase aún no ejecuta búsqueda real."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <VisualField label="¿Qué quieres estudiar?" placeholder="Ej. Tecnología" />
          <VisualField label="Nivel académico" placeholder="Ej. Técnico, pregrado" />
          <VisualField label="Modalidad" placeholder="Ej. Virtual" />
          <VisualField label="Ciudad" placeholder="Ej. Bogotá" />
        </div>
        <Link
          href="/programas"
          className="mt-5 inline-flex items-center rounded-md bg-buscoedu-blue px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
        >
          Ver opciones
        </Link>
      </section>

      <section>
        <SectionHeading
          eyebrow="Cómo funciona"
          title="Un proceso simple para orientarte mejor"
          description="BuscoEdu te acompaña paso a paso para que tomes decisiones informadas sin promesas irreales."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {pasos.map((paso) => (
            <InfoCard key={paso.title} title={paso.title} description={paso.description} />
          ))}
        </div>
        <Link href="/como-funciona" className="mt-6 inline-flex text-sm font-semibold text-buscoedu-blue underline">
          Conocer el proceso completo
        </Link>
      </section>

      <section className="rounded-xl border border-buscoedu-border bg-white p-6 shadow-card sm:p-8" id="naia-home">
        <SectionHeading
          eyebrow="Conoce a NaIA"
          title="NaIA es la asesora virtual de BuscoEdu"
          description="NaIA te ayuda a organizar tus ideas, entender opciones de formación y prepararte para conversar con instituciones aliadas cuando tú lo decidas."
        />
        <Link
          href="#formulario-interes"
          className="inline-flex items-center rounded-md bg-buscoedu-teal px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
        >
          Hablar con NaIA
        </Link>
      </section>

      <section id="beneficios">
        <SectionHeading
          eyebrow="Beneficios"
          title="Beneficios para estudiantes"
          description="Herramientas y orientación para explorar rutas educativas con mayor claridad y confianza."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {beneficios.map((beneficio) => (
            <InfoCard key={beneficio.title} title={beneficio.title} description={beneficio.description} />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-buscoedu-border bg-white p-6 shadow-card sm:p-8" id="para-universidades">
        <SectionHeading
          eyebrow="Para universidades"
          title="Conectamos intención educativa con consentimiento"
          description="BuscoEdu ayuda a universidades aliadas a recibir oportunidades con contexto de interés, siempre respetando el consentimiento expreso de cada persona."
        />
        <Link href="/para-universidades" className="inline-flex text-sm font-semibold text-buscoedu-blue underline">
          Conocer propuesta para universidades
        </Link>
      </section>

      <section className="rounded-xl border border-buscoedu-border bg-white p-6 shadow-card sm:p-8" id="privacidad-consentimiento">
        <SectionHeading
          eyebrow="Privacidad y consentimiento"
          title="Tus datos solo se comparten si tú lo autorizas"
          description="La privacidad es central en BuscoEdu. No transferimos datos personales a universidades aliadas sin autorización expresa y verificable."
        />
        <Link href="/privacidad" className="inline-flex text-sm font-semibold text-buscoedu-blue underline">
          Ver política de privacidad
        </Link>
      </section>

      <InterestForm />
    </div>
  );
}

function VisualField({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-buscoedu-text">{label}</label>
      <input
        disabled
        placeholder={placeholder}
        className="w-full rounded-md border border-buscoedu-border bg-slate-50 px-3 py-2 text-sm text-buscoedu-muted"
      />
    </div>
  );
}
