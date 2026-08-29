'use client';

function formatCurrencyPreview(value: string, currency: string) {
  const normalized = value.replace(/[^\d.,-]/g, '').replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return '';

  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: currency || 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

type CurrencyInputProps = {
  label: string;
  value: string;
  currency: string;
  onChange: (value: string) => void;
  error?: string;
  helperText?: string;
  requiredMark?: boolean;
  name?: string;
  disabled?: boolean;
};

export default function CurrencyInput({
  label,
  value,
  currency,
  onChange,
  error,
  helperText,
  requiredMark,
  name,
  disabled
}: CurrencyInputProps) {
  const formatted = formatCurrencyPreview(value, currency);

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-buscoedu-text">
        {label} {requiredMark ? <span className="text-red-600">*</span> : null}
      </label>
      <input
        type="text"
        inputMode="decimal"
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d.,]/g, ''))}
        disabled={disabled}
        placeholder="Ej: 1500000"
        className={`w-full rounded-lg border px-3 py-2.5 text-sm text-buscoedu-text outline-none ring-buscoedu-teal transition focus:ring-2 ${
          error ? 'border-red-300 bg-red-50/40' : 'border-buscoedu-border bg-white'
        } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
      />
      {formatted ? <p className="text-xs text-buscoedu-muted">Vista previa: {formatted}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {!error && helperText ? <p className="text-xs text-buscoedu-muted">{helperText}</p> : null}
    </div>
  );
}
