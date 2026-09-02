"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import OfferCard from "@/components/explorar/OfferCard";
import OfferDetailModal from "@/components/explorar/OfferDetailModal";
import { useMyList } from "@/src/contexts/MyListContext";
import { callNaia, type NaiaResponse } from "@/src/lib/naia-real";
import {
  obtenerOfertas,
  type FiltrosOferta,
  type OfertaAcademica,
} from "@/src/lib/ofertas";

type EstadoBusqueda = "inicio" | "interpretando" | "consultando" | "listo" | "error";
type Orden = "recomendado" | "virtual" | "beneficio" | "universidad";

const PROMPTS_INICIALES = [
  "Quiero encontrar una carrera.",
  "Busco una beca o un beneficio.",
  "Quiero estudiar virtual.",
];

const ORDENES: Array<{ id: Orden; etiqueta: string }> = [
  { id: "recomendado", etiqueta: "Recomendados" },
  { id: "virtual", etiqueta: "Modalidad virtual" },
  { id: "beneficio", etiqueta: "Con beneficios" },
  { id: "universidad", etiqueta: "Universidad A–Z" },
];

function filtrosConValor(filtros: NaiaResponse["filtros"]): FiltrosOferta {
  return Object.fromEntries(
    Object.entries(filtros).filter(([, valor]) => typeof valor === "string" && valor.trim())
  ) as FiltrosOferta;
}

function esVirtual(oferta: OfertaAcademica) {
  return (oferta.programa?.modalidad ?? "").toLocaleLowerCase().includes("virtual");
}

