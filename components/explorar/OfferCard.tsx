"use client";

import type { OfertaAcademica } from "@/src/lib/ofertas";
import { etiquetaBeneficio } from "@/src/lib/etiquetas-beneficio";

interface OfferCardProps {
  oferta: OfertaAcademica;
  onCardClick: () => void;
  isInMyList?: boolean;
  onToggleMyList: () => void;
}

function tituloSinDuplicado(valor?: string): string {
  const titulo = (valor || "").trim().replace(/\s+/g, " ");
  if (!titulo) return "Programa por confirmar";
  const palabras = titulo.split(" ");
  if (palabras.length % 2 !== 0) return titulo;
  const mitad = palabras.length / 2;
  const primera = palabras.slice(0, mitad).join(" ");
  const segunda = palabras.slice(mitad).join(" ");
  return primera.localeCompare(segunda, "es", { sensitivity: "base" }) === 0 ? primera : titulo;
}

function textoVisible(valor?: string | null): string {
  return (valor ?? "").trim();
}

/**
 * Chip del beneficio. Una sola fuente: etiquetaBeneficio() sobre el código
 * de la oferta. null (código vacío) = no hay chip. No se pinta el código crudo
 * ni el tipo con los guiones bajos cambiados por espacios.
 */
function textoBeca(oferta: OfertaAcademica): string | null {
  return etiquetaBeneficio(oferta.tipo_beneficio);
}

/**
 * Tarjeta de Explorar (Ola 2). Mismo tamaño y los mismos colores para todas
 * las universidades: la única marca distinta es el chip «Aliada».
 * El catálogo de esta pantalla sale de obtenerOfertas, que ya filtra aliadas.
 * Si un dato no viene en la oferta, esa línea no se pinta.
 * Guardar en Mi lista no abre el funnel de Aplicar.
 */
export default function OfferCard({ oferta, onCardClick, isInMyList = false, onToggleMyList }: OfferCardProps) {
  const nombreUniversidad = textoVisible(oferta.universidad?.nombre);
  const tituloPrograma = tituloSinDuplicado(oferta.programa?.nombre || oferta.nombre);
  const modalidad = textoVisible(oferta.programa?.modalidad);
  const ciudad = textoVisible(oferta.sede?.ciudad);
  const lugar = [modalidad, ciudad].filter(Boolean).join(" · ");
  const beca = textoBeca(oferta);
  const etiquetaGuardar = isInMyList ? "Quitar de Mi lista" : "Guardar en Mi lista";

  return (
    <article className="flex h-full flex-col rounded-[var(--radius-card)] border-2 border-[var(--color-text)] bg-white p-4 shadow-[var(--shadow-hard)]">
      {/*
        BA-013: abrir el detalle es un botón real. Guardar queda fuera
        para no anidar controles. «Ver detalle» no es Aplicar.
      */}
      <button
        type="button"
        onClick={onCardClick}
        className="flex flex-1 flex-col rounded-xl text-left"
      >
        <span className="inline-flex w-fit rounded-full bg-[var(--color-band)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text)]">
          Aliada
        </span>
        <h3 className="mt-3 font-display text-[28px] leading-[1.05] text-[var(--color-text)]">{tituloPrograma}</h3>
        {nombreUniversidad ? <p className="mt-2 text-sm text-[var(--color-muted)]">{nombreUniversidad}</p> : null}
        {lugar ? <p className="mt-3 text-sm text-[var(--color-text)]">{lugar}</p> : null}
        {beca ? (
          <span className="mt-3 inline-flex w-fit rounded-full border border-[var(--color-text)] bg-white px-2.5 py-1 text-[11px] font-bold text-[var(--color-text)]">
            {beca}
          </span>
        ) : null}
        <span className="mt-4 inline-flex w-fit items-center justify-center rounded-full border-2 border-[var(--color-text)] bg-white px-4 py-2 text-sm font-bold text-[var(--color-text)] shadow-[var(--shadow-hard)]">
          Ver detalle
        </span>
      </button>

      {/* BA-010: guardar en la lista local. No envía datos ni contacta a la universidad. */}
      <button
        type="button"
        onClick={onToggleMyList}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full border-2 border-[var(--color-text)] bg-white px-3 py-2 text-sm font-bold text-[var(--color-text)]"
        aria-pressed={isInMyList}
      >
        {etiquetaGuardar}
      </button>
    </article>
  );
}
