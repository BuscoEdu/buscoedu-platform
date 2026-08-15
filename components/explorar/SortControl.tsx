"use client";

interface SortControlProps {
  value: string;
  onChange: (value: string) => void;
}

const SORT_OPTIONS = [
  { value: 'relevancia', label: 'Más relevantes' },
  { value: 'recientes', label: 'Más recientes' },
  { value: 'nombre_asc', label: 'Nombre (A-Z)' },
  { value: 'nombre_desc', label: 'Nombre (Z-A)' }
];

export default function SortControl({ value, onChange }: SortControlProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort-select" className="text-sm font-medium text-buscoedu-text">
        Ordenar por:
      </label>
      <select
        id="sort-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 border border-buscoedu-border rounded-md text-sm focus:ring-2 focus:ring-buscoedu-blue focus:border-transparent bg-white"
      >
        {SORT_OPTIONS.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
