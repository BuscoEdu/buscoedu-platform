/**
 * W1 — Estado de viaje del hilo Demo WhatsApp.
 * Vive en el JSON de la conversación (contexto_resumido) y en la bitácora
 * de ejecuciones. No crea tablas. No habla con Meta.
 */

import { NOMBRES_ALIADAS } from "@/src/lib/aliadas-publicas";

export const PASOS_HILO = ["descubrir", "acotar", "comparar", "aplicar", "humano"] as const;
export type PasoHilo = (typeof PASOS_HILO)[number];

export type OfertaEnMesa = {
  id: string;
  nombre: string;
  universidad: string;
  modalidad?: string;
  nivel?: string;
  vigenciaHasta?: string;
  beneficio?: string;
};

export type SesionHilo = {
  paso: PasoHilo;
  ofertas_en_mesa: OfertaEnMesa[];
  ies_en_foco: string | null;
  intencion_aplicar_id: string | null;
};

export const SESION_HILO_VACIA: SesionHilo = {
  paso: "descubrir",
  ofertas_en_mesa: [],
  ies_en_foco: null,
  intencion_aplicar_id: null
};

const MAX_MESA = 5;

export function esPasoHilo(valor: unknown): valor is PasoHilo {
  return typeof valor === "string" && (PASOS_HILO as readonly string[]).includes(valor);
}

export function sanearOfertaEnMesa(valor: unknown): OfertaEnMesa | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const row = valor as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const nombre = typeof row.nombre === "string" ? row.nombre.trim() : "";
  const universidad = typeof row.universidad === "string" ? row.universidad.trim() : "";
  if (!id || !nombre || !universidad) return null;
  return {
    id,
    nombre: nombre.slice(0, 160),
    universidad: universidad.slice(0, 120),
    modalidad: typeof row.modalidad === "string" ? row.modalidad.slice(0, 40) : undefined,
    nivel: typeof row.nivel === "string" ? row.nivel.slice(0, 40) : undefined,
    vigenciaHasta: typeof row.vigenciaHasta === "string" ? row.vigenciaHasta.slice(0, 20) : undefined,
    beneficio: typeof row.beneficio === "string" ? row.beneficio.slice(0, 80) : undefined
  };
}

export function sanearSesionHilo(valor: unknown): SesionHilo {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) {
    return { ...SESION_HILO_VACIA };
  }
  const row = valor as Record<string, unknown>;
  const mesa = Array.isArray(row.ofertas_en_mesa)
    ? row.ofertas_en_mesa.map(sanearOfertaEnMesa).filter((item): item is OfertaEnMesa => Boolean(item))
    : [];
  return {
    paso: esPasoHilo(row.paso) ? row.paso : "descubrir",
    ofertas_en_mesa: mesa.slice(0, MAX_MESA),
    ies_en_foco: typeof row.ies_en_foco === "string" && row.ies_en_foco.trim() ? row.ies_en_foco.trim().slice(0, 120) : null,
    intencion_aplicar_id:
      typeof row.intencion_aplicar_id === "string" && row.intencion_aplicar_id.trim()
        ? row.intencion_aplicar_id.trim()
        : null
  };
}

export function leerSesionHiloDeContexto(contextoResumido: unknown): SesionHilo {
  if (typeof contextoResumido !== "string" || !contextoResumido.trim()) {
    return { ...SESION_HILO_VACIA };
  }
  try {
    const parsed = JSON.parse(contextoResumido) as { sesion_hilo?: unknown };
    return sanearSesionHilo(parsed?.sesion_hilo);
  } catch {
    return { ...SESION_HILO_VACIA };
  }
}

export function pideCatalogo(texto: string): boolean {
  const t = (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /(opcion|programa|carrera|compar|beca|oferta|mostrar|ver opciones|que hay|que tienes|recomend)/.test(t);
}

export function inferirPasoHilo(input: {
  previa: SesionHilo;
  textoUsuario: string;
  mesa: OfertaEnMesa[];
  requiereEscalamiento?: boolean;
}): PasoHilo {
  const t = (input.textoUsuario || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (input.requiereEscalamiento || /\b(asesor|humano|persona real)\b/.test(t)) return "humano";
  if (/\baplic/.test(t) || /\binscrib/.test(t)) return "aplicar";
  if (input.mesa.length >= 2 || /\bcompar/.test(t)) return "comparar";
  if (input.mesa.length === 1 || input.previa.paso === "acotar") return "acotar";
  if (input.previa.paso !== "descubrir") return input.previa.paso;
  return "descubrir";
}

export function fusionarSesionHilo(previa: SesionHilo, parche: Partial<SesionHilo>): SesionHilo {
  const base = sanearSesionHilo(previa);
  const mesa = parche.ofertas_en_mesa !== undefined ? parche.ofertas_en_mesa : base.ofertas_en_mesa;
  return sanearSesionHilo({
    ...base,
    ...parche,
    ofertas_en_mesa: mesa
  });
}

export const CONTRATO_W1_WHATSAPP = [
  "SESION_HILO (W1; canal WhatsApp; prevalece sobre memoria del modelo):",
  `Universo permitido: ${NOMBRES_ALIADAS.join(", ")}.`,
  "Prohibido nombrar otra universidad o un programa que no esté en OFERTAS_EN_MESA.",
  "Si la mesa está vacía, no inventes fichas: pregunta un dato o di que en el corredor no hay vigencia para eso.",
  "Una pregunta por turno. No mandes al portal ni a /explorar.",
  "Comparar = diferencias cortas entre 2 fichas de la mesa (IES, modalidad, vigencia).",
  "Aplicar = una sola institución nombrada. Varias IES = varios síes. Tú no creas el lead.",
  "Quick replies máximas 3, en palabras del estudiante (ej. Ver opciones vigentes / Comparar / Aplicar a [IES])."
].join("\n");

export function serializarSesionHilo(sesion: SesionHilo | undefined): string {
  const hilo = sanearSesionHilo(sesion);
  const mesa =
    hilo.ofertas_en_mesa.length === 0
      ? "- mesa: vacía"
      : hilo.ofertas_en_mesa
          .map((item, index) => {
            const extra = [item.universidad, item.modalidad, item.nivel, item.beneficio].filter(Boolean).join(" · ");
            return `- ${index + 1}. ${item.nombre} (${extra}) [${item.id}]`;
          })
          .join("\n");
  return [
    CONTRATO_W1_WHATSAPP,
    `paso=${hilo.paso}`,
    `ies_en_foco=${hilo.ies_en_foco || "ninguna"}`,
    "OFERTAS_EN_MESA:",
    mesa
  ].join("\n");
}
