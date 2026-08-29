'use client';

type FormToggleProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  helperText?: string;
  disabled?: boolean;
};

export default function FormToggle({ label, checked, onChange, helperText, disabled }: FormToggleProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-buscoedu-border bg-white px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-buscoedu-text">{label}</p>
          {helperText ? <p className="text-xs text-buscoedu-muted">{helperText}</p> : null}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
            checked ? 'bg-buscoedu-teal' : 'bg-gray-300'
          } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
              checked ? 'translate-x-5' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
