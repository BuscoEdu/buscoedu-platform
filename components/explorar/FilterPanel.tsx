"use client";

import { useState } from 'react';
import type { FiltrosOferta } from '@/src/lib/ofertas';

interface FilterPanelProps {
  filtros: FiltrosOferta;
  onFiltrosChange: (filtros: FiltrosOferta) => void;
}

const NIVELES_ACADEMICOS = [
  'Pregrado',
  'Técnico',
  'Tecnólogo',
  'Especialización',
  'Maestría',
  'Doctorado',
  'Educación Continua'
];

const MODALIDADES = [
  'Presencial',
  'Virtual',
  'Híbrida'
];

const TIPOS_BENEFICIO = [
  'Beca',
  'Descuento',
  'Financiación',
  'Convenio',
  'Otro'
];

export default function FilterPanel({ filtros, onFiltrosChange }: FilterPanelProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    estudios: true,
    ubicacion: false,
    modalidad: false,
    beneficios: false
  });

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [group]: !prev[group]
    }));
  };

  const handleChange = (key: keyof FiltrosOferta, value: string) => {
    onFiltrosChange({
      ...filtros,
      [key]: value || undefined
    });
  };

  const handleClear = (key: keyof FiltrosOferta) => {
    const newFiltros = { ...filtros };
    delete newFiltros[key];
    onFiltrosChange(newFiltros);
  };

  const FilterGroup = ({ title, groupKey, children }: { title: string; groupKey: string; children: React.ReactNode }) => (
    <div className="border-b border-buscoedu-border pb-4">
      <button
        onClick={() => toggleGroup(groupKey)}
        className="w-full flex items-center justify-between text-left font-semibold text-buscoedu-blue py-2"
      >
        <span>{title}</span>
        <svg
          className={`w-5 h-5 transition-transform ${expandedGroups[groupKey] ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expandedGroups[groupKey] && (
        <div className="mt-3 space-y-3">
          {children}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Grupo: Estudios */}
      <FilterGroup title="Estudios" groupKey="estudios">
        <div>
          <label htmlFor="programa-area" className="block text-sm font-medium text-buscoedu-text mb-1">
            Programa o área
          </label>
          <input
            id="programa-area"
            type="text"
            value={filtros.programa_o_area || ''}
            onChange={(e) => handleChange('programa_o_area', e.target.value)}
            placeholder="Ej: Administración, Medicina..."
            className="w-full px-3 py-2 border border-buscoedu-border rounded-md text-sm focus:ring-2 focus:ring-buscoedu-blue focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="nivel-academico" className="block text-sm font-medium text-buscoedu-text mb-1">
            Nivel académico
          </label>
          <select
            id="nivel-academico"
            value={filtros.nivel_academico || ''}
            onChange={(e) => handleChange('nivel_academico', e.target.value)}
            className="w-full px-3 py-2 border border-buscoedu-border rounded-md text-sm focus:ring-2 focus:ring-buscoedu-blue focus:border-transparent"
          >
            <option value="">Todos los niveles</option>
            {NIVELES_ACADEMICOS.map(nivel => (
              <option key={nivel} value={nivel}>{nivel}</option>
            ))}
          </select>
        </div>
      </FilterGroup>

      {/* Grupo: Ubicación */}
      <FilterGroup title="Ubicación" groupKey="ubicacion">
        <div>
          <label htmlFor="pais" className="block text-sm font-medium text-buscoedu-text mb-1">
            País
          </label>
          <input
            id="pais"
            type="text"
            value={filtros.pais || ''}
            onChange={(e) => handleChange('pais', e.target.value)}
            placeholder="Ej: Colombia"
            className="w-full px-3 py-2 border border-buscoedu-border rounded-md text-sm focus:ring-2 focus:ring-buscoedu-blue focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="ciudad" className="block text-sm font-medium text-buscoedu-text mb-1">
            Ciudad
          </label>
          <input
            id="ciudad"
            type="text"
            value={filtros.ciudad || ''}
            onChange={(e) => handleChange('ciudad', e.target.value)}
            placeholder="Ej: Bogotá"
            className="w-full px-3 py-2 border border-buscoedu-border rounded-md text-sm focus:ring-2 focus:ring-buscoedu-blue focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="universidad" className="block text-sm font-medium text-buscoedu-text mb-1">
            Universidad
          </label>
          <input
            id="universidad"
            type="text"
            value={filtros.universidad || ''}
            onChange={(e) => handleChange('universidad', e.target.value)}
            placeholder="Nombre de universidad"
            className="w-full px-3 py-2 border border-buscoedu-border rounded-md text-sm focus:ring-2 focus:ring-buscoedu-blue focus:border-transparent"
          />
        </div>
      </FilterGroup>

      {/* Grupo: Modalidad */}
      <FilterGroup title="Modalidad y jornada" groupKey="modalidad">
        <div>
          <label htmlFor="modalidad" className="block text-sm font-medium text-buscoedu-text mb-1">
            Modalidad
          </label>
          <select
            id="modalidad"
            value={filtros.modalidad || ''}
            onChange={(e) => handleChange('modalidad', e.target.value)}
            className="w-full px-3 py-2 border border-buscoedu-border rounded-md text-sm focus:ring-2 focus:ring-buscoedu-blue focus:border-transparent"
          >
            <option value="">Todas las modalidades</option>
            {MODALIDADES.map(mod => (
              <option key={mod} value={mod}>{mod}</option>
            ))}
          </select>
        </div>
      </FilterGroup>

      {/* Grupo: Beneficios */}
      <FilterGroup title="Beneficios" groupKey="beneficios">
        <div>
          <label htmlFor="tipo-beneficio" className="block text-sm font-medium text-buscoedu-text mb-1">
            Tipo de beneficio
          </label>
          <select
            id="tipo-beneficio"
            value={filtros.tipo_beneficio || ''}
            onChange={(e) => handleChange('tipo_beneficio', e.target.value)}
            className="w-full px-3 py-2 border border-buscoedu-border rounded-md text-sm focus:ring-2 focus:ring-buscoedu-blue focus:border-transparent"
          >
            <option value="">Todos los beneficios</option>
            {TIPOS_BENEFICIO.map(tipo => (
              <option key={tipo} value={tipo}>{tipo}</option>
            ))}
          </select>
        </div>
      </FilterGroup>
    </div>
  );
}
