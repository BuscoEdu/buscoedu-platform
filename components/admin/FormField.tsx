'use client';

import { InputHTMLAttributes } from 'react';

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  helperText?: string;
  requiredMark?: boolean;
};

export default function FormField({
  label,
  error,
  helperText,
  requiredMark,
  className,
  id,
  ...inputProps
}: FormFieldProps) {
  const inputId = id || inputProps.name;

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-buscoedu-text">
        {label} {requiredMark ? <span className="text-red-600">*</span> : null}
      </label>
      <input
        id={inputId}
        className={`w-full rounded-lg border px-3 py-2.5 text-sm text-buscoedu-text outline-none ring-buscoedu-teal transition focus:ring-2 ${
          error ? 'border-red-300 bg-red-50/40' : 'border-buscoedu-border bg-white'
        } ${className || ''}`}
        {...inputProps}
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {!error && helperText ? <p className="text-xs text-buscoedu-muted">{helperText}</p> : null}
    </div>
  );
}
