"use client";

import type { OfertaAcademica } from "@/src/lib/ofertas";

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
 * Chip del beneficio. Debe salir de `etiquetaBeneficio()`
 * (`src/lib/etiquetas-beneficio.ts`): null = no hay chip.
 * El import espera a que ese archivo esté en origin/feat/restyle-a2.
 * No hay un mapa local.
 */
function textoBeca(oferta: OfertaAcademica): string | null {
  const candidatos = [
    textoVisible(oferta.tipo_beneficio),
    ...(oferta.beneficios ?? []).map((beneficio) =>
      [textoVisible(beneficio.tipo), textoVisible(beneficio.descripcion)].filter(Boolean).join(": ")
    )
  ].filter(Boolean);
  return candidatos.find((texto) => /beca/i.test(texto)) ?? null;
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
          <span className="mt-3 inline-flex w-fit rounded-full border border-[var(--color-text)] bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text)]">
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
