import Link from 'next/link';
import { getServerSupabase } from '@/src/lib/supabase-server';

export const dynamic = 'force-dynamic';

const PRIORIDAD_BADGE: Record<string, string> = {
  alta: 'bg-red-100 text-red-700',
  media: 'bg-amber-100 text-amber-700',
  baja: 'bg-gray-100 text-gray-600'
};

interface SearchParams {
  estado?: string;
}

function fecha(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

export default async function TareasPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const estado = sp.estado || 'pendiente';

  let filas: any[] = [];
  let errorMsg = '';

  try {
    const supabase = await getServerSupabase();
    let q = supabase
      .from('tareas_crm')
      .select('id, titulo, tipo_tarea, prioridad, estado, fecha_vencimiento, oportunidad_id, creado_en')
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
      .limit(100);
    if (estado !== 'todas') q = q.eq('estado', estado);

    const { data, error } = await q;
    if (error) errorMsg = error.message;
    filas = data || [];
  } catch (e: any) {
    errorMsg = e?.message || 'No se pudieron cargar las tareas.';
  }

  const ahora = Date.now();
  const filtros = [
    { key: 'pendiente', label: 'Pendientes' },
    { key: 'completada', label: 'Completadas' },
    { key: 'todas', label: 'Todas' }
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Tareas</h1>

      <div className="flex gap-2">
        {filtros.map((f) => (
          <Link
            key={f.key}
            href={`/leadcenter/tareas?estado=${f.key}`}
            className={`rounded-xl px-3 py-1.5 text-sm font-medium ${
              estado === f.key ? 'bg-blue-600 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {errorMsg && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMsg}
        </p>
      )}

      <div className="space-y-2">
        {filas.length === 0 && !errorMsg && (
          <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
            No hay tareas para este filtro.
          </p>
        )}
        {filas.map((t) => {
          const vencida =
            t.estado === 'pendiente' &&
            t.fecha_vencimiento &&
            new Date(t.fecha_vencimiento).getTime() < ahora;
          return (
            <Link
              key={t.id}
              href={t.oportunidad_id ? `/leadcenter/oportunidades/${t.oportunidad_id}` : '#'}
              className="block rounded-2xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{t.titulo || 'Tarea'}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t.tipo_tarea || '—'} · {t.estado}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${
                    PRIORIDAD_BADGE[t.prioridad] || 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {t.prioridad || '—'}
                </span>
              </div>
              <p className={`mt-2 text-xs ${vencida ? 'font-semibold text-red-600' : 'text-gray-500'}`}>
                {vencida ? 'Vencida · ' : ''}
                Vence: {fecha(t.fecha_vencimiento)}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
