'use client';

import EstadoBadge from './EstadoBadge';

export interface EjecucionItem {
  id: string;
  estado: string;
  duracion_ms: number | null;
  ejecutado_en: string;
  error: string | null;
  agentes_ia?: { codigo?: string; nombre?: string } | null;
  canales_ia?: { codigo?: string; nombre?: string } | null;
}

/**
 * Tabla reutilizable de ejecuciones de agentes.
 */
export default function TablaEjecuciones({
  items,
  loading
}: {
  items: EjecucionItem[];
  loading?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-buscoedu-border bg-white shadow-card">
      <table className="min-w-full text-sm">
        <thead className="bg-buscoedu-bg text-left text-xs uppercase tracking-wide text-buscoedu-muted">
          <tr>
            <th className="px-3 py-3">Agente</th>
            <th className="px-3 py-3">Canal</th>
            <th className="px-3 py-3">Estado</th>
            <th className="px-3 py-3">Duración</th>
            <th className="px-3 py-3">Fecha</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-buscoedu-border text-buscoedu-text">
          {loading ? (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-buscoedu-muted">
                Cargando ejecuciones...
              </td>
            </tr>
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-buscoedu-muted">
                No hay ejecuciones registradas.
              </td>
            </tr>
          ) : (
            items.map((it) => (
              <tr key={it.id}>
                <td className="px-3 py-3">{it.agentes_ia?.nombre || it.agentes_ia?.codigo || '—'}</td>
                <td className="px-3 py-3">{it.canales_ia?.nombre || it.canales_ia?.codigo || '—'}</td>
                <td className="px-3 py-3">
                  <EstadoBadge estado={it.estado} />
                  {it.error ? <p className="mt-1 max-w-xs truncate text-xs text-red-600">{it.error}</p> : null}
                </td>
                <td className="px-3 py-3 text-xs text-buscoedu-muted">
                  {it.duracion_ms != null ? `${it.duracion_ms} ms` : '—'}
                </td>
                <td className="px-3 py-3 text-xs text-buscoedu-muted">
                  {new Date(it.ejecutado_en).toLocaleString('es-CO')}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
