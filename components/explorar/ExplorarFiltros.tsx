"use client";

import { useEffect, useId, useState } from "react";
import FilterPanel from "@/components/explorar/FilterPanel";
import type { FiltrosOferta } from "@/src/lib/ofertas";

/**
 * Filtros de Explorar (E4). En web van fijos arriba y se aplican con el botón.
 * En móvil viven en una hoja inferior, con «Aplicar filtros» visible y un cierre
 * que se puede usar con teclado. No hay filtro de precio: el catálogo no trae ese dato.
 * «Solo aliadas» no es un interruptor: obtenerOfertas ya deja fuera al resto.
 */

const MODALIDADES = ["Presencial", "Virtual", "Híbrida"];

type Props = {
  filtros: FiltrosOferta;
  onAplicar: (filtros: FiltrosOferta) => void;
  disabled?: boolean;
};

function limpiarVacios(filtros: FiltrosOferta): FiltrosOferta {
  const siguiente: FiltrosOferta = {};
  (Object.entries(filtros) as Array<[keyof FiltrosOferta, string | undefined]>).forEach(([clave, valor]) => {
    const texto = (valor ?? "").trim();
    if (texto) siguiente[clave] = texto;
  });
  return siguiente;
}

export default function ExplorarFiltros({ filtros, onAplicar, disabled = false }: Props) {
  const tituloHoja = useId();
  const [abierta, setAbierta] = useState(false);
  const [borrador, setBorrador] = useState<FiltrosOferta>(filtros);

  useEffect(() => {
    setBorrador(filtros);
  }, [filtros]);

  useEffect(() => {
    if (!abierta) return;
    const alEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAbierta(false);
    };
    window.addEventListener("keydown", alEscape);
    return () => window.removeEventListener("keydown", alEscape);
  }, [abierta]);

  const aplicar = () => {
    onAplicar(limpiarVacios(borrador));
    setAbierta(false);
  };

  const conBeca = (borrador.tipo_beneficio ?? "").toLowerCase().startsWith("beca");

  const alternarBeca = () => {
    setBorrador((actual) => {
      const siguiente = { ...actual };
      if ((siguiente.tipo_beneficio ?? "").toLowerCase().startsWith("beca")) delete siguiente.tipo_beneficio;
      else siguiente.tipo_beneficio = "Beca";
      return siguiente;
    });
  };

  const campo =
    "min-h-11 w-full rounded-full border-2 border-[var(--color-text)] bg-white px-3 text-sm text-[var(--color-text)]";

  const barra = (
    <div className="flex flex-wrap items-end gap-2">
      <span className="inline-flex min-h-11 items-center rounded-full border-2 border-[var(--color-primary)] bg-[var(--color-band)] px-3 text-xs font-bold uppercase tracking-wide text-[var(--color-text)]">
        Solo aliadas
      </span>
      <label className="min-w-[140px] flex-1 text-xs font-semibold text-[var(--color-text)]">
        Ciudad
        <input
          value={borrador.ciudad ?? ""}
          onChange={(event) => setBorrador((actual) => ({ ...actual, ciudad: event.target.value }))}
          className={`${campo} mt-1`}
          placeholder="Ciudad"
        />
      </label>
      <label className="min-w-[140px] flex-1 text-xs font-semibold text-[var(--color-text)]">
        Modalidad
        <select
          value={borrador.modalidad ?? ""}
          onChange={(event) => setBorrador((actual) => ({ ...actual, modalidad: event.target.value }))}
          className={`${campo} mt-1`}
        >
          <option value="">Todas</option>
          {MODALIDADES.map((modalidad) => (
            <option key={modalidad} value={modalidad}>
              {modalidad}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={alternarBeca}
        aria-pressed={conBeca}
        className={`inline-flex min-h-11 items-center rounded-full border-2 border-[var(--color-text)] px-3 text-sm font-bold ${
          conBeca ? "bg-[var(--color-band)] text-[var(--color-text)]" : "bg-white text-[var(--color-text)]"
        }`}
      >
        Con beca
      </button>
      <button
        type="button"
        onClick={aplicar}
        disabled={disabled}
        className="inline-flex min-h-11 items-center rounded-full border-2 border-[var(--color-text)] bg-[var(--color-primary)] px-4 text-sm font-bold text-white shadow-[var(--shadow-hard)] disabled:opacity-60"
      >
        Aplicar filtros
      </button>
    </div>
  );

  return (
    <div className="sticky top-16 z-20 -mx-4 bg-[var(--color-bg)] px-4 py-3 sm:-mx-8 sm:px-8">
      <div className="hidden md:block">{barra}</div>

      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setAbierta(true)}
          className="inline-flex min-h-11 items-center rounded-full border-2 border-[var(--color-text)] bg-white px-4 text-sm font-bold text-[var(--color-text)] shadow-[var(--shadow-hard)]"
        >
          Filtros
        </button>
      </div>

      {abierta ? (
        <div className="fixed inset-0 z-[80] flex items-end md:items-center md:justify-center" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--color-text)]/40"
            aria-label="Cerrar filtros"
            onClick={() => setAbierta(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={tituloHoja}
            className="relative flex max-h-[85dvh] w-full flex-col rounded-t-[var(--radius-card)] border-2 border-[var(--color-text)] bg-white p-4 shadow-[var(--shadow-hard)] md:max-w-lg md:rounded-[var(--radius-card)]"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id={tituloHoja} className="text-lg font-bold text-[var(--color-text)]">
                Filtros
              </h2>
              <button
                type="button"
                onClick={() => setAbierta(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border-2 border-[var(--color-text)] text-sm font-bold"
                aria-label="Cerrar filtros"
              >
                Cerrar
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <p className="mb-3 text-sm text-[var(--color-muted)]">
                El catálogo solo incluye universidades aliadas.
              </p>
              <FilterPanel filtros={borrador} onFiltrosChange={setBorrador} />
            </div>
            <div className="a2-fab-safe sticky bottom-0 bg-white pt-3 md:pb-0">
              <button
                type="button"
                onClick={aplicar}
                disabled={disabled}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-full border-2 border-[var(--color-text)] bg-[var(--color-primary)] px-4 text-sm font-bold text-white shadow-[var(--shadow-hard)] disabled:opacity-60"
              >
                Aplicar filtros
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-3 hidden md:block">
        <button
          type="button"
          onClick={() => setAbierta(true)}
          className="text-sm font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline"
        >
          Más filtros
        </button>
      </div>
    </div>
  );
}
