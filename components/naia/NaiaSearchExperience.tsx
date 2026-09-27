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
  type ResultadoOfertas,
} from "@/src/lib/ofertas";
import {
  getUniversityColor,
  getUniversityTextColor,
} from "@/src/lib/university-colors";
import { COPY_CERO_VIGENCIA, repararCopyFiltrado } from "@/components/naia/copyNaia";
import { esSnapshotCompleto, type SnapshotNaia } from "@/components/naia/naiaSession";
import { EVENTO_FAB_NAIA } from "@/components/naia/naiaFab";

type EstadoBusqueda = "inicio" | "interpretando" | "consultando" | "listo" | "error";
type Orden = "recomendado" | "virtual" | "beneficio" | "universidad";

/**
 * BA-005: un fallo de catálogo no es “0 resultados”.
 * - resultados: la consulta principal falló; no hay listado válido que mostrar.
 * - paginacion: falló “cargar más”; el listado ya visible sigue siendo el éxito previo.
 * - naia: falló la interpretación, antes de publicar un conteo.
 */
type AvisoConsulta = {
  ambito: "resultados" | "paginacion" | "naia";
  mensaje: string;
};

const PAGE_SIZE_BUSQUEDA = 10;

const COPY_ERROR_CATALOGO =
  "No pudimos consultar el catálogo por un problema técnico. Esto no significa que haya 0 resultados.";
const COPY_ERROR_PAGINACION =
  "No pudimos cargar más opciones. Las que ya ves siguen disponibles; no se agregó una página vacía.";
const COPY_ERROR_NAIA = "Tuve un inconveniente para responder. Inténtalo de nuevo, por favor.";
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
  /**
   * BA-028: la misma experiencia, montada en la capa del FAB
   * encima de la página. No abre otro chat.
   */
  enCapa?: boolean;
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

