"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateVisitorId } from "@/src/lib/visitor";
import { trackNaiaModalOpened, trackSearchIntention } from "@/src/lib/events";

/**
 * Hero de la Home con NaIA como protagonista.
 *
 * IMPORTANTE: no crea una segunda instancia de chat de NaIA. Reutiliza la
 * MISMA conexión/experiencia: al enviar el mensaje inicial (o elegir una
 * sugerencia) enruta a `/naia?q=...`, donde vive el chat real de NaIA
 * (la experiencia NaIA) y la ejecución del agente. De esta forma la conversación
 * continúa sin duplicar el agente ni su estado.
 */

const SUGERENCIAS = [
  "Quiero encontrar una carrera.",
  "Busco una beca o descuento.",
  "Quiero estudiar virtual.",
  "No sé qué estudiar todavía.",
  "Quiero comparar universidades."
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

    // Reutiliza el tracking existente y enruta a la experiencia real de NaIA.
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
    <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-buscoedu-blue to-[#1d4d88] px-6 py-10 text-white sm:px-10 sm:py-12">
      <div className="grid items-center gap-8 lg:grid-cols-2">
        {/* Columna de mensaje */}
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-buscoedu-yellow">
            Orientación educativa con NaIA
          </p>
          <h1 className="mt-4 text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
            Encuentra opciones educativas que encajen contigo.
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-100 sm:text-lg">
            Habla con NaIA, explora ofertas académicas vigentes y compara alternativas antes de
            decidir cómo avanzar.
          </p>
          <p className="mt-4 text-sm text-slate-200">
            Puedes explorar sin registrarte. Tus datos solo se compartirán con una universidad si tú
            lo autorizas.
          </p>
        </div>

        {/* Columna de entrada de NaIA (protagonista) */}
        <div className="rounded-2xl bg-white p-5 text-buscoedu-text shadow-card sm:p-6">
          <div className="mb-3 flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-buscoedu-teal/10 text-lg font-bold text-buscoedu-teal">
              N
            </span>
            <div>
              <p className="text-base font-bold text-buscoedu-blue">Hola, soy NaIA</p>
              <p className="text-xs text-buscoedu-muted">La asesora virtual de BuscoEdu</p>
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
            placeholder="Por ejemplo: Busco una maestría en administración, virtual, con beca..."
            rows={3}
            className="w-full resize-none rounded-lg border border-buscoedu-border px-4 py-3 text-sm focus:border-transparent focus:ring-2 focus:ring-buscoedu-blue"
          />
          {mostrarAviso && (
            <p className="mt-2 text-sm text-amber-600">
              Escribe brevemente lo que buscas o elige una sugerencia.
            </p>
          )}

          <button
            type="button"
            onClick={() => iniciarConNaia()}
            className="mt-3 w-full rounded-lg bg-buscoedu-blue px-6 py-3 font-semibold text-white transition-colors hover:brightness-95"
          >
            Empezar con NaIA
          </button>

          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-buscoedu-muted">O elige una sugerencia:</p>
            <div className="flex flex-wrap gap-2">
              {SUGERENCIAS.map((sugerencia) => (
                <button
                  key={sugerencia}
                  type="button"
                  onClick={() => iniciarConNaia(sugerencia)}
                  className="rounded-full border border-buscoedu-border px-3 py-1.5 text-xs text-buscoedu-text transition-colors hover:border-buscoedu-teal hover:bg-buscoedu-teal/5"
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
