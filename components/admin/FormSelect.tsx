'use client';

import { useMemo, useState } from 'react';

type Option = {
  value: string;
  label: string;
};

type FormSelectProps = {
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  helperText?: string;
  disabled?: boolean;
  requiredMark?: boolean;
  searchable?: boolean;
  name?: string;
};

export default function FormSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Selecciona una opción',
  error,
  helperText,
  disabled,
  requiredMark,
  searchable = true,
  name
}: FormSelectProps) {
  const [search, setSearch] = useState('');

  const filteredOptions = useMemo(() => {
    if (!searchable || !search.trim()) return options;
    const term = search.toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(term));
  }, [options, search, searchable]);

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-buscoedu-text">
        {label} {requiredMark ? <span className="text-red-600">*</span> : null}
      </label>

      {searchable ? (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar opción..."
          className="w-full rounded-lg border border-buscoedu-border px-3 py-2 text-sm text-buscoedu-text outline-none ring-buscoedu-teal focus:ring-2"
          disabled={disabled}
        />
      ) : null}

      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full rounded-lg border px-3 py-2.5 text-sm text-buscoedu-text outline-none ring-buscoedu-teal focus:ring-2 ${
          error ? 'border-red-300 bg-red-50/40' : 'border-buscoedu-border bg-white'
        } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
      >
        <option value="">{placeholder}</option>
        {filteredOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {!error && helperText ? <p className="text-xs text-buscoedu-muted">{helperText}</p> : null}
    </div>
  );
}
