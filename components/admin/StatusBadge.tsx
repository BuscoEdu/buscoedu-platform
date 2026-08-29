'use client';

type StatusBadgeProps = {
  status?: string | null;
  active?: boolean | null;
};

const STATUS_STYLES: Record<string, string> = {
  activo: 'bg-emerald-100 text-emerald-700',
  en_curso: 'bg-sky-100 text-sky-700',
  finalizado: 'bg-slate-200 text-slate-700',
  cancelado: 'bg-rose-100 text-rose-700',
  inactivo: 'bg-gray-200 text-gray-700',
  pendiente: 'bg-amber-100 text-amber-700'
};

export default function StatusBadge({ status, active }: StatusBadgeProps) {
  const normalized = (status || '').toLowerCase().trim();
  const label = normalized ? normalized.replaceAll('_', ' ') : active === true ? 'activo' : active === false ? 'inactivo' : '—';
  const styleKey = normalized || (active === true ? 'activo' : active === false ? 'inactivo' : '');

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
        STATUS_STYLES[styleKey] || 'bg-gray-100 text-gray-700'
      }`}
    >
      {label}
    </span>
  );
}
