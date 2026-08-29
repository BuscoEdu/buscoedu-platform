'use client';

import { TextareaHTMLAttributes } from 'react';

type FormTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
  helperText?: string;
  maxLength?: number;
  requiredMark?: boolean;
};

export default function FormTextarea({
  label,
  error,
  helperText,
  maxLength,
  requiredMark,
  className,
  value,
  id,
  ...props
}: FormTextareaProps) {
  const textValue = typeof value === 'string' ? value : '';
  const inputId = id || props.name;

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-medium text-buscoedu-text">
        {label} {requiredMark ? <span className="text-red-600">*</span> : null}
      </label>
      <textarea
        id={inputId}
        value={value}
        maxLength={maxLength}
        className={`min-h-[120px] w-full rounded-lg border px-3 py-2.5 text-sm text-buscoedu-text outline-none ring-buscoedu-teal transition focus:ring-2 ${
          error ? 'border-red-300 bg-red-50/40' : 'border-buscoedu-border bg-white'
        } ${className || ''}`}
        {...props}
      />
      <div className="flex items-center justify-between gap-4">
        <div>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          {!error && helperText ? <p className="text-xs text-buscoedu-muted">{helperText}</p> : null}
        </div>
        {typeof maxLength === 'number' ? (
          <span className="text-xs text-buscoedu-muted">
            {textValue.length}/{maxLength}
          </span>
        ) : null}
      </div>
    </div>
  );
}
