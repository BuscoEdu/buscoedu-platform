'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardCard from '@/components/admin/DashboardCard';
import { getSupabaseClient } from '@/src/lib/supabase';

type Metrics = {
  universidades: number;
  sedes: number;
  programas: number;
  ofertas: number;
};

function countByEstado(rows: Array<{ estado_publicacion: string | null }>) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const estado = row.estado_publicacion || 'sin_estado';
    acc[estado] = (acc[estado] || 0) + 1;
    return acc;
  }, {});
}

export default function AdminDashboardPage() {
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);
  const [metrics, setMetrics] = useState<Metrics>({
    universidades: 0,
    sedes: 0,
    programas: 0,
    ofertas: 0
  });
  const [ofertasPorEstado, setOfertasPorEstado] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    async function loadMetrics() {
      setIsLoading(true);
      setError(null);

      const [universidadesRes, sedesRes, programasRes, ofertasRes, ofertasEstadoRes] = await Promise.all([
        supabase.from('universidades').select('*', { count: 'exact', head: true }).eq('activo', true),
        supabase.from('sedes').select('*', { count: 'exact', head: true }).eq('activo', true),
        supabase
          .from('programas_academicos')
          .select('*', { count: 'exact', head: true })
          .eq('activo', true),
        supabase.from('ofertas_academicas').select('*', { count: 'exact', head: true }).eq('activo', true),
        supabase
          .from('ofertas_academicas')
          .select('estado_publicacion')
          .eq('activo', true)
      ]);

      const anyError =
        universidadesRes.error ||
        sedesRes.error ||
        programasRes.error ||
        ofertasRes.error ||
        ofertasEstadoRes.error;

      if (anyError) {
        setError(anyError.message || 'No fue posible cargar las métricas del dashboard.');
        setIsLoading(false);
        return;
      }

      setMetrics({
        universidades: universidadesRes.count ?? 0,
        sedes: sedesRes.count ?? 0,
        programas: programasRes.count ?? 0,
        ofertas: ofertasRes.count ?? 0
      });

      setOfertasPorEstado(countByEstado(ofertasEstadoRes.data || []));
      setIsLoading(false);
    }

    loadMetrics();
  }, [supabase]);

  const estadoItems = useMemo(() => Object.entries(ofertasPorEstado), [ofertasPorEstado]);

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Dashboard</h1>
        <p className="text-sm text-buscoedu-muted">Resumen general del ecosistema académico activo.</p>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-buscoedu-border bg-white p-4 text-sm text-buscoedu-text shadow-card">
          Cargando métricas...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <DashboardCard title="Universidades activas" value={metrics.universidades} />
            <DashboardCard title="Sedes activas" value={metrics.sedes} />
            <DashboardCard title="Programas activos" value={metrics.programas} />
            <DashboardCard title="Ofertas activas" value={metrics.ofertas} />
          </div>

          <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
            <h2 className="text-lg font-semibold text-buscoedu-blue">Ofertas por estado de publicación</h2>

            {estadoItems.length === 0 ? (
              <p className="mt-3 text-sm text-buscoedu-muted">No hay ofertas activas para agrupar por estado.</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {estadoItems.map(([estado, total]) => (
                  <DashboardCard key={estado} title={estado.replaceAll('_', ' ')} value={total} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
