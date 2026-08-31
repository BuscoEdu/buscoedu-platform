'use client';

/**
 * Badge de color según el estado de una entidad del Centro de Agentes IA.
 */

const MAPA_COLORES: Record<string, string> = {
  // Agentes / versiones
  activo: 'bg-emerald-100 text-emerald-800',
  publicada: 'bg-emerald-100 text-emerald-800',
  borrador: 'bg-amber-100 text-amber-800',
  pausado: 'bg-amber-100 text-amber-800',
  desactivada: 'bg-gray-200 text-gray-700',
  inactivo: 'bg-gray-200 text-gray-700',
  archivado: 'bg-gray-200 text-gray-700',
  archivada: 'bg-gray-200 text-gray-700',
  // Ejecuciones
  exitoso: 'bg-emerald-100 text-emerald-800',
  fallback: 'bg-amber-100 text-amber-800',
  error: 'bg-red-100 text-red-800',
  // Pruebas
  pendiente: 'bg-blue-100 text-blue-800',
  exitosa: 'bg-emerald-100 text-emerald-800',
  fallida: 'bg-red-100 text-red-800'
};

export default function EstadoBadge({ estado }: { estado: string | null | undefined }) {
  const clave = (estado || '').toLowerCase();
  const clases = MAPA_COLORES[clave] || 'bg-gray-100 text-gray-700';
  return (
    <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${clases}`}>
      {estado || '—'}
    </span>
  );
}
