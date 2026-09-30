import Link from "next/link";

interface ClosingCtasProps {
  description?: string;
  className?: string;
}

/** Cierre estándar: CTA primario de vigentes + NaIA secundaria. */
export default function ClosingCtas({
  description = "Cuando quieras avanzar, elige cómo empezar.",
  className = "",
}: ClosingCtasProps) {
  return (
    <section
      className={`mt-12 rounded-xl border border-buscoedu-border bg-white p-6 shadow-card sm:p-8 ${className}`}
      aria-label="Próximos pasos"
    >
      <p className="mb-5 text-sm text-buscoedu-muted">{description}</p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/explorar"
          className="inline-flex items-center rounded-md bg-buscoedu-action px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-buscoedu-actionHover"
        >
          Ver programas vigentes
        </Link>
        <Link
          href="/naia"
          className="inline-flex items-center rounded-md border border-buscoedu-ink px-5 py-2.5 text-sm font-semibold text-buscoedu-ink transition hover:bg-buscoedu-sage"
        >
          Hacerlo con NaIA
        </Link>
      </div>
    </section>
  );
}
