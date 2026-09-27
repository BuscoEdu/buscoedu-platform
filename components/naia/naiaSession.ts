import type { FiltrosOferta, OfertaAcademica } from "@/src/lib/ofertas";
import type { NaiaResponse } from "@/src/lib/naia-real";

/**
 * BA-014: la sesión de NaIA se guarda completa o no se guarda.
 * Un chat sin resultados ni filtros es un corte a medias y se descarta.
 */

export type OrdenNaia = "recomendado" | "virtual" | "beneficio" | "universidad";
export type EstadoPersistido = "listo" | "error";

export type AvisoPersistido = {
  ambito: "resultados" | "paginacion" | "naia";
  mensaje: string;
};

export type MensajePersistido = {
  id: string;
  autor: "estudiante" | "naia";
  contenido: string;
};

export type SnapshotNaia = {
  version: 2;
  conversationId?: string;
  mensajes: MensajePersistido[];
  filtros: FiltrosOferta;
  ofertas: OfertaAcademica[];
  total: number;
  orden: OrdenNaia;
  respuesta: NaiaResponse | null;
  estado: EstadoPersistido;
  avisoConsulta: AvisoPersistido | null;
};

const ORDENES = new Set<OrdenNaia>(["recomendado", "virtual", "beneficio", "universidad"]);
const AMBITOS = new Set<AvisoPersistido["ambito"]>(["resultados", "paginacion", "naia"]);

function esAviso(value: unknown): value is AvisoPersistido {
  if (!value || typeof value !== "object") return false;
  const aviso = value as AvisoPersistido;
  return AMBITOS.has(aviso.ambito) && typeof aviso.mensaje === "string" && aviso.mensaje.trim().length > 0;
}

function esMensaje(value: unknown): value is MensajePersistido {
  if (!value || typeof value !== "object") return false;
  const mensaje = value as MensajePersistido;
  return (
    typeof mensaje.id === "string" &&
    (mensaje.autor === "estudiante" || mensaje.autor === "naia") &&
    typeof mensaje.contenido === "string"
  );
}

export function esSnapshotCompleto(value: unknown): value is SnapshotNaia {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as SnapshotNaia;

  if (snapshot.version !== 2) return false;
  if (!Array.isArray(snapshot.mensajes) || snapshot.mensajes.length === 0) return false;
  if (!snapshot.mensajes.every(esMensaje)) return false;
  if (!snapshot.filtros || typeof snapshot.filtros !== "object" || Array.isArray(snapshot.filtros)) return false;
  if (!Array.isArray(snapshot.ofertas)) return false;
  if (!snapshot.ofertas.every((oferta) => !!oferta && typeof oferta.id === "string")) return false;
  if (typeof snapshot.total !== "number" || !Number.isFinite(snapshot.total) || snapshot.total < 0) return false;
  if (!ORDENES.has(snapshot.orden)) return false;
  if (snapshot.estado !== "listo" && snapshot.estado !== "error") return false;
  if (snapshot.respuesta !== null && typeof snapshot.respuesta !== "object") return false;
  if (
    typeof snapshot.conversationId !== "undefined" &&
    snapshot.conversationId !== null &&
    typeof snapshot.conversationId !== "string"
  ) {
    return false;
  }

  if (snapshot.estado === "error") {
    if (!esAviso(snapshot.avisoConsulta)) return false;
  } else if (snapshot.avisoConsulta !== null && !esAviso(snapshot.avisoConsulta)) {
    return false;
  }

  // Un listado “listo” no puede arrastrar el fallo de la consulta principal.
  if (snapshot.estado === "listo" && snapshot.avisoConsulta?.ambito === "resultados") return false;

  return true;
}
