'use client';

/**
 * E1 · Frontend — Barra fija de 5 pasos del asistente (A1, brief UX §3.1 y §5).
 *
 * Qué hace: en web, una lista horizontal con número y nombre; el paso actual en índigo con
 * `aria-current="step"`, los completos con ✓ y los futuros sin poder pulsarse. En < 640 px,
 * «Paso 2 de 5 · Clave» + barra de progreso, y la lista completa en un desplegable.
 * Para qué: que el admin sepa siempre dónde está y cuánto falta, también en 390 px.
 */

import type { PasoAsistente } from '@/src/lib/admin-ia/asistente';
import { PASOS } from '@/src/lib/admin-ia/asistente';
import { FOCO } from './estilos';
import { IconoCheck } from './Iconos';

export default function BarraPasos({
  actual,
  completo,
  navegable,
  onIr
}: {
  actual: PasoAsistente;
  completo: (p: PasoAsistente) => boolean;
  navegable: (p: PasoAsistente) => boolean;
  onIr: (p: PasoAsistente) => void;
}) {
  const indice = PASOS.findIndex((p) => p.id === actual);
  const pct = Math.round(((indice + 1) / PASOS.length) * 100);

  // Un paso de la lista (se usa en web y en el desplegable móvil).
  const item = (p: (typeof PASOS)[number], i: number) => {
    const esActual = p.id === actual;
    const hecho = completo(p.id) && !esActual;
    const puede = navegable(p.id);
    return (
      <li key={p.id} className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => puede && onIr(p.id)}
          disabled={!puede}
          aria-current={esActual ? 'step' : undefined}
          aria-label={`Paso ${i + 1} de ${PASOS.length}: ${p.nombre}${hecho ? ', completo' : ''}${!puede ? ', bloqueado hasta completar los anteriores' : ''}`}
          className={`${FOCO} flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2 py-2 text-left ${esActual ? 'bg-[#3b2f8f] text-white' : puede ? 'text-[#3b2f8f] hover:bg-[#ece8f7]' : 'cursor-not-allowed text-[#6b63a8]'}`}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${esActual ? 'border-white bg-white text-[#3b2f8f]' : hecho ? 'border-[#15803d] bg-[#15803d] text-white' : 'border-current'}`} aria-hidden="true">
            {hecho ? <IconoCheck className="h-4 w-4" /> : i + 1}
          </span>
          <span className="truncate font-semibold">{p.nombre}</span>
        </button>
      </li>
    );
  };

  return (
    <div className="-mx-4 mb-5 border-b border-[#ece8f7] bg-[#f7f4ee]/95 px-4 py-2 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:bg-white sm:px-3">
      {/* Web: barra horizontal completa. */}
      <nav aria-label="Pasos del asistente" className="hidden sm:block">
        <ol className="flex items-center gap-1">{PASOS.map(item)}</ol>
      </nav>

      {/* Móvil: «Paso N de 5» + barra de progreso + desplegable con la lista. */}
      <div className="sm:hidden">
        <p className="flex items-baseline justify-between text-base">
          <span className="font-bold text-[#3b2f8f]">Paso {indice + 1} de {PASOS.length}</span>
          <span className="font-semibold text-[#1a1830]">{PASOS[indice].nombre}</span>
        </p>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#ece8f7]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`Progreso: paso ${indice + 1} de ${PASOS.length}`}>
          <div className="h-full rounded-full bg-[#3b2f8f] motion-safe:transition-all" style={{ width: `${pct}%` }} />
        </div>
        <details className="mt-1">
          <summary className={`${FOCO} flex min-h-[44px] cursor-pointer items-center rounded text-sm font-semibold text-[#3b2f8f] underline underline-offset-2`}>Ver todos los pasos</summary>
          <nav aria-label="Pasos del asistente (lista)">
            <ol className="space-y-1 pb-2">{PASOS.map(item)}</ol>
          </nav>
        </details>
      </div>
    </div>
  );
}
