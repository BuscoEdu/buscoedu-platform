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
import {
  getUniversityColor,
  getUniversityTextColor,
} from "@/src/lib/university-colors";

type EstadoBusqueda = "inicio" | "interpretando" | "consultando" | "listo" | "error";
type Orden = "recomendado" | "virtual" | "beneficio" | "universidad";
type MensajeChat = { id: string; autor: "estudiante" | "naia"; contenido: string };
type ChipFiltro = { clave: keyof FiltrosOferta; etiqueta: string; valor: string };
type LayoutVariant = "naia" | "explorar";
type VistaExplorar = "programas" | "universidades";

function parseVista(raw: string | null): VistaExplorar | null {
  if (raw === "programas" || raw === "universidades") return raw;
  return null;
}

const NAIA_CHAT_STATE_KEY = "buscoedu_naia_chat_v1";

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

interface NaiaSearchExperienceProps {
  layoutVariant?: LayoutVariant;
}

function filtrosConValor(filtros: NaiaResponse["filtros"]): FiltrosOferta {
  return Object.fromEntries(
    Object.entries(filtros).filter(([, valor]) => typeof valor === "string" && valor.trim())
  ) as FiltrosOferta;
}

function etiquetaFiltro(clave: keyof FiltrosOferta): string {
  const etiquetas: Record<keyof FiltrosOferta, string> = {
    programa_o_area: "Área o programa",
    modalidad: "Modalidad",
    ciudad: "Ciudad",
    pais: "País",
    nivel_academico: "Nivel",
    tipo_beneficio: "Beneficio",
    universidad: "Universidad",
  };
  return etiquetas[clave];
}

function esVirtual(oferta: OfertaAcademica) {
  return (oferta.programa?.modalidad ?? "").toLocaleLowerCase().includes("virtual");
}

