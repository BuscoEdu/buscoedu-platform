"use client";

import { useState, useEffect } from 'react';
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

  // Estado local para campos de texto (evita pérdida de foco al escribir).
  // Solo propaga al padre al presionar Enter o al salir del campo (onBlur).
  const [localTexts, setLocalTexts] = useState({
    programa_o_area: filtros.programa_o_area || '',
    pais: filtros.pais || '',
    ciudad: filtros.ciudad || '',
    universidad: filtros.universidad || ''
  });

  // Sincronizar estado local cuando cambien los filtros externos (ej. tags activos).
  useEffect(() => {
    setLocalTexts({
      programa_o_area: filtros.programa_o_area || '',
      pais: filtros.pais || '',
      ciudad: filtros.ciudad || '',
      universidad: filtros.universidad || ''
    });
  }, [filtros.programa_o_area, filtros.pais, filtros.ciudad, filtros.universidad]);

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

  const handleTextChange = (key: keyof typeof localTexts, value: string) => {
    setLocalTexts(prev => ({ ...prev, [key]: value }));
  };

  const commitTextFilter = (key: keyof typeof localTexts) => {
    const value = localTexts[key].trim();
    handleChange(key, value);
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
            value={localTexts.programa_o_area}
            onChange={(e) => handleTextChange('programa_o_area', e.target.value)}
            onBlur={() => commitTextFilter('programa_o_area')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitTextFilter('programa_o_area');
              }
            }}
            placeholder="Ej: Administración, Medicina... (presiona Enter)"
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
            value={localTexts.pais}
            onChange={(e) => handleTextChange('pais', e.target.value)}
            onBlur={() => commitTextFilter('pais')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitTextFilter('pais');
              }
            }}
            placeholder="Ej: Colombia (presiona Enter)"
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
            value={localTexts.ciudad}
            onChange={(e) => handleTextChange('ciudad', e.target.value)}
            onBlur={() => commitTextFilter('ciudad')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitTextFilter('ciudad');
              }
            }}
            placeholder="Ej: Bogotá (presiona Enter)"
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
            value={localTexts.universidad}
            onChange={(e) => handleTextChange('universidad', e.target.value)}
            onBlur={() => commitTextFilter('universidad')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitTextFilter('universidad');
              }
            }}
            placeholder="Nombre de universidad (presiona Enter)"
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
