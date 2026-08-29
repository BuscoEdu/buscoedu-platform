'use client';

type DatePickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helperText?: string;
  requiredMark?: boolean;
  name?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
};

export default function DatePicker({
  label,
  value,
  onChange,
  error,
  helperText,
  requiredMark,
  name,
  min,
  max,
  disabled
}: DatePickerProps) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-buscoedu-text">
        {label} {requiredMark ? <span className="text-red-600">*</span> : null}
      </label>
      <input
        type="date"
        name={name}
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border px-3 py-2.5 text-sm text-buscoedu-text outline-none ring-buscoedu-teal transition focus:ring-2 ${
          error ? 'border-red-300 bg-red-50/40' : 'border-buscoedu-border bg-white'
        } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {!error && helperText ? <p className="text-xs text-buscoedu-muted">{helperText}</p> : null}
    </div>
  );
}