export default function NaiaSearchExperience({ layoutVariant = "naia" }: NaiaSearchExperienceProps) {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q")?.trim() ?? "";
  const vistaParam = parseVista(searchParams.get("vista"));
  const hasProcessedInitialQuery = useRef(false);
  const hasProcessedVista = useRef(false);
  const { isInMyList, addToMyList, removeFromMyList } = useMyList();

  const [input, setInput] = useState("");
  const [estado, setEstado] = useState<EstadoBusqueda>("inicio");
  const [vistaActiva, setVistaActiva] = useState<VistaExplorar | null>(vistaParam);
  const [respuesta, setRespuesta] = useState<NaiaResponse | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [ofertas, setOfertas] = useState<OfertaAcademica[]>([]);
  const [total, setTotal] = useState(0);
  const [filtrosActuales, setFiltrosActuales] = useState<FiltrosOferta>({});
  const [orden, setOrden] = useState<Orden>("recomendado");
  const [seleccionada, setSeleccionada] = useState<OfertaAcademica | null>(null);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [mostrarResultadosMovil, setMostrarResultadosMovil] = useState(false);
  const [alturaLayoutDesktop, setAlturaLayoutDesktop] = useState<number | null>(null);
  const historialRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(NAIA_CHAT_STATE_KEY);
      if (!guardado) return;
      const estadoGuardado = JSON.parse(guardado) as { conversationId?: string; mensajes?: MensajeChat[] };
      if (estadoGuardado.conversationId) setConversationId(estadoGuardado.conversationId);
      if (Array.isArray(estadoGuardado.mensajes)) setMensajes(estadoGuardado.mensajes);
    } catch {
      // Un estado local inválido no debe romper la experiencia.
    }
  }, []);

  useEffect(() => {
    if (!mensajes.length) {
      sessionStorage.removeItem(NAIA_CHAT_STATE_KEY);
      return;
    }
    sessionStorage.setItem(NAIA_CHAT_STATE_KEY, JSON.stringify({ conversationId, mensajes }));
    historialRef.current?.scrollTo({ top: historialRef.current.scrollHeight, behavior: "smooth" });
  }, [conversationId, mensajes]);

  /**
   * Altura robusta para desktop: reserva espacio de footer y evita doble scroll global.
   */
  useEffect(() => {
    const recalcularAltura = () => {
      if (window.innerWidth < 1024) {
        setAlturaLayoutDesktop(null);
        return;
      }
      const header = document.querySelector("header");
      const footer = document.querySelector("footer");
      const altoHeader = header?.getBoundingClientRect().height ?? 0;
      const altoFooter = footer?.getBoundingClientRect().height ?? 0;
      const margenSeguridad = 28;
      const disponible = Math.floor(window.innerHeight - altoHeader - altoFooter - margenSeguridad);
      setAlturaLayoutDesktop(Math.max(280, disponible));
    };

    recalcularAltura();
    window.addEventListener("resize", recalcularAltura);

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(recalcularAltura) : null;
    const header = document.querySelector("header");
    const footer = document.querySelector("footer");
    if (observer && header) observer.observe(header);
    if (observer && footer) observer.observe(footer);

    return () => {
      window.removeEventListener("resize", recalcularAltura);
      observer?.disconnect();
    };
  }, []);

  /**
   * Al abrir resultados en móvil: ocultamos header global y bloqueamos scroll del body.
   */
  useEffect(() => {
    if (!mostrarResultadosMovil) return;
    if (window.innerWidth >= 1024) return;

    const header = document.querySelector("header") as HTMLElement | null;
    const originalHeaderDisplay = header?.style.display;
    const originalOverflow = document.body.style.overflow;

    if (header) header.style.display = "none";
    document.body.style.overflow = "hidden";

    return () => {
      if (header) header.style.display = originalHeaderDisplay ?? "";
      document.body.style.overflow = originalOverflow;
    };
  }, [mostrarResultadosMovil]);

  const consultarOfertas = async (filtros: FiltrosOferta) => {
    const resultado = await obtenerOfertas(filtros, 0, 10);
    setFiltrosActuales(filtros);
    setOfertas(resultado.ofertas);
    setTotal(Math.max(resultado.total, resultado.ofertas.length));
    return resultado;
  };

  const construirMensajeConteo = (cantidad: number) => {
    if (cantidad <= 0) {
      return "No encontré resultados con esos criterios (0 resultados). Puedes ampliar la búsqueda o limpiar filtros para ver más opciones vigentes.";
    }
    return `Encontré ${cantidad} ${cantidad === 1 ? "opción" : "opciones"} que coinciden con tu búsqueda.`;
  };

  /**
   * Prepara contexto de ofertas para resolver preguntas de detalle sin inventar datos.
   */
  const construirContextoOfertasParaNaia = (
    listaOfertas: OfertaAcademica[],
    filtros: FiltrosOferta,
    totalResultados: number
  ) => ({
    filtros_actuales: Object.fromEntries(
      Object.entries(filtros).filter(([, valor]) => typeof valor === "string" && valor.trim())
    ) as Record<string, string>,
    total_resultados: totalResultados,
    ofertas_relevantes: listaOfertas.slice(0, 8).map((oferta) => ({
      id: oferta.id,
      nombre: oferta.nombre,
      descripcion: oferta.descripcion,
      vigente_desde: oferta.vigente_desde,
      vigente_hasta: oferta.vigente_hasta,
      cupos_disponibles: oferta.cupos_disponibles,
      tipo_beneficio: oferta.tipo_beneficio,
      programa: oferta.programa,
      universidad: oferta.universidad,
      sede: oferta.sede,
      beneficios: oferta.beneficios,
    })),
  });

  const buscar = async (mensaje: string) => {
    const texto = mensaje.trim();
    if (!texto) return;

    setInput("");
    setMensajes((actuales) => [...actuales, { id: `estudiante-${Date.now()}`, autor: "estudiante", contenido: texto }]);
    setEstado("interpretando");

    try {
      const siguienteRespuesta = await callNaia(
        texto,
        conversationId,
        construirContextoOfertasParaNaia(ofertas, filtrosActuales, total)
      );
      setRespuesta(siguienteRespuesta);
      setConversationId(siguienteRespuesta.conversationId);

      setEstado("consultando");
      const filtros = filtrosConValor(siguienteRespuesta.filtros);
      const resultado = await consultarOfertas(filtros);
      const conteo = Math.max(resultado.total, resultado.ofertas.length);

      const bloques = [
        siguienteRespuesta.mensaje,
        construirMensajeConteo(conteo),
        conteo === 0 ? null : siguienteRespuesta.pregunta_seguimiento,
      ].filter(Boolean);

      setMensajes((actuales) => [
        ...actuales,
        {
          id: `naia-${Date.now()}`,
          autor: "naia",
          contenido: bloques.join("\n\n"),
        },
      ]);

      setEstado("listo");
    } catch {
      setEstado("error");
      setMensajes((actuales) => [
        ...actuales,
        {
          id: `naia-error-${Date.now()}`,
          autor: "naia",
          contenido: "Tuve un inconveniente para responder. Inténtalo de nuevo, por favor.",
        },
      ]);
    }
  };

  const cargarMasResultados = async () => {
    if (estaCargando || ofertas.length >= total) return;
    try {
      const resultado = await obtenerOfertas(filtrosActuales, ofertas.length, 10);
      setOfertas((actuales) => {
        const porId = new Map(actuales.map((oferta) => [oferta.id, oferta]));
        resultado.ofertas.forEach((oferta) => porId.set(oferta.id, oferta));
        return Array.from(porId.values());
      });
      setTotal((totalActual) => Math.max(totalActual, resultado.total, resultado.ofertas.length));
    } catch {
      setEstado("error");
    }
  };

  const quitarFiltro = async (clave: keyof FiltrosOferta) => {
    const siguiente = { ...filtrosActuales };
    delete siguiente[clave];

    setEstado("consultando");
    try {
      const resultado = await consultarOfertas(siguiente);
      const conteo = Math.max(resultado.total, resultado.ofertas.length);
      setMensajes((actuales) => [
        ...actuales,
        {
          id: `naia-chip-${Date.now()}`,
          autor: "naia",
          contenido: `Quité el filtro “${etiquetaFiltro(clave)}”. ${construirMensajeConteo(conteo)}`,
        },
      ]);
      setEstado("listo");
    } catch {
      setEstado("error");
    }
  };

  const reiniciarBusqueda = async () => {
    setEstado("consultando");
    setConversationId(undefined);
    setRespuesta(null);
    setMensajes([]);

    try {
      const resultado = await consultarOfertas({});
      const conteo = Math.max(resultado.total, resultado.ofertas.length);
      setMensajes([
        {
          id: `naia-reset-${Date.now()}`,
          autor: "naia",
          contenido: `Reinicié la búsqueda y limpié los filtros anteriores. ${construirMensajeConteo(conteo)}`,
        },
      ]);
      setEstado("listo");
    } catch {
      setEstado("error");
    }
  };

  useEffect(() => {
    if (!initialQuery || hasProcessedInitialQuery.current) return;
    hasProcessedInitialQuery.current = true;
    void buscar(initialQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  /** Sync URL ?vista= with local view mode (Programas / Universidades prefilter). */
  useEffect(() => {
    setVistaActiva(vistaParam);
    if (vistaParam === "universidades") {
      setOrden("universidad");
    } else if (vistaParam === "programas") {
      setOrden("recomendado");
    }
  }, [vistaParam]);

  /**
   * Minimal wiring: when /explorar?vista=… opens without q, load catalog once
   * so the prefilter view has results without inventing data.
   */
  useEffect(() => {
    if (!vistaParam || initialQuery || hasProcessedVista.current) return;
    hasProcessedVista.current = true;
    void (async () => {
      setEstado("consultando");
      try {
        const resultado = await consultarOfertas({});
        const conteo = Math.max(resultado.total, resultado.ofertas.length);
        const etiqueta =
          vistaParam === "programas"
            ? "Vista Programas: listado de ofertas agrupado por programa."
            : "Vista Universidades: listado ordenado por universidad.";
        setMensajes([
          {
            id: `naia-vista-${Date.now()}`,
            autor: "naia",
            contenido: `${etiqueta} ${construirMensajeConteo(conteo)} Puedes seguir filtrando con NaIA cuando quieras.`,
          },
        ]);
        setEstado("listo");
      } catch {
        setEstado("error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vistaParam, initialQuery]);

  const ofertasOrdenadas = useMemo(() => {
    const copia = [...ofertas];
    if (orden === "virtual") return copia.sort((a, b) => Number(esVirtual(b)) - Number(esVirtual(a)));
    if (orden === "beneficio") return copia.sort((a, b) => Number((b.beneficios?.length ?? 0) > 0) - Number((a.beneficios?.length ?? 0) > 0));
    if (orden === "universidad") return copia.sort((a, b) => (a.universidad?.nombre ?? "").localeCompare(b.universidad?.nombre ?? "", "es"));
    return copia;
  }, [ofertas, orden]);

  /** Programas vista: one card per programa_id (no new catalog data). */
  const ofertasVista = useMemo(() => {
    if (vistaActiva !== "programas") return ofertasOrdenadas;
    const vistos = new Set<string>();
    const unicos: OfertaAcademica[] = [];
    for (const oferta of ofertasOrdenadas) {
      const clave = oferta.programa_id || oferta.programa?.nombre || oferta.id;
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      unicos.push(oferta);
    }
    return unicos;
  }, [ofertasOrdenadas, vistaActiva]);

  const chipsFiltros = useMemo<ChipFiltro[]>(() => {
    return (Object.entries(filtrosActuales) as Array<[keyof FiltrosOferta, string | undefined]>)
      .filter(([, valor]) => typeof valor === "string" && valor.trim())
      .map(([clave, valor]) => ({
        clave,
        etiqueta: etiquetaFiltro(clave),
        valor: (valor ?? "").trim(),
      }));
  }, [filtrosActuales]);

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

  /**
   * En móvil permitimos abrir resultados desde sugerencias sin contaminar el chat con filtros.
   */
  const ejecutarSugerencia = (opcion: string) => {
    const normalizada = opcion.toLowerCase();
    if (normalizada.includes("explorar resultados")) {
      setMostrarResultadosMovil(true);
      return;
    }
    void buscar(opcion);
  };

  const tituloResultados = mostrarResultados
    ? estaCargando
      ? "Preparando opciones…"
      : vistaActiva === "programas"
        ? `${ofertasVista.length} programas en vista`
        : vistaActiva === "universidades"
          ? `${total} opciones por universidad`
          : `${total} opciones encontradas`
    : vistaActiva === "programas"
      ? "Vista Programas"
      : vistaActiva === "universidades"
        ? "Vista Universidades"
        : "Tus opciones aparecerán aquí";

  const sugerenciasParaMostrar = useMemo(() => {
    const base = respuesta?.opciones_sugeridas?.slice(0, 3) ?? [];
    if (mostrarResultados && !base.some((x) => x.toLowerCase().includes("explorar resultados"))) {
      return [...base, "Explorar resultados"].slice(0, 3);
    }
    return base;
  }, [mostrarResultados, respuesta?.opciones_sugeridas]);

  const gridClass = layoutVariant === "explorar"
    ? "lg:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.65fr)]"
    : "lg:grid-cols-[minmax(0,1.65fr)_minmax(360px,0.85fr)]";

  return (
    <div
      className="bg-[#f7f9fc] lg:mb-6 lg:overflow-hidden lg:pb-2"
      style={alturaLayoutDesktop ? { height: `${alturaLayoutDesktop}px` } : undefined}
    >
      <div className={`mx-auto grid w-full max-w-[1600px] lg:h-full lg:min-h-0 ${gridClass}`}>
        <main className="relative min-h-[calc(100dvh-73px)] border-b border-buscoedu-border bg-white px-5 pb-44 pt-6 sm:px-8 lg:h-full lg:min-h-0 lg:overflow-hidden lg:border-b-0 lg:border-r lg:px-10 lg:pb-40 lg:pt-8">
          {mostrarResultados ? (
            <section className="mx-auto flex h-[calc(100dvh-180px)] max-w-3xl min-h-0 flex-col lg:h-full lg:max-h-full">
              <div className="mb-4 shrink-0">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-buscoedu-teal">Conversación con NaIA</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-buscoedu-blue">Tu búsqueda educativa</h1>
              </div>

              <div ref={historialRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-5 pr-1" aria-live="polite">
                {mensajes.map((mensaje) => (
                  <div
                    key={mensaje.id}
                    className={
                      mensaje.autor === "estudiante"
                        ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-buscoedu-blue px-4 py-3 text-white"
                        : "max-w-[92%] rounded-2xl rounded-bl-md border border-buscoedu-border bg-buscoedu-bg/60 px-4 py-3 text-buscoedu-text"
                    }
                  >
                    {mensaje.autor === "naia" && <p className="mb-1 text-xs font-semibold text-buscoedu-teal">NaIA</p>}
                    {mensaje.autor === "naia" ? (
                      <TypedText
                        texto={mensaje.contenido}
                        onStep={() => {
                          historialRef.current?.scrollTo({
                            top: historialRef.current.scrollHeight,
                            behavior: "smooth",
                          });
                        }}
                      />
                    ) : (
                      <p className="whitespace-pre-line text-base leading-relaxed">{mensaje.contenido}</p>
                    )}
                  </div>
                ))}

                {estaCargando && (
                  <ThinkingIndicator
                    texto={
                      estado === "interpretando"
                        ? "NaIA está entendiendo tu búsqueda…"
                        : "NaIA está consultando opciones vigentes…"
                    }
                  />
                )}
              </div>
            </section>
          ) : (
            <section className="mx-auto flex min-h-[calc(100dvh-250px)] max-w-3xl flex-col justify-center pb-8">
              <span className="inline-flex h-14 items-center justify-center rounded-2xl bg-buscoedu-teal/10 px-3 text-lg font-bold text-buscoedu-teal">NaIA</span>
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

          {/*
            Barra inferior del chat:
            1) input de mensaje
            2) sugerencias "Puedes continuar con" debajo del input (web y móvil)
          */}
          <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-buscoedu-border bg-white/95 px-5 py-3 backdrop-blur sm:px-8 lg:px-10">
            <form onSubmit={enviar}>
              <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border border-buscoedu-border bg-white p-2 shadow-[0_10px_30px_rgba(17,45,84,0.12)]">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void buscar(input);
                    }
                  }}
                  rows={1}
                  placeholder="Pregúntale a NaIA"
                  className="min-h-[48px] flex-1 resize-none bg-transparent px-3 py-3 text-base text-buscoedu-text outline-none placeholder:text-sm placeholder:text-slate-400 sm:placeholder:text-base"
                  aria-label="Mensaje para NaIA"
                />
                <button type="submit" disabled={!input.trim() || estaCargando} className="inline-flex h-11 items-center gap-2 rounded-xl bg-buscoedu-blue px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
                  {estaCargando ? "Buscando" : "Enviar"}<span aria-hidden="true">→</span>
                </button>
              </div>
            </form>

            {/* Botón Explorar Resultados — solo móvil, cuando hay resultados disponibles */}
            {mostrarResultados && !estaCargando && (
              <div className="mt-3 lg:hidden">
                <button
                  type="button"
                  onClick={() => setMostrarResultadosMovil(true)}
                  className="w-full rounded-xl bg-buscoedu-blue px-4 py-3 text-sm font-semibold text-white"
                >
                  Explorar Resultados →
                </button>
              </div>
            )}

            {sugerenciasParaMostrar.length > 0 && !estaCargando && (
              <div className="mx-auto mt-3 hidden max-w-3xl border-t border-buscoedu-border/80 pt-3 lg:block" aria-label="Opciones debajo del input">
                <div className="rounded-2xl border border-buscoedu-border bg-slate-100 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-buscoedu-muted">Puedes continuar con</p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {sugerenciasParaMostrar.map((opcion) => (
                      <button
                        key={opcion}
                        type="button"
                        onClick={() => ejecutarSugerencia(opcion)}
                        disabled={estaCargando}
                        className="shrink-0 rounded-full border border-buscoedu-teal/40 bg-white px-3 py-2 text-sm font-medium text-buscoedu-blue transition hover:bg-buscoedu-teal/5 disabled:opacity-50"
                      >
                        {opcion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        <aside className="hidden bg-[#f7f9fc] px-5 py-0 sm:px-8 lg:block lg:h-full lg:min-h-0 lg:overflow-y-auto lg:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="sticky top-0 z-20 -mx-5 border-b border-buscoedu-border bg-[#f7f9fc] px-5 py-4 sm:-mx-8 sm:px-8 lg:-mx-6 lg:px-6">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-buscoedu-teal">RESULTADOS</p>
              <h2 className="mt-2 text-2xl font-bold text-buscoedu-blue">{tituloResultados}</h2>
              {vistaActiva && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-buscoedu-teal/10 px-3 py-1 text-xs font-semibold text-buscoedu-teal">
                    {vistaActiva === "programas" ? "Vista: Programas" : "Vista: Universidades"}
                  </span>
                  <a
                    href="/explorar"
                    className="text-xs font-semibold text-buscoedu-blue underline-offset-2 hover:underline"
                  >
                    Quitar vista
                  </a>
                </div>
              )}
              <p className="mt-2 text-sm leading-relaxed text-buscoedu-muted">{mostrarResultados ? "Abre una ficha para ver requisitos, beneficios y cómo aplicar. Usa Guardar en Mi lista, Aplicar o Autorizar contacto según el paso." : "Cuando hables con NaIA, podrás comparar alternativas vigentes sin salir de la conversación."}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {ORDENES.map((opcionOrden) => (
                  <button
                    key={opcionOrden.id}
                    type="button"
                    onClick={() => setOrden(opcionOrden.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      orden === opcionOrden.id
                        ? "border-buscoedu-blue bg-buscoedu-blue text-white"
                        : "border-buscoedu-border bg-white text-buscoedu-muted hover:border-buscoedu-blue hover:text-buscoedu-blue"
                    }`}
                  >
                    {opcionOrden.etiqueta}
                  </button>
                ))}
              </div>

              {/* Los filtros activos viven exclusivamente en la zona de resultados. */}
              <ActiveFiltersBar
                chips={chipsFiltros}
                onRemove={(clave) => void quitarFiltro(clave)}
                onReset={() => void reiniciarBusqueda()}
                className="mt-4"
                showExploreButton={false}
              />
            </div>

            {estaCargando ? (
              <ResultSkeleton />
            ) : ofertasVista.length > 0 ? (
              <div className="mt-6">
                <div className={`grid gap-4 ${layoutVariant === "explorar" ? "sm:grid-cols-2 xl:grid-cols-3" : ""}`}>
                  {ofertasVista.map((oferta) => (
                    <OfferCard
                      key={oferta.id}
                      oferta={oferta}
                      onCardClick={() => setSeleccionada(oferta)}
                      isInMyList={isInMyList(oferta.id)}
                      onToggleMyList={() => alternarLista(oferta)}
                    />
                  ))}
                </div>
                {ofertas.length < total && (
                  <button type="button" onClick={() => void cargarMasResultados()} className="mt-5 w-full rounded-xl border border-buscoedu-blue bg-white px-4 py-3 text-sm font-semibold text-buscoedu-blue transition hover:bg-buscoedu-blue hover:text-white">
                    Mostrar 10 resultados más
                  </button>
                )}
              </div>
            ) : mostrarResultados && estado === "listo" ? (
              <div className="mt-6 rounded-2xl border border-dashed border-buscoedu-border bg-white p-6 text-sm leading-relaxed text-buscoedu-muted">No encontramos una coincidencia exacta todavía. Cuéntale a NaIA otra alternativa de área, ciudad, modalidad o nivel para ampliar la búsqueda.</div>
            ) : (
              <EmptyResults />
            )}
          </div>
        </aside>
      </div>

      <MobileResultsModal
        open={mostrarResultadosMovil}
        onClose={() => setMostrarResultadosMovil(false)}
        tituloResultados={tituloResultados}
        mostrarResultados={mostrarResultados}
        estaCargando={estaCargando}
        estado={estado}
        ofertas={ofertasVista}
        total={total}
        onOpenOffer={(oferta) => setSeleccionada(oferta)}
        onLoadMore={() => void cargarMasResultados()}
        chips={chipsFiltros}
        onRemoveFilter={(clave) => void quitarFiltro(clave)}
        onResetFilters={() => void reiniciarBusqueda()}
      />

      {/* Franja disclaimer solicitada entre experiencia NaIA y footer global. */}
      <section className="border-t border-buscoedu-border bg-slate-100 px-4 py-4 text-sm text-buscoedu-muted sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl leading-relaxed">
          BuscoEdu no es una universidad y no garantiza admisión, precios, becas ni cupos. La orientación ofrecida busca ayudarte a explorar opciones educativas. Cualquier decisión final, requisitos y condiciones dependen de cada universidad aliada.
        </div>
      </section>

      <OfferDetailModal oferta={seleccionada} onClose={() => setSeleccionada(null)} />
    </div>
  );
}

function TypedText({ texto, onStep }: { texto: string; onStep?: () => void }) {
  const [visible, setVisible] = useState("");

  useEffect(() => {
    setVisible("");
    if (!texto) return;
    let indice = 0;
    const intervalo = window.setInterval(() => {
      indice = Math.min(texto.length, indice + 3);
      setVisible(texto.slice(0, indice));
      if (indice >= texto.length) window.clearInterval(intervalo);
    }, 14);
    return () => window.clearInterval(intervalo);
  }, [texto]);

  useEffect(() => {
    onStep?.();
  }, [onStep, visible]);

  return <p className="whitespace-pre-line text-base leading-relaxed text-buscoedu-text" aria-live="polite">{visible}<span className={visible.length < texto.length ? "ml-0.5 inline-block h-4 border-l border-buscoedu-teal align-[-2px] animate-pulse" : ""} /></p>;
}

function ThinkingIndicator({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-buscoedu-border bg-buscoedu-bg/60 px-4 py-3 text-sm text-buscoedu-text">
      {/* Rebote alto para reforzar la percepción de procesamiento activo. */}
      <div className="flex items-center gap-1" aria-hidden="true">
        <span className="h-2 w-2 rounded-full bg-buscoedu-teal" style={{ animation: "naiaDotBounceHigh 0.82s infinite", animationDelay: "-0.24s" }} />
        <span className="h-2 w-2 rounded-full bg-buscoedu-teal" style={{ animation: "naiaDotBounceHigh 0.82s infinite", animationDelay: "-0.12s" }} />
        <span className="h-2 w-2 rounded-full bg-buscoedu-teal" style={{ animation: "naiaDotBounceHigh 0.82s infinite" }} />
      </div>
      <span>{texto}</span>
      <style jsx>{`
        @keyframes naiaDotBounceHigh {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-9px); }
        }
      `}</style>
    </div>
  );
}

function ActiveFiltersBar({
  chips,
  onRemove,
  onReset,
  className,
  showExploreButton,
  onExploreResults,
}: {
  chips: ChipFiltro[];
  onRemove: (clave: keyof FiltrosOferta) => void;
  onReset: () => void;
  className?: string;
  showExploreButton?: boolean;
  onExploreResults?: () => void;
}) {
  return (
    <div className={`rounded-xl border border-buscoedu-border bg-buscoedu-bg/70 p-3 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-buscoedu-muted">Filtros activos</p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onReset} className="text-xs font-semibold text-buscoedu-blue underline-offset-2 hover:underline">
            Limpiar filtros
          </button>
          {showExploreButton && (
            <button
              type="button"
              onClick={onExploreResults}
              className="rounded-lg bg-buscoedu-blue px-3 py-1.5 text-xs font-semibold text-white"
            >
              Explorar resultados
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 overflow-x-auto">
        <div className="flex min-w-max items-center gap-2 whitespace-nowrap pr-1">
          {chips.length === 0 ? (
            <span className="text-sm text-buscoedu-muted">No hay filtros aplicados.</span>
          ) : (
            chips.map((chip) => (
              <button
                key={chip.clave}
                type="button"
                onClick={() => onRemove(chip.clave)}
                className="inline-flex items-center gap-2 rounded-full border border-buscoedu-teal/30 bg-white px-3 py-1 text-xs font-medium text-buscoedu-text"
                title={`Quitar filtro ${chip.etiqueta}`}
              >
                <span>{chip.etiqueta}: <strong>{chip.valor}</strong></span>
                <span className="text-buscoedu-muted" aria-hidden="true">✕</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MobileResultsModal({
  open,
  onClose,
  tituloResultados,
  mostrarResultados,
  estaCargando,
  estado,
  ofertas,
  total,
  onOpenOffer,
  onLoadMore,
  chips,
  onRemoveFilter,
  onResetFilters,
}: {
  open: boolean;
  onClose: () => void;
  tituloResultados: string;
  mostrarResultados: boolean;
  estaCargando: boolean;
  estado: EstadoBusqueda;
  ofertas: OfertaAcademica[];
  total: number;
  onOpenOffer: (oferta: OfertaAcademica) => void;
  onLoadMore: () => void;
  chips: ChipFiltro[];
  onRemoveFilter: (clave: keyof FiltrosOferta) => void;
  onResetFilters: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] bg-white lg:hidden">
      <div className="flex h-full flex-col overflow-hidden">
        {/* Botón prominente y sticky para volver al chat. */}
        <div className="sticky top-0 z-20 border-b border-buscoedu-border bg-white px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-buscoedu-blue px-3 text-sm font-semibold text-buscoedu-blue"
              aria-label="Volver al chat"
            >
              ← Volver al chat
            </button>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-buscoedu-teal">RESULTADOS</p>
              <h2 className="text-sm font-bold text-buscoedu-blue">{tituloResultados}</h2>
            </div>
          </div>
        </div>

        <ActiveFiltersBar
          chips={chips}
          onRemove={onRemoveFilter}
          onReset={onResetFilters}
          className="m-3"
          showExploreButton={false}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {estaCargando ? (
            <ResultSkeleton />
          ) : ofertas.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-buscoedu-border bg-white">
              {ofertas.map((oferta) => (
                <MobileOfferRow key={oferta.id} oferta={oferta} onOpen={() => onOpenOffer(oferta)} />
              ))}
            </div>
          ) : mostrarResultados && estado === "listo" ? (
            <div className="mt-2 rounded-2xl border border-dashed border-buscoedu-border bg-white p-4 text-sm leading-relaxed text-buscoedu-muted">No encontré coincidencias todavía. Quita un filtro o amplía la búsqueda para ver más resultados.</div>
          ) : (
            <EmptyResults />
          )}

          {ofertas.length > 0 && ofertas.length < total && !estaCargando && (
            <button
              type="button"
              onClick={onLoadMore}
              className="mt-4 w-full rounded-xl border border-buscoedu-blue bg-white px-4 py-3 text-sm font-semibold text-buscoedu-blue"
            >
              Mostrar 10 resultados más
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultSkeleton() {
  return <div className="mt-6 space-y-4" aria-live="polite"><div className="h-56 animate-pulse rounded-xl bg-slate-200" /><div className="h-56 animate-pulse rounded-xl bg-slate-200" /></div>;
}

function EmptyResults() {
  return <div className="mt-8 rounded-2xl border border-dashed border-buscoedu-border bg-white p-7"><div className="inline-flex h-11 items-center justify-center rounded-xl bg-buscoedu-teal/10 px-2.5 text-sm font-bold text-buscoedu-teal">NaIA</div><p className="mt-4 font-semibold text-buscoedu-blue">Una conversación, resultados organizados.</p><p className="mt-2 text-sm leading-relaxed text-buscoedu-muted">NaIA interpretará tu búsqueda y traerá aquí las ofertas que puedes abrir, guardar y comparar.</p></div>;
}

function MobileOfferRow({ oferta, onOpen }: { oferta: OfertaAcademica; onOpen: () => void }) {
  const universityName = oferta.universidad?.nombre ?? "Institución educativa";
  const universityColor = getUniversityColor(oferta.universidad_id, universityName);
  const universityTextColor = getUniversityTextColor(oferta.universidad_id, universityName);
  const summary = [
    nombreUniversidadCorto(universityName),
    modalidadCorta(oferta.programa?.modalidad),
    beneficioOCiudad(oferta),
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 border-b border-buscoedu-border px-3 py-3 text-left transition hover:bg-buscoedu-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-buscoedu-blue focus-visible:ring-inset"
      aria-label={`Abrir ${oferta.programa?.nombre || oferta.nombre}, ${universityName}`}
    >
      <span
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold"
        style={{ backgroundColor: universityColor, color: universityTextColor }}
        aria-hidden="true"
      >
        {universityName.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-buscoedu-blue">{oferta.programa?.nombre || oferta.nombre}</span>
        <span className="mt-1 block truncate text-xs font-medium text-buscoedu-muted">{summary.join(" | ")}</span>
      </span>
      <span className="shrink-0 text-lg text-buscoedu-teal" aria-hidden="true">›</span>
    </button>
  );
}

function nombreUniversidadCorto(nombre: string): string {
  const simplificado = nombre
    .replace(/^fundaci[oó]n\s+universitaria\s+/i, "")
    .replace(/^instituci[oó]n\s+universitaria\s+/i, "")
    .replace(/^corporaci[oó]n\s+universitaria\s+/i, "")
    .replace(/^instituci[oó]n\s+de\s+educaci[oó]n\s+superior\s+/i, "")
    .replace(/^universidad\s+/i, "")
    .trim();
  return simplificado || nombre;
}

function modalidadCorta(modalidad?: string): string | null {
  if (!modalidad) return null;
  const normalizada = modalidad.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalizada.includes("virtual")) return "VIR";
  if (normalizada.includes("presencial")) return "PRES";
  if (normalizada.includes("hibrid") || normalizada.includes("semipresencial") || normalizada.includes("mixta")) return "HIB";
  if (normalizada.includes("distancia")) return "DIS";
  return modalidad.slice(0, 8).toUpperCase();
}

function beneficioOCiudad(oferta: OfertaAcademica): string | null {
  const beneficio = oferta.beneficios?.[0];
  if (beneficio) {
    const detalle = [beneficio.tipo, beneficio.descripcion].filter(Boolean).join(" ");
    const porcentaje = detalle.match(/\d{1,3}(?:[.,]\d+)?\s*%/)?.[0]?.replace(/\s/g, "");
    if (/descuent|dto/i.test(detalle)) return porcentaje ? `${porcentaje} DTO.` : "DTO.";
    if (/beca/i.test(detalle)) return porcentaje ? `${porcentaje} BECA` : "BECA";
    return beneficio.tipo.slice(0, 16).toUpperCase();
  }
  return oferta.sede?.ciudad ?? null;
}
