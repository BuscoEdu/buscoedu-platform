'use client';

type LoadingSpinnerProps = {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
};

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]'
};

export default function LoadingSpinner({ text = 'Cargando...', size = 'md' }: LoadingSpinnerProps) {
  return (
    <div className="flex items-center gap-3 text-sm text-buscoedu-muted" role="status" aria-live="polite">
      <span
        className={`inline-block animate-spin rounded-full border-buscoedu-border border-t-buscoedu-teal ${sizeClasses[size]}`}
      />
      <span>{text}</span>
    </div>
  );
}
