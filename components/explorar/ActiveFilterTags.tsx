"use client";

import type { FiltrosOferta } from '@/src/lib/ofertas';

interface ActiveFilterTagsProps {
  filtros: FiltrosOferta;
  onRemoveFilter: (key: keyof FiltrosOferta) => void;
  onClearAll: () => void;
}

const FILTER_LABELS: Record<string, string> = {
  programa_o_area: 'Programa/Área',
  modalidad: 'Modalidad',
  ciudad: 'Ciudad',
  pais: 'País',
  nivel_academico: 'Nivel académico',
  tipo_beneficio: 'Beneficio',
  universidad: 'Universidad'
};

export default function ActiveFilterTags({ filtros, onRemoveFilter, onClearAll }: ActiveFilterTagsProps) {
  const activeFilters = Object.entries(filtros).filter(([_, value]) => value !== undefined && value !== '');

  if (activeFilters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-4 bg-white border-b border-buscoedu-border">
      <span className="text-sm font-medium text-buscoedu-muted">Filtros activos:</span>
      
      {activeFilters.map(([key, value]) => (
        <button
          key={key}
          onClick={() => onRemoveFilter(key as keyof FiltrosOferta)}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-buscoedu-teal/10 text-buscoedu-teal rounded-full text-sm hover:bg-buscoedu-teal/20 transition-colors"
        >
          <span>
            <strong>{FILTER_LABELS[key] || key}:</strong> {value}
          </span>
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      ))}

      {activeFilters.length > 1 && (
        <button
          onClick={onClearAll}
          className="text-sm text-buscoedu-muted hover:text-buscoedu-blue underline"
        >
          Limpiar todos
        </button>
      )}
    </div>
  );
}