export default function NaiaSearchExperience() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q")?.trim() ?? "";
  const hasProcessedInitialQuery = useRef(false);
  const { isInMyList, addToMyList, removeFromMyList } = useMyList();
  const [input, setInput] = useState("");
  const [estado, setEstado] = useState<EstadoBusqueda>("inicio");
  const [respuesta, setRespuesta] = useState<NaiaResponse | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [ofertas, setOfertas] = useState<OfertaAcademica[]>([]);
  const [total, setTotal] = useState(0);
  const [orden, setOrden] = useState<Orden>("recomendado");
  const [seleccionada, setSeleccionada] = useState<OfertaAcademica | null>(null);

  const buscar = async (mensaje: string) => {
    const texto = mensaje.trim();
    if (!texto) return;

    setInput("");
    setEstado("interpretando");
    try {
      const siguienteRespuesta = await callNaia(texto, conversationId);
      setRespuesta(siguienteRespuesta);
      setConversationId(siguienteRespuesta.conversationId);

      setEstado("consultando");
      const resultado = await obtenerOfertas(filtrosConValor(siguienteRespuesta.filtros), 0, 24);
      setOfertas(resultado.ofertas);
      setTotal(resultado.total);
      setEstado("listo");
    } catch {
      setEstado("error");
    }
  };

  useEffect(() => {
    if (!initialQuery || hasProcessedInitialQuery.current) return;
    hasProcessedInitialQuery.current = true;
    void buscar(initialQuery);
    // La consulta inicial se procesa una vez para no repetirla al renderizar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const ofertasOrdenadas = useMemo(() => {
    const copia = [...ofertas];
    if (orden === "virtual") return copia.sort((a, b) => Number(esVirtual(b)) - Number(esVirtual(a)));
    if (orden === "beneficio") return copia.sort((a, b) => Number((b.beneficios?.length ?? 0) > 0) - Number((a.beneficios?.length ?? 0) > 0));
    if (orden === "universidad") return copia.sort((a, b) => (a.universidad?.nombre ?? "").localeCompare(b.universidad?.nombre ?? "", "es"));
    return copia;
  }, [ofertas, orden]);

  const mostrarResultados = estado !== "inicio";
  const estaCargando = estado === "interpretando" || estado === "consultando";

  const enviar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void buscar(input);
  };

  const alternarLista = (oferta: OfertaAcademica) => {
    if (isInMyList(oferta.id)) removeFromMyList(oferta.id);
    else addToMyList(oferta.id);
  };

  return (
    <div className="bg-[#f7f9fc] lg:h-[calc(100vh-73px)] lg:overflow-hidden">
      <div className="mx-auto grid w-full max-w-[1600px] lg:h-full lg:grid-cols-[minmax(0,1.65fr)_minmax(360px,0.85fr)]">
        <main className="relative min-h-[calc(100vh-73px)] border-b border-buscoedu-border bg-white px-5 pb-36 pt-8 sm:px-8 lg:h-full lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-12 lg:pb-40 lg:pt-12">
          {mostrarResultados ? (
            <section className="mx-auto max-w-3xl pb-8">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-buscoedu-teal">NaIA analizó tu búsqueda</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-buscoedu-blue sm:text-4xl">Opciones para avanzar con claridad</h1>

              <div className="mt-6 rounded-2xl border border-buscoedu-border bg-buscoedu-bg/60 p-5 shadow-sm">
                {estaCargando ? (
                  <div className="flex items-center gap-3 text-buscoedu-text" role="status" aria-live="polite">
                    <span className="h-3 w-3 animate-pulse rounded-full bg-buscoedu-teal" />
                    <span>{estado === "interpretando" ? "Entendiendo lo que buscas…" : "Consultando opciones vigentes…"}</span>
                  </div>
                ) : (
                  <>
                    <p className="text-base leading-relaxed text-buscoedu-text">{respuesta?.mensaje}</p>
                    {respuesta?.pregunta_seguimiento && <p className="mt-3 text-sm font-medium text-buscoedu-blue">{respuesta.pregunta_seguimiento}</p>}
                  </>
                )}
              </div>

              <div className="mt-7 grid gap-3 sm:grid-cols-3">
                <InsightCard title="Enfoque académico" text="Revisa que el programa, nivel y duración correspondan con la meta que describes." />
                <InsightCard title="Flexibilidad" text="Compara modalidad, ciudad y horarios antes de decidir a qué opción aplicar." />
                <InsightCard title="Inversión y beneficios" text="Prioriza las alternativas con beneficios vigentes y valida sus condiciones en la ficha." />
              </div>

              <div className="mt-8">
                <h2 className="text-sm font-semibold text-buscoedu-text">Ordena los resultados</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ORDENES.map((opcion) => (
                    <button key={opcion.id} type="button" onClick={() => setOrden(opcion.id)} className={`rounded-full border px-3 py-2 text-sm font-medium transition ${orden === opcion.id ? "border-buscoedu-blue bg-buscoedu-blue text-white" : "border-buscoedu-border bg-white text-buscoedu-text hover:border-buscoedu-blue"}`}>
                      {opcion.etiqueta}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <section className="mx-auto flex min-h-[calc(100vh-250px)] max-w-3xl flex-col justify-center pb-8">
              <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-buscoedu-teal/10 text-2xl font-bold text-buscoedu-teal">N</span>
              <p className="mt-7 text-sm font-semibold uppercase tracking-[0.18em] text-buscoedu-teal">Tu búsqueda educativa, acompañada</p>
              <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight text-buscoedu-blue sm:text-5xl">Hola, soy NaIA.</h1>
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-buscoedu-muted">Cuéntame qué quieres estudiar, dónde te gustaría hacerlo o qué necesitas para empezar. Te ayudaré a explorar opciones y compararlas con calma.</p>
              <div className="mt-8 flex flex-wrap gap-2">
                {PROMPTS_INICIALES.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => void buscar(prompt)} className="rounded-full border border-buscoedu-border bg-white px-4 py-2.5 text-sm font-medium text-buscoedu-blue transition hover:border-buscoedu-teal hover:bg-buscoedu-teal/5">
                    {prompt}
                  </button>
                ))}
              </div>
              <p className="mt-8 max-w-xl text-sm leading-relaxed text-buscoedu-muted">Puedes explorar sin registrarte. Solo compartiremos tus datos con una institución si lo autorizas expresamente.</p>
            </section>
          )}

          <form onSubmit={enviar} className="absolute bottom-0 left-0 right-0 z-20 border-t border-buscoedu-border bg-white/95 px-5 py-4 backdrop-blur sm:px-8 lg:px-12">
            <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border border-buscoedu-border bg-white p-2 shadow-[0_10px_30px_rgba(17,45,84,0.12)]">
              <textarea value={input} onChange={(event) => setInput(event.target.value)} rows={1} placeholder="Cuéntale a NaIA qué estás buscando…" className="min-h-[48px] flex-1 resize-none bg-transparent px-3 py-3 text-base text-buscoedu-text outline-none placeholder:text-slate-400" aria-label="Mensaje para NaIA" />
              <button type="submit" disabled={!input.trim() || estaCargando} className="inline-flex h-11 items-center gap-2 rounded-xl bg-buscoedu-blue px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
                {estaCargando ? "Buscando" : "Enviar"}<span aria-hidden="true">→</span>
              </button>
            </div>
          </form>
        </main>

        <aside className="bg-[#f7f9fc] px-5 py-8 sm:px-8 lg:h-full lg:overflow-y-auto lg:px-6 lg:py-10">
          <div className="mx-auto max-w-xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-buscoedu-teal">Resultados</p>
            <h2 className="mt-2 text-2xl font-bold text-buscoedu-blue">{mostrarResultados ? (estaCargando ? "Preparando opciones…" : `${total} opciones encontradas`) : "Tus opciones aparecerán aquí"}</h2>
            <p className="mt-2 text-sm leading-relaxed text-buscoedu-muted">{mostrarResultados ? "Abre una ficha para ver requisitos, beneficios y cómo aplicar." : "Cuando hables con NaIA, podrás comparar alternativas vigentes sin salir de la conversación."}</p>
            {estaCargando ? <ResultSkeleton /> : ofertasOrdenadas.length > 0 ? (
              <div className="mt-6 grid gap-4">
                {ofertasOrdenadas.map((oferta) => <OfferCard key={oferta.id} oferta={oferta} onCardClick={() => setSeleccionada(oferta)} isInMyList={isInMyList(oferta.id)} onToggleMyList={() => alternarLista(oferta)} />)}
              </div>
            ) : mostrarResultados && estado === "listo" ? (
              <div className="mt-6 rounded-2xl border border-dashed border-buscoedu-border bg-white p-6 text-sm leading-relaxed text-buscoedu-muted">No encontramos una coincidencia exacta todavía. Cuéntale a NaIA otra alternativa de área, ciudad, modalidad o nivel para ampliar la búsqueda.</div>
            ) : <EmptyResults />}
          </div>
        </aside>
      </div>
      <OfferDetailModal oferta={seleccionada} onClose={() => setSeleccionada(null)} />
    </div>
  );
}

function InsightCard({ title, text }: { title: string; text: string }) {
  return <article className="rounded-xl border border-buscoedu-border bg-white p-4"><h3 className="font-semibold text-buscoedu-blue">{title}</h3><p className="mt-2 text-sm leading-relaxed text-buscoedu-muted">{text}</p></article>;
}

function ResultSkeleton() {
  return <div className="mt-6 space-y-4" aria-live="polite"><div className="h-56 animate-pulse rounded-xl bg-slate-200" /><div className="h-56 animate-pulse rounded-xl bg-slate-200" /></div>;
}

function EmptyResults() {
  return <div className="mt-8 rounded-2xl border border-dashed border-buscoedu-border bg-white p-7"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-buscoedu-teal/10 font-bold text-buscoedu-teal">N</div><p className="mt-4 font-semibold text-buscoedu-blue">Una conversación, resultados organizados.</p><p className="mt-2 text-sm leading-relaxed text-buscoedu-muted">NaIA interpretará tu búsqueda y traerá aquí las ofertas que puedes abrir, guardar y comparar.</p></div>;
}
