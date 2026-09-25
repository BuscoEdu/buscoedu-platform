import Link from "next/link";

interface ClosingCtasProps {
  description?: string;
  className?: string;
}

/** Cierre estándar: Hablar con NaIA + Explorar ofertas. */
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
          href="/naia"
          className="inline-flex items-center rounded-md bg-buscoedu-teal px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
        >
          Hablar con NaIA
        </Link>
        <Link
          href="/explorar"
          className="inline-flex items-center rounded-md border border-buscoedu-blue px-5 py-2.5 text-sm font-semibold text-buscoedu-blue transition hover:bg-buscoedu-blue/5"
        >
          Explorar ofertas
        </Link>
      </div>
    </section>
  );
}