export default function NaiaSearchExperience({
  layoutVariant = "naia",
  enCapa = false,
}: NaiaSearchExperienceProps) {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q")?.trim() ?? "";
  const vistaParam = parseVista(searchParams.get("vista"));
  const hasProcessedInitialQuery = useRef(false);
  const hasProcessedVista = useRef(false);
  const hasProcessedCatalogo = useRef(false);
  const sesionRestaurada = useRef(false);
  const { isInMyList, addToMyList, removeFromMyList } = useMyList();

  const arranqueCatalogoExplorar = layoutVariant === "explorar" && !initialQuery;

  const [input, setInput] = useState("");
  // BA-011: /explorar no arranca en el vacío de NaIA.
  const [estado, setEstado] = useState<EstadoBusqueda>(
    arranqueCatalogoExplorar ? "consultando" : initialQuery ? "interpretando" : "inicio"
  );
  const [vistaActiva, setVistaActiva] = useState<VistaExplorar | null>(vistaParam);
  const [respuesta, setRespuesta] = useState<NaiaResponse | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [ofertas, setOfertas] = useState<OfertaAcademica[]>([]);
  const [total, setTotal] = useState(0);
  const [filtrosActuales, setFiltrosActuales] = useState<FiltrosOferta>({});
  const [orden, setOrden] = useState<Orden>("recomendado");
  const [seleccionada, setSeleccionada] = useState<OfertaAcademica | null>(null);
  const [mensajes, setMensajes] = useState<MensajeChat[]>([]);
  const [avisoConsulta, setAvisoConsulta] = useState<AvisoConsulta | null>(null);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [mostrarResultadosMovil, setMostrarResultadosMovil] = useState(false);
  const reintentarRef = useRef<(() => void) | null>(null);
  const cargarMasRef = useRef<() => Promise<void>>(async () => {});
  const cargarCatalogoVigenteRef = useRef<() => Promise<void>>(async () => {});
  const buscarRef = useRef<(mensaje: string, opciones?: { reintento?: boolean }) => Promise<void>>(async () => {});
  const cargandoMasLock = useRef(false);
  const [alturaLayoutDesktop, setAlturaLayoutDesktop] = useState<number | null>(null);
  const [hidratado, setHidratado] = useState(false);
  const historialRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /**
   * BA-014: restaura chat + resultados + filtros juntos.
   * Si el corte está a medias, o la URL trae una búsqueda/vista nueva, no se aplica.
   */
  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(NAIA_CHAT_STATE_KEY);
      if (!guardado) return;
      const parsed = JSON.parse(guardado) as unknown;
      if (!esSnapshotCompleto(parsed)) {
        sessionStorage.removeItem(NAIA_CHAT_STATE_KEY);
        return;
      }
      if (initialQuery || vistaParam) return;

      sesionRestaurada.current = true;
      hasProcessedCatalogo.current = true;
      setConversationId(parsed.conversationId);
      setMensajes(
        parsed.mensajes.map((mensaje) =>
          mensaje.autor === "naia"
            ? { ...mensaje, contenido: repararCopyFiltrado(mensaje.contenido) }
            : mensaje
        )
      );
      setFiltrosActuales(parsed.filtros);
      setOfertas(parsed.ofertas);
      setTotal(parsed.total);
      setOrden(parsed.orden);
      setRespuesta(parsed.respuesta);
      setEstado(parsed.estado);
      setAvisoConsulta(parsed.avisoConsulta);
    } catch {
      try {
        sessionStorage.removeItem(NAIA_CHAT_STATE_KEY);
      } catch {
        // Un storage ilegible no debe romper la pantalla.
      }
    } finally {
      setHidratado(true);
    }
    // Solo al montar: la URL de esta entrada decide si la sesión previa aplica.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    historialRef.current?.scrollTo({ top: historialRef.current.scrollHeight, behavior: "smooth" });
  }, [mensajes]);

  /**
   * BA-014: solo se escribe un snapshot coherente (listo o error ya cerrado).
   * Mientras NaIA interpreta o el catálogo consulta, se conserva el último corte completo.
   */
  useEffect(() => {
    if (!hidratado) return;
    if (estado === "inicio" || estado === "interpretando" || estado === "consultando") return;

    const snapshot: SnapshotNaia = {
      version: 2,
      conversationId,
      mensajes: mensajes.map((mensaje) =>
        mensaje.autor === "naia" ? { ...mensaje, contenido: repararCopyFiltrado(mensaje.contenido) } : mensaje
      ),
      filtros: filtrosActuales,
      ofertas,
      total,
      orden,
      respuesta,
      estado,
      avisoConsulta,
    };

    try {
      if (!esSnapshotCompleto(snapshot)) {
        sessionStorage.removeItem(NAIA_CHAT_STATE_KEY);
        return;
      }
      sessionStorage.setItem(NAIA_CHAT_STATE_KEY, JSON.stringify(snapshot));
    } catch {
      try {
        sessionStorage.removeItem(NAIA_CHAT_STATE_KEY);
      } catch {
        // Si no cabe la sesión completa, preferimos no dejar un corte a medias.
      }
    }
  }, [
    hidratado,
    estado,
    conversationId,
    mensajes,
    filtrosActuales,
    ofertas,
    total,
    orden,
    respuesta,
    avisoConsulta,
  ]);

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
   * Móvil: el panel de resultados tapa el header.
   * BA-027: en NaIA, con resultados o ficha, el header también sale.
   * Quedan la ventana de chat y el botón Explorar oferta.
   * BA-001: al cerrar la ficha se vuelve a bloquear el scroll del panel móvil.
   */
  useEffect(() => {
    /*
      Solo clases en body: no se escribe style en header ni en body,
      porque ese DOM lo hidrata React.
    */
    const aplicarCromo = () => {
      const movil = window.innerWidth < 1024;
      /* estado !== "inicio": ya hay búsqueda, resultados o ficha en curso. */
      const soloChat =
        movil &&
        !enCapa &&
        layoutVariant === "naia" &&
        (estado !== "inicio" || Boolean(seleccionada) || mostrarResultadosMovil);
      const resultadosEncima = movil && mostrarResultadosMovil;

      document.body.classList.toggle("naia-movil-solo-chat", soloChat);
      document.body.classList.toggle("naia-movil-resultados", resultadosEncima);
    };

    aplicarCromo();
    window.addEventListener("resize", aplicarCromo);
    return () => {
      window.removeEventListener("resize", aplicarCromo);
      document.body.classList.remove("naia-movil-solo-chat", "naia-movil-resultados");
    };
  }, [enCapa, layoutVariant, estado, seleccionada, mostrarResultadosMovil]);

  /**
   * BA-028: en Explorar el FAB no monta otro chat.
   * Cierra la capa de resultados y deja la ventana que ya está en la página.
   */
  useEffect(() => {
    if (enCapa || layoutVariant !== "explorar") return;
    const alPulsarFab = () => {
      setMostrarResultadosMovil(false);
      inputRef.current?.focus();
    };
    window.addEventListener(EVENTO_FAB_NAIA, alPulsarFab);
    return () => window.removeEventListener(EVENTO_FAB_NAIA, alPulsarFab);
  }, [enCapa, layoutVariant]);

  /**
   * Primera página del catálogo.
   * ok:false limpia el listado de esta consulta y deja Reintentar; no publica conteo.
   */
  const aplicarPrimeraPagina = async (
    filtros: FiltrosOferta,
    reintento: () => void
  ): Promise<Extract<ResultadoOfertas, { ok: true }> | null> => {
    const resultado = await obtenerOfertas(filtros, 0, PAGE_SIZE_BUSQUEDA);
    if (!resultado.ok) {
      setOfertas([]);
      setTotal(0);
      setEstado("error");
      setAvisoConsulta({ ambito: "resultados", mensaje: COPY_ERROR_CATALOGO });
      reintentarRef.current = reintento;
      return null;
    }

    setAvisoConsulta(null);
    setFiltrosActuales(filtros);
    setOfertas(resultado.ofertas);
    setTotal(Math.max(resultado.total, resultado.ofertas.length));
    return resultado;
  };

  /** Solo para respuestas ok:true. Un fallo técnico no debe pasar por aquí. */
  const construirMensajeConteo = (cantidad: number, filtros: FiltrosOferta = {}) => {
    const hayFiltros = Object.values(filtros).some((valor) => typeof valor === "string" && valor.trim());
    // BA-011 / BA-004: sin filtros, 0 es vigencia, no “esos criterios”.
    if (!hayFiltros && cantidad <= 0) return COPY_CERO_VIGENCIA;
    if (cantidad <= 0) {
      return "No encontré resultados con esos criterios (0 resultados). Puedes ampliar la búsqueda o limpiar filtros para ver más opciones vigentes.";
    }
    return `Encontré ${cantidad} ${cantidad === 1 ? "opción" : "opciones"} que coinciden con tu búsqueda.`;
  };

  /** Reintenta solo el catálogo, sin repetir el mensaje del estudiante ni a NaIA. */
  const reconsultarCatalogo = async (filtros: FiltrosOferta) => {
    setEstado("consultando");
    setAvisoConsulta(null);
    try {
      const resultado = await aplicarPrimeraPagina(filtros, () => {
        void reconsultarCatalogo(filtros);
      });
      if (!resultado) return;
      const conteo = Math.max(resultado.total, resultado.ofertas.length);
      setMensajes((actuales) => [
        ...actuales,
        {
          id: `naia-reintento-${Date.now()}`,
          autor: "naia",
          contenido: repararCopyFiltrado(construirMensajeConteo(conteo, filtros)),
        },
      ]);
      setEstado("listo");
    } catch {
      setOfertas([]);
      setTotal(0);
      setEstado("error");
      setAvisoConsulta({ ambito: "resultados", mensaje: COPY_ERROR_CATALOGO });
      reintentarRef.current = () => {
        void reconsultarCatalogo(filtros);
      };
    }
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

  const buscar = async (mensaje: string, opciones?: { reintento?: boolean }) => {
    const texto = mensaje.trim();
    if (!texto) return;

    if (!opciones?.reintento) {
      setInput("");
      setMensajes((actuales) => [...actuales, { id: `estudiante-${Date.now()}`, autor: "estudiante", contenido: texto }]);
    }
    setEstado("interpretando");
    setAvisoConsulta(null);

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
      const resultado = await aplicarPrimeraPagina(filtros, () => {
        void reconsultarCatalogo(filtros);
      });

      // Bloque error de catálogo: no concatenar el copy de “0 resultados”.
      if (!resultado) {
        setMensajes((actuales) => [
          ...actuales,
          {
            id: `naia-error-catalogo-${Date.now()}`,
            autor: "naia",
            contenido: repararCopyFiltrado(`${siguienteRespuesta.mensaje}\n\n${COPY_ERROR_CATALOGO}`),
          },
        ]);
        return;
      }

      const conteo = Math.max(resultado.total, resultado.ofertas.length);
      const bloques = [
        repararCopyFiltrado(siguienteRespuesta.mensaje),
        construirMensajeConteo(conteo, filtros),
        conteo === 0 ? null : siguienteRespuesta.pregunta_seguimiento
          ? repararCopyFiltrado(siguienteRespuesta.pregunta_seguimiento)
          : null,
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
      // Bloque error de NaIA: tampoco se presenta como búsqueda sin resultados.
      setEstado("error");
      setAvisoConsulta({ ambito: "naia", mensaje: COPY_ERROR_NAIA });
      reintentarRef.current = () => {
        void buscar(texto, { reintento: true });
      };
      setMensajes((actuales) => [
        ...actuales,
        {
          id: `naia-error-${Date.now()}`,
          autor: "naia",
          contenido: COPY_ERROR_NAIA,
        },
      ]);
    }
  };
  buscarRef.current = buscar;

  /**
   * Página siguiente. Si ok:false, no altera ofertas ni total y no marca la búsqueda como exitosa.
   * La página es índice base 0 (no el conteo acumulado).
   */
  const cargarMasResultados = async () => {
    if (estaCargando || cargandoMasLock.current) return;
    if (avisoConsulta?.ambito !== "paginacion" && ofertas.length >= total) return;

    cargandoMasLock.current = true;
    setCargandoMas(true);
    try {
      const pagina = Math.floor(ofertas.length / PAGE_SIZE_BUSQUEDA);
      const resultado = await obtenerOfertas(filtrosActuales, pagina, PAGE_SIZE_BUSQUEDA);
      if (!resultado.ok) {
        setAvisoConsulta({ ambito: "paginacion", mensaje: COPY_ERROR_PAGINACION });
        reintentarRef.current = () => {
          void cargarMasRef.current();
        };
        return;
      }

      setAvisoConsulta((previo) => (previo?.ambito === "paginacion" ? null : previo));
      const yaCargadas = new Set(ofertas.map((oferta) => oferta.id));
      const hayNuevas = resultado.ofertas.some((oferta) => !yaCargadas.has(oferta.id));
      // Página vacía o repetida: no hay más filas reales. No es un error ni un éxito con ítems nuevos.
      if (resultado.ofertas.length === 0 || !hayNuevas) {
        setTotal(ofertas.length);
        return;
      }
      setOfertas((actuales) => {
        const porId = new Map(actuales.map((oferta) => [oferta.id, oferta]));
        resultado.ofertas.forEach((oferta) => porId.set(oferta.id, oferta));
        return Array.from(porId.values());
      });
      setTotal((totalActual) => Math.max(totalActual, resultado.total, resultado.ofertas.length));
    } catch {
      setAvisoConsulta({ ambito: "paginacion", mensaje: COPY_ERROR_PAGINACION });
      reintentarRef.current = () => {
        void cargarMasRef.current();
      };
    } finally {
      cargandoMasLock.current = false;
      setCargandoMas(false);
    }
  };
  cargarMasRef.current = cargarMasResultados;

  const quitarFiltro = async (clave: keyof FiltrosOferta) => {
    const siguiente = { ...filtrosActuales };
    delete siguiente[clave];

    setEstado("consultando");
    setAvisoConsulta(null);
    try {
      const resultado = await aplicarPrimeraPagina(siguiente, () => {
        void reconsultarCatalogo(siguiente);
      });
      if (!resultado) {
        setMensajes((actuales) => [
          ...actuales,
          {
            id: `naia-error-filtro-${Date.now()}`,
            autor: "naia",
            contenido: `No pude actualizar el filtro “${etiquetaFiltro(clave)}”. ${COPY_ERROR_CATALOGO}`,
          },
        ]);
        return;
      }
      const conteo = Math.max(resultado.total, resultado.ofertas.length);
      setMensajes((actuales) => [
        ...actuales,
        {
          id: `naia-chip-${Date.now()}`,
          autor: "naia",
          contenido: repararCopyFiltrado(
            `Quité el filtro “${etiquetaFiltro(clave)}”. ${construirMensajeConteo(conteo, siguiente)}`
          ),
        },
      ]);
      setEstado("listo");
    } catch {
      setOfertas([]);
      setTotal(0);
      setEstado("error");
      setAvisoConsulta({ ambito: "resultados", mensaje: COPY_ERROR_CATALOGO });
      reintentarRef.current = () => {
        void quitarFiltro(clave);
      };
    }
  };

  const reiniciarBusqueda = async () => {
    setEstado("consultando");
    setConversationId(undefined);
    setRespuesta(null);
    setMensajes([]);
    setAvisoConsulta(null);

    try {
      const resultado = await aplicarPrimeraPagina({}, () => {
        void reconsultarCatalogo({});
      });
      if (!resultado) {
        setMensajes([
          {
            id: `naia-error-reset-${Date.now()}`,
            autor: "naia",
            contenido: COPY_ERROR_CATALOGO,
          },
        ]);
        return;
      }
      const conteo = Math.max(resultado.total, resultado.ofertas.length);
      setMensajes([
        {
          id: `naia-reset-${Date.now()}`,
          autor: "naia",
          contenido: repararCopyFiltrado(
            conteo === 0
              ? COPY_CERO_VIGENCIA
              : `Reinicié la búsqueda y limpié los filtros anteriores. ${construirMensajeConteo(conteo, {})}`
          ),
        },
      ]);
      setEstado("listo");
    } catch {
      setOfertas([]);
      setTotal(0);
      setEstado("error");
      setAvisoConsulta({ ambito: "resultados", mensaje: COPY_ERROR_CATALOGO });
      reintentarRef.current = () => {
        void reiniciarBusqueda();
      };
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

    const cargarVista = async () => {
      setEstado("consultando");
      setAvisoConsulta(null);
      try {
        const resultado = await aplicarPrimeraPagina({}, () => {
          void cargarVista();
        });
        if (!resultado) {
          const etiqueta =
            vistaParam === "programas" ? "la vista Programas" : "la vista Universidades";
          setMensajes([
            {
              id: `naia-error-vista-${Date.now()}`,
              autor: "naia",
              contenido: `No pude abrir ${etiqueta}. ${COPY_ERROR_CATALOGO}`,
            },
          ]);
          if (window.innerWidth < 1024) setMostrarResultadosMovil(true);
          return;
        }
        const conteo = Math.max(resultado.total, resultado.ofertas.length);
        const etiqueta =
          vistaParam === "programas"
            ? "Vista Programas: listado de ofertas agrupado por programa."
            : "Vista Universidades: listado ordenado por universidad.";
        setMensajes([
          {
            id: `naia-vista-${Date.now()}`,
            autor: "naia",
            contenido: repararCopyFiltrado(
              conteo === 0
                ? COPY_CERO_VIGENCIA
                : `${etiqueta} ${construirMensajeConteo(conteo, {})} Puedes seguir filtrando con NaIA cuando quieras.`
            ),
          },
        ]);
        setEstado("listo");
        if (window.innerWidth < 1024) setMostrarResultadosMovil(true);
      } catch {
        setOfertas([]);
        setTotal(0);
        setEstado("error");
        setAvisoConsulta({ ambito: "resultados", mensaje: COPY_ERROR_CATALOGO });
        reintentarRef.current = () => {
          void cargarVista();
        };
        if (window.innerWidth < 1024) setMostrarResultadosMovil(true);
      }
    };

    void cargarVista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vistaParam, initialQuery]);

  /**
   * BA-011: /explorar sin q ni vista carga vigentes
   * (activo + publicado + validado + vigencia abierta).
   * Si ya hay una sesión completa, no se pisa.
   */
  const cargarCatalogoVigente = async () => {
    setEstado("consultando");
    setAvisoConsulta(null);
    try {
      const resultado = await aplicarPrimeraPagina({}, () => {
        void cargarCatalogoVigenteRef.current();
      });
      if (!resultado) {
        setMensajes([
          {
            id: `naia-error-vigentes-${Date.now()}`,
            autor: "naia",
            contenido: COPY_ERROR_CATALOGO,
          },
        ]);
        if (window.innerWidth < 1024) setMostrarResultadosMovil(true);
        return;
      }
      const conteo = Math.max(resultado.total, resultado.ofertas.length);
      setMensajes([
        {
          id: `naia-vigentes-${Date.now()}`,
          autor: "naia",
          contenido: repararCopyFiltrado(
            conteo === 0
              ? COPY_CERO_VIGENCIA
              : `Estas son las ofertas vigentes del catálogo. ${construirMensajeConteo(conteo, {})} Puedes seguir filtrando con NaIA cuando quieras.`
          ),
        },
      ]);
      setEstado("listo");
      if (window.innerWidth < 1024) setMostrarResultadosMovil(true);
    } catch {
      setOfertas([]);
      setTotal(0);
      setEstado("error");
      setAvisoConsulta({ ambito: "resultados", mensaje: COPY_ERROR_CATALOGO });
      reintentarRef.current = () => {
        void cargarCatalogoVigenteRef.current();
      };
      setMensajes([
        {
          id: `naia-error-vigentes-${Date.now()}`,
          autor: "naia",
          contenido: COPY_ERROR_CATALOGO,
        },
      ]);
      if (window.innerWidth < 1024) setMostrarResultadosMovil(true);
    }
  };
  cargarCatalogoVigenteRef.current = cargarCatalogoVigente;

  useEffect(() => {
    if (layoutVariant !== "explorar" || initialQuery || vistaParam) return;
    if (sesionRestaurada.current || hasProcessedCatalogo.current) return;
    hasProcessedCatalogo.current = true;
    void cargarCatalogoVigenteRef.current();
  }, [layoutVariant, initialQuery, vistaParam]);

  useEffect(() => {
    if (!hidratado || !avisoConsulta) return;
    if (avisoConsulta.ambito === "paginacion") {
      reintentarRef.current = () => {
        void cargarMasRef.current();
      };
      return;
    }
    if (avisoConsulta.ambito === "naia") {
      const ultimo = [...mensajes].reverse().find((mensaje) => mensaje.autor === "estudiante");
      const texto = ultimo?.contenido;
      reintentarRef.current = () => {
        if (texto) void buscarRef.current(texto, { reintento: true });
      };
      return;
    }
    const filtros = { ...filtrosActuales };
    reintentarRef.current = () => {
      void reconsultarCatalogo(filtros);
    };
    // reconsultarCatalogo se lee en el click, con los filtros de este corte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidratado, avisoConsulta, mensajes, filtrosActuales]);

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
  // BA-011 / BA-004: catálogo sin filtros y 0 filas reales. No es el vacío de NaIA ni un error.
  const ceroPorVigencia =
    estado === "listo" && !avisoConsulta && ofertas.length === 0 && chipsFiltros.length === 0;

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

  const falloReemplazaListado =
    avisoConsulta?.ambito === "resultados" ||
    (avisoConsulta?.ambito === "naia" && ofertasVista.length === 0);

  // Bloque título: un fallo no se rotula como “N opciones” ni como cero resultados.
  let tituloResultados = layoutVariant === "explorar" ? "Ofertas vigentes" : "Tus opciones aparecerán aquí";
  if (!mostrarResultados) {
    if (vistaActiva === "programas") tituloResultados = "Vista Programas";
    else if (vistaActiva === "universidades") tituloResultados = "Vista Universidades";
  } else if (estaCargando) {
    tituloResultados = "Preparando opciones…";
  } else if (falloReemplazaListado) {
    tituloResultados = "No pudimos consultar las opciones";
  } else if (avisoConsulta?.ambito === "naia") {
    tituloResultados = "No pudimos completar la búsqueda";
  } else if (ceroPorVigencia) {
    tituloResultados = "Sin ofertas vigentes";
  } else if (estado === "listo" && ofertas.length === 0) {
    tituloResultados = "Sin coincidencias en el catálogo";
  } else if (vistaActiva === "programas") {
    tituloResultados = `${ofertasVista.length} programas en vista`;
  } else if (vistaActiva === "universidades") {
    tituloResultados = `${total} opciones por universidad`;
  } else {
    tituloResultados = `${total} opciones encontradas`;
  }

  const reintentarConsulta = () => {
    reintentarRef.current?.();
  };

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

  /*
    BA-027: en móvil, con resultados o ficha, la columna se reparte entre
    la ventana de chat y el botón Explorar oferta.
    BA-028: en la capa del FAB el alto lo da el contenedor, no el header.
  */
  const ajustarColumnaMovil = enCapa || mostrarResultados || Boolean(seleccionada);
  const naiaPantallaCompleta =
    !enCapa && layoutVariant === "naia" && (mostrarResultados || Boolean(seleccionada));

  return (
    <div
      className={
        enCapa
          ? "flex h-full min-h-0 flex-col overflow-hidden bg-[#f7f9fc]"
          : `bg-[#f7f9fc] lg:mb-6 lg:overflow-hidden lg:pb-2${
              naiaPantallaCompleta ? " max-lg:h-dvh max-lg:overflow-hidden" : ""
            }`
      }
      style={!enCapa && alturaLayoutDesktop ? { height: `${alturaLayoutDesktop}px` } : undefined}
    >
      {/*
        En escritorio este envoltorio no cambia el grid.
        En móvil acota el alto para que el botón quede debajo de la ventana,
        dentro de la pantalla, y no debajo del pie.
      */}
      <div
        className={
          enCapa
            ? "flex h-full min-h-0 flex-1 flex-col overflow-hidden"
            : ajustarColumnaMovil
              ? `mx-auto flex w-full max-w-[1600px] flex-col overflow-hidden lg:block lg:h-full ${
                  naiaPantallaCompleta ? "h-full" : "h-[calc(100dvh-73px)] lg:h-full"
                }`
              : "contents"
        }
      >
      <div
        className={`mx-auto w-full max-w-[1600px] lg:grid lg:h-full lg:min-h-0 ${gridClass} ${
          ajustarColumnaMovil ? "flex min-h-0 flex-1 flex-col" : "grid"
        }`}
      >
        {/*
          Columna del hilo en flex: el chat ocupa el alto restante y la barra
          inferior queda en el flujo. Así la franja de continuación no puede
          crecer y tapar los mensajes (BA-026).
          BA-025: superficie gris y marco más pesado para que esta ventana
          se lea sobre el fondo del sitio, igual en /naia y /explorar.
        */}
        <main
          className={`naia-chat-window relative z-10 flex min-h-0 min-w-0 flex-col overflow-hidden border-b-2 border-buscoedu-chat-edge px-5 pt-6 sm:px-8 lg:h-full lg:border-b-0 lg:border-r-2 lg:px-10 lg:pt-8 ${
            ajustarColumnaMovil ? "max-lg:flex-1" : "h-[calc(100dvh-73px)]"
          }`}
        >
          {/* Filete de marca: marca el borde superior de la ventana en web y móvil. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-1 bg-buscoedu-teal" aria-hidden="true" />
          {mostrarResultados ? (
            <section className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col">
              <div className="mb-4 shrink-0">
                {/* Rótulo teal sobre pastilla blanca: el teal de marca no contrasta sobre el gris del hilo. */}
                <p className="inline-flex rounded-full bg-white px-3 py-1 text-sm font-semibold uppercase tracking-[0.18em] text-buscoedu-teal shadow-[0_2px_8px_rgba(18,58,111,0.08)]">Conversación con NaIA</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-buscoedu-blue">Tu búsqueda educativa</h1>
              </div>

              <div ref={historialRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-3 pr-1" aria-live="polite">
                {/* BA-025: burbuja blanca de NaIA sobre el gris; la del estudiante sigue en azul. */}
                {mensajes.map((mensaje) => (
                  <div
                    key={mensaje.id}
                    className={
                      mensaje.autor === "estudiante"
                        ? "ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-buscoedu-blue px-4 py-3 text-white shadow-[0_6px_16px_rgba(18,58,111,0.18)]"
                        : "naia-chat-bubble max-w-[92%] rounded-2xl rounded-bl-md px-4 py-3 text-buscoedu-text"
                    }
                  >
                    {mensaje.autor === "naia" && <p className="mb-1 text-xs font-semibold text-buscoedu-teal">NaIA</p>}
                    {mensaje.autor === "naia" ? (
                      <TypedText
                        texto={repararCopyFiltrado(mensaje.contenido)}
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
            /* El saludo cede el alto a la barra; si no cabe, scrollea él y no la página. */
            <section className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col justify-center overflow-y-auto pb-4">
              {/* Sello sobre blanco para que el teal no se pierda en la superficie gris. */}
              <span className="naia-chat-bubble inline-flex h-14 items-center justify-center rounded-2xl px-3 text-lg font-bold text-buscoedu-teal">NaIA</span>
              {/* Misma pastilla que en el hilo activo: teal legible sobre el gris. */}
              <p className="mt-7 inline-flex rounded-full bg-white px-3 py-1 text-sm font-semibold uppercase tracking-[0.18em] text-buscoedu-teal shadow-[0_2px_8px_rgba(18,58,111,0.08)]">Tu búsqueda educativa, acompañada</p>
              <h1 className="mt-3 max-w-2xl text-4xl font-bold tracking-tight text-buscoedu-blue sm:text-5xl">Hola, soy NaIA.</h1>
              {/* Texto principal sobre la superficie gris: color de cuerpo, no el muted pensado para blanco. */}
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-buscoedu-text">Cuéntame qué quieres estudiar, dónde te gustaría hacerlo o qué necesitas para empezar. Te ayudaré a explorar opciones y compararlas con calma.</p>
              <div className="mt-8 flex flex-wrap gap-2">
                {PROMPTS_INICIALES.map((prompt) => (
                  <button key={prompt} type="button" onClick={() => void buscar(prompt)} className="naia-chat-bubble rounded-full px-4 py-2.5 text-sm font-medium text-buscoedu-blue transition hover:border-buscoedu-teal hover:bg-buscoedu-teal/5">
                    {prompt}
                  </button>
                ))}
              </div>
              <p className="mt-8 max-w-xl text-sm leading-relaxed text-buscoedu-text">Puedes explorar sin registrarte. Solo compartiremos tus datos con una institución si lo autorizas expresamente.</p>
            </section>
          )}

          {/*
            Muelle blanco sobre la superficie gris (BA-025). Va en el flujo
            (shrink-0), no absoluto: no tapa el hilo.
            1) input
            2) "Puedes continuar con" con alto fijo y scroll interno (BA-026, web y móvil)
          */}
          <div className="z-20 -mx-5 shrink-0 border-t-2 border-buscoedu-chat-edge bg-white px-5 py-3 sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
            <form onSubmit={enviar}>
              <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border border-buscoedu-chat-edge bg-white p-2 shadow-[0_10px_30px_rgba(17,45,84,0.12)]">
                <textarea
                  ref={inputRef}
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

            {/* Bloque error en móvil: Reintentar vive en el chat, no solo en el panel de escritorio. */}
            {avisoConsulta && !estaCargando && (
              <div className="mx-auto mt-3 max-w-3xl lg:hidden">
                <AlertaErrorConsulta
                  titulo={
                    avisoConsulta.ambito === "paginacion"
                      ? "No pudimos cargar más resultados"
                      : avisoConsulta.ambito === "naia"
                        ? "No pudimos completar la búsqueda"
                        : "No pudimos consultar las opciones"
                  }
                  mensaje={avisoConsulta.mensaje}
                  onRetry={reintentarConsulta}
                  compact
                />
              </div>
            )}

            {/*
              BA-027: el llamado Explorar oferta vive debajo de la ventana,
              no dentro del muelle. Aquí sigue "Puedes continuar con" (BA-026).
            */}
            {sugerenciasParaMostrar.length > 0 && !estaCargando && (
              /*
                BA-026: alto fijo en web y móvil. Si las frases no caben,
                el scroll es interno y el hilo no pierde alto.
              */
              <div className="mx-auto mt-3 max-w-3xl border-t border-buscoedu-border/80 pt-3">
                <div
                  className="h-28 overflow-y-auto overscroll-contain rounded-2xl border border-buscoedu-border bg-slate-100 p-3 sm:h-32 sm:p-4"
                  aria-label="Puedes continuar con"
                >
                  {/* El rótulo queda visible mientras las frases scrollean dentro del alto fijo. */}
                  <p className="sticky top-0 z-10 -mx-3 mb-2 bg-slate-100 px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-buscoedu-muted sm:-mx-4 sm:px-4">Puedes continuar con</p>
                  <div className="flex flex-wrap gap-2 pb-1">
                    {sugerenciasParaMostrar.map((opcion) => (
                      <button
                        key={opcion}
                        type="button"
                        onClick={() => ejecutarSugerencia(opcion)}
                        disabled={estaCargando}
                        className="max-w-full rounded-full border border-buscoedu-teal/40 bg-white px-3 py-2 text-left text-sm font-medium leading-snug text-buscoedu-blue transition hover:bg-buscoedu-teal/5 disabled:opacity-50"
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
              <p className="mt-2 text-sm leading-relaxed text-buscoedu-muted">
                {falloReemplazaListado
                  ? "Puedes reintentar la consulta. Esto no significa que haya 0 resultados."
                  : ceroPorVigencia
                    ? "Hoy no hay opciones con vigencia abierta."
                    : ofertasVista.length > 0
                      ? "Abre una ficha para ver requisitos, beneficios y cómo aplicar. Usa Guardar en Mi lista, Aplicar o Autorizar contacto según el paso."
                      : "Cuando hables con NaIA, podrás comparar alternativas vigentes sin salir de la conversación."}
              </p>
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

            {/* Bloque carga */}
            {estaCargando ? (
              <ResultSkeleton />
            ) : falloReemplazaListado && avisoConsulta ? (
              /* Bloque error: no usar el vacío de “0 resultados”. */
              <AlertaErrorConsulta
                titulo="No pudimos consultar las opciones"
                mensaje={avisoConsulta.mensaje}
                onRetry={reintentarConsulta}
              />
            ) : ofertasVista.length > 0 ? (
              /* Bloque éxito: el listado visible proviene de ok:true. */
              <div className="mt-6">
                {avisoConsulta?.ambito === "naia" && (
                  <AlertaErrorConsulta
                    titulo="No pudimos completar la búsqueda"
                    mensaje={avisoConsulta.mensaje}
                    onRetry={reintentarConsulta}
                    compact
                  />
                )}
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
                {/* Bloque paginación: un error no se disfraza de página cargada. */}
                {avisoConsulta?.ambito === "paginacion" ? (
                  <AlertaErrorConsulta
                    titulo="No pudimos cargar más resultados"
                    mensaje={avisoConsulta.mensaje}
                    onRetry={reintentarConsulta}
                    disabled={cargandoMas}
                    compact
                    className="mt-5"
                  />
                ) : ofertas.length < total ? (
                  <button
                    type="button"
                    onClick={() => void cargarMasResultados()}
                    disabled={cargandoMas}
                    aria-busy={cargandoMas}
                    className="mt-5 w-full min-h-[44px] rounded-xl border border-buscoedu-blue bg-white px-4 py-3 text-sm font-semibold text-buscoedu-blue transition hover:bg-buscoedu-blue hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {cargandoMas ? "Cargando más opciones…" : "Mostrar 10 resultados más"}
                  </button>
                ) : null}
              </div>
            ) : ceroPorVigencia ? (
              /* BA-004: 0 por vigencia. No reutilizar el vacío de NaIA. */
              <div className="mt-6 rounded-2xl border border-dashed border-buscoedu-border bg-white p-6 text-sm leading-relaxed text-buscoedu-muted">{COPY_CERO_VIGENCIA}</div>
            ) : mostrarResultados && estado === "listo" && !avisoConsulta ? (
              /* Bloque vacío real: había filtros y el catálogo respondió con cero ofertas. */
              <div className="mt-6 rounded-2xl border border-dashed border-buscoedu-border bg-white p-6 text-sm leading-relaxed text-buscoedu-muted">No encontramos una coincidencia exacta todavía. Cuéntale a NaIA otra alternativa de área, ciudad, modalidad o nivel para ampliar la búsqueda.</div>
            ) : layoutVariant === "explorar" ? (
              <div className="mt-6 rounded-2xl border border-dashed border-buscoedu-border bg-white p-6 text-sm leading-relaxed text-buscoedu-muted" role="status">Cargando ofertas vigentes…</div>
            ) : (
              <EmptyResults />
            )}
          </div>
        </aside>
      </div>

        {/*
          BA-027: único bloque bajo la ventana en móvil.
          Abre la capa de resultados que ya existe. En escritorio el listado
          sigue al lado y este botón no se muestra.
        */}
        {mostrarResultados && (
          <div className="shrink-0 border-t border-buscoedu-border bg-white px-4 py-3 lg:hidden">
            <button
              type="button"
              onClick={() => setMostrarResultadosMovil(true)}
              disabled={estaCargando}
              className="w-full min-h-11 rounded-xl bg-buscoedu-blue px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Explorar oferta
            </button>
          </div>
        )}
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
        cantidadCargada={ofertas.length}
        avisoConsulta={avisoConsulta}
        falloReemplazaListado={falloReemplazaListado}
        cargandoMas={cargandoMas}
        onRetry={reintentarConsulta}
        onOpenOffer={(oferta) => setSeleccionada(oferta)}
        onLoadMore={() => void cargarMasResultados()}
        chips={chipsFiltros}
        onRemoveFilter={(clave) => void quitarFiltro(clave)}
        onResetFilters={() => void reiniciarBusqueda()}
        vacioPorVigencia={ceroPorVigencia}
        esExplorar={layoutVariant === "explorar"}
      />

      {/*
        Franja entre la experiencia y el pie.
        BA-027: en NaIA móvil no entra en la pantalla (solo chat + Explorar oferta).
      */}
      <section
        className={`border-t border-buscoedu-border bg-slate-100 px-4 py-4 text-sm text-buscoedu-muted sm:px-6 lg:px-8 ${
          layoutVariant === "naia" ? "hidden lg:block" : ""
        }`}
      >
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
    <div className="naia-chat-bubble flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-buscoedu-text">
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
  cantidadCargada,
  avisoConsulta,
  falloReemplazaListado,
  cargandoMas,
  onRetry,
  onOpenOffer,
  onLoadMore,
  chips,
  onRemoveFilter,
  onResetFilters,
  vacioPorVigencia,
  esExplorar,
}: {
  open: boolean;
  onClose: () => void;
  tituloResultados: string;
  mostrarResultados: boolean;
  estaCargando: boolean;
  estado: EstadoBusqueda;
  ofertas: OfertaAcademica[];
  total: number;
  cantidadCargada: number;
  avisoConsulta: AvisoConsulta | null;
  falloReemplazaListado: boolean;
  cargandoMas: boolean;
  onRetry: () => void;
  onOpenOffer: (oferta: OfertaAcademica) => void;
  onLoadMore: () => void;
  chips: ChipFiltro[];
  onRemoveFilter: (clave: keyof FiltrosOferta) => void;
  onResetFilters: () => void;
  vacioPorVigencia: boolean;
  esExplorar: boolean;
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
          {/* Bloque carga */}
          {estaCargando ? (
            <ResultSkeleton />
          ) : falloReemplazaListado && avisoConsulta ? (
            /* Bloque error */
            <AlertaErrorConsulta
              titulo="No pudimos consultar las opciones"
              mensaje={avisoConsulta.mensaje}
              onRetry={onRetry}
            />
          ) : ofertas.length > 0 ? (
            /* Bloque éxito */
            <div>
              {avisoConsulta?.ambito === "naia" && (
                <AlertaErrorConsulta
                  titulo="No pudimos completar la búsqueda"
                  mensaje={avisoConsulta.mensaje}
                  onRetry={onRetry}
                  compact
                />
              )}
              <div className="overflow-hidden rounded-xl border border-buscoedu-border bg-white">
                {ofertas.map((oferta) => (
                  <MobileOfferRow key={oferta.id} oferta={oferta} onOpen={() => onOpenOffer(oferta)} />
                ))}
              </div>
            </div>
          ) : vacioPorVigencia ? (
            /* BA-004: 0 por vigencia, también en el panel móvil. */
            <div className="mt-2 rounded-2xl border border-dashed border-buscoedu-border bg-white p-4 text-sm leading-relaxed text-buscoedu-muted">{COPY_CERO_VIGENCIA}</div>
          ) : mostrarResultados && estado === "listo" && !avisoConsulta ? (
            /* Bloque vacío real con filtros */
            <div className="mt-2 rounded-2xl border border-dashed border-buscoedu-border bg-white p-4 text-sm leading-relaxed text-buscoedu-muted">No encontré coincidencias todavía. Quita un filtro o amplía la búsqueda para ver más resultados.</div>
          ) : esExplorar ? (
            <div className="mt-2 rounded-2xl border border-dashed border-buscoedu-border bg-white p-4 text-sm leading-relaxed text-buscoedu-muted" role="status">Cargando ofertas vigentes…</div>
          ) : (
            <EmptyResults />
          )}

          {/* Bloque paginación: el fallo conserva lo ya cargado y pide reintento. */}
          {ofertas.length > 0 && !estaCargando && avisoConsulta?.ambito === "paginacion" && (
            <AlertaErrorConsulta
              titulo="No pudimos cargar más resultados"
              mensaje={avisoConsulta.mensaje}
              onRetry={onRetry}
              disabled={cargandoMas}
              compact
              className="mt-4"
            />
          )}

          {ofertas.length > 0 && cantidadCargada < total && !estaCargando && avisoConsulta?.ambito !== "paginacion" && (
            <button
              type="button"
              onClick={onLoadMore}
              disabled={cargandoMas}
              aria-busy={cargandoMas}
              className="mt-4 w-full min-h-[44px] rounded-xl border border-buscoedu-blue bg-white px-4 py-3 text-sm font-semibold text-buscoedu-blue disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cargandoMas ? "Cargando más opciones…" : "Mostrar 10 resultados más"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AlertaErrorConsulta({
  titulo,
  mensaje,
  onRetry,
  compact = false,
  disabled = false,
  className = "",
}: {
  titulo: string;
  mensaje: string;
  onRetry: () => void;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={
        compact
          ? `mb-4 rounded-xl border border-red-200 bg-red-50 p-4 ${className}`
          : `mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 ${className}`
      }
    >
      <p className="font-semibold text-buscoedu-blue">{titulo}</p>
      <p className="mt-2 text-sm leading-relaxed text-buscoedu-text">{mensaje}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={disabled}
        className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-buscoedu-blue px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Reintentar
      </button>
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
  const universityName = (oferta.universidad?.nombre ?? "").trim() || "Institución por confirmar";
  const universityColor = getUniversityColor(oferta.universidad_id, universityName);
  const universityTextColor = getUniversityTextColor(oferta.universidad_id, universityName);
  const summary = [
    universityName === "Institución por confirmar" ? universityName : nombreUniversidadCorto(universityName),
    modalidadCorta(oferta.programa?.modalidad),
    beneficioOCiudad(oferta),
  ].filter(Boolean);
  const resumen = summary.length > 0 ? summary.join(" | ") : "Datos por confirmar";
  const titulo = (oferta.programa?.nombre || oferta.nombre || "").trim() || "Programa por confirmar";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 border-b border-buscoedu-border px-3 py-3 text-left transition hover:bg-buscoedu-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-buscoedu-blue focus-visible:ring-inset"
      aria-label={`Abrir ${titulo}, ${universityName}`}
    >
      <span
        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-base font-bold"
        style={{ backgroundColor: universityColor, color: universityTextColor }}
        aria-hidden="true"
      >
        {universityName.charAt(0).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-buscoedu-blue">{titulo}</span>
        <span className="mt-1 block truncate text-xs font-medium text-buscoedu-muted">{resumen}</span>
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
