"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getOrCreateVisitorId } from "@/src/lib/visitor";
import { trackNaiaModalOpened, trackSearchIntention } from "@/src/lib/events";
import { NOMBRES_ALIADAS } from "@/src/lib/aliadas-publicas";

/** Sugerencias: no anclan el número de IES. */
const SUGERENCIAS = [
  "Quiero un posgrado virtual.",
  "Busco un pregrado en universidades con acuerdo.",
  "Quiero estudiar virtual.",
  "No sé qué nivel me sirve todavía.",
];

export default function NaiaHomeHero() {
  const [intencion, setIntencion] = useState("");
  const [mostrarAviso, setMostrarAviso] = useState(false);
  const router = useRouter();

  const iniciarConNaia = (texto?: string) => {
    const valor = (texto ?? intencion).trim();
    if (!valor) {
      setMostrarAviso(true);
      return;
    }

    getOrCreateVisitorId()
      .then(() => {
        trackNaiaModalOpened();
        trackSearchIntention(valor);
      })
      .catch(() => undefined);

    router.push(`/naia?q=${encodeURIComponent(valor)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      iniciarConNaia();
    }
  };

  return (
    {/* En móvil el FAB queda en el margen derecho: el texto y los botones no pasan por debajo. */}
    <section className="overflow-hidden rounded-2xl bg-buscoedu-ink px-6 py-10 text-white max-md:pb-8 max-md:pr-28 sm:px-10 sm:py-12">
      <div className="grid items-center gap-8 lg:grid-cols-2">
        <div>
          <p className="font-display text-sm font-semibold uppercase tracking-widest text-teal-200">
            Universidades con acuerdo
          </p>
          <h1 className="mt-4 font-display text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">
            Programas vigentes de universidades con acuerdo.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-100 sm:text-lg">
            Instituciones que ya aceptaron trabajar con BuscoEdu. Si no hay para lo
            que buscas, te lo decimos. El contacto va solo si tú lo autorizas, a una
            universidad por nombre.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {NOMBRES_ALIADAS.map((nombre) => (
              <li
                key={nombre}
                className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-white"
              >
                {nombre}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-slate-200 max-md:pr-2">
            BuscoEdu no es una universidad y no garantiza admisión, precios ni becas.
            Tus datos solo se comparten con la institución que tú marques.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/explorar"
              className="inline-flex items-center rounded-md bg-buscoedu-action px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-buscoedu-actionHover"
            >
              Ver programas vigentes
            </Link>
            <Link
              href="/naia"
              className="inline-flex items-center rounded-md border border-white/80 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Hacerlo con NaIA
            </Link>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 text-buscoedu-ink shadow-card sm:p-6">
          <div className="mb-3 flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-buscoedu-sage text-lg font-bold text-buscoedu-action">
              N
            </span>
            <div>
              <p className="font-display text-base font-semibold text-buscoedu-ink">
                NaIA puede acompañarte
              </p>
              <p className="text-xs text-buscoedu-muted">Misma oferta con acuerdo, en conversación</p>
            </div>
          </div>

          <label htmlFor="naia-home-intencion" className="sr-only">
            Cuéntale a NaIA qué te gustaría estudiar
          </label>
          <textarea
            id="naia-home-intencion"
            value={intencion}
            onChange={(e) => {
              setIntencion(e.target.value);
              setMostrarAviso(false);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Por ejemplo: Busco una maestría virtual en administración..."
            rows={3}
            className="w-full resize-none rounded-lg border border-buscoedu-border px-4 py-3 text-sm focus:border-transparent focus:ring-2 focus:ring-buscoedu-action"
          />
          {mostrarAviso && (
            <p className="mt-2 text-sm text-buscoedu-warn">
              Escribe brevemente lo que buscas o elige una sugerencia.
            </p>
          )}

          <button
            type="button"
            onClick={() => iniciarConNaia()}
            className="mt-3 w-full rounded-lg border border-buscoedu-ink px-6 py-3 font-semibold text-buscoedu-ink transition-colors hover:bg-buscoedu-sage"
          >
            Hacerlo con NaIA
          </button>

          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-buscoedu-muted">O elige una sugerencia:</p>
            <div className="flex flex-wrap gap-2">
              {SUGERENCIAS.map((sugerencia) => (
                <button
                  key={sugerencia}
                  type="button"
                  onClick={() => iniciarConNaia(sugerencia)}
                  className="rounded-full border border-buscoedu-border px-3 py-1.5 text-xs text-buscoedu-ink transition-colors hover:border-buscoedu-action hover:bg-buscoedu-sage"
                >
                  {sugerencia}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
