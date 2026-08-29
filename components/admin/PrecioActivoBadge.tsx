'use client';

type PrecioActivoBadgeProps = {
  isActive: boolean;
};

export default function PrecioActivoBadge({ isActive }: PrecioActivoBadgeProps) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
        isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-700'
      }`}
    >
      {isActive ? 'Activo' : 'Inactivo'}
    </span>
  );
}
