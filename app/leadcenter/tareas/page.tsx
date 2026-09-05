import Link from 'next/link';
import { getServerSupabase } from '@/src/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface SearchParams { estado?: string; vista?: string; }

function fecha(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

type Radar = { label: string; className: string; sort: number };
function radar(t: any, now: number): Radar {
  const due = t.fecha_vencimiento ? new Date(t.fecha_vencimiento).getTime() : Number.MAX_SAFE_INTEGER;
  const diffHours = (due - now) / 3_600_000;
  if (t.estado === 'completada') return { label: diffHours >= 0 ? 'Realizada a tiempo' : 'Realizada fuera de tiempo', className: diffHours >= 0 ? 'bg-blue-500' : 'bg-purple-500', sort: due };
  if (diffHours < -48) return { label: 'Vencida hace más de 48 horas', className: 'bg-gray-950', sort: due };
  if (diffHours < 0) return { label: 'Vencida hace menos de 48 horas', className: 'bg-red-500', sort: due };
  if (diffHours <= 24) return { label: 'Vence en las próximas 24 horas', className: 'bg-amber-400', sort: due };
  return { label: 'En tiempo', className: 'bg-emerald-500', sort: due };
}

export default async function TareasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const estado = sp.estado || 'pendiente';
  const vista = sp.vista || 'radar';
  let filas: any[] = [];
  let errorMsg = '';

  try {
    const supabase = await getServerSupabase();
    let q = supabase.from('tareas_crm').select('id, titulo, tipo_tarea, prioridad, estado, fecha_vencimiento, oportunidad_id, creado_en').order('fecha_vencimiento', { ascending: true, nullsFirst: false }).limit(250);
    if (estado !== 'todas') q = q.eq('estado', estado);
    const { data, error } = await q;
    if (error) errorMsg = error.message;
    filas = data || [];
  } catch (e: any) { errorMsg = e?.message || 'No se pudieron cargar las tareas.'; }

  const ahora = Date.now();
  const ordenadas = filas.map((t) => ({ ...t, radar: radar(t, ahora) })).sort((a, b) => a.radar.sort - b.radar.sort);
  const resumen = {
    pendientes: filas.filter((t) => t.estado === 'pendiente').length,
    vencidas: ordenadas.filter((t) => t.estado !== 'completada' && (t.radar.className.includes('red') || t.radar.className.includes('gray'))).length,
    proximas: ordenadas.filter((t) => t.estado !== 'completada' && t.radar.className.includes('amber')).length,
    completadas: filas.filter((t) => t.estado === 'completada').length
  };
  const filtros = [{ key: 'pendiente', label: 'Pendientes' }, { key: 'completada', label: 'Completadas' }, { key: 'todas', label: 'Todas' }];
  const href = (next: Record<string, string>) => `/leadcenter/tareas?${new URLSearchParams({ estado, vista, ...next }).toString()}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold text-gray-900">Tareas</h1><p className="mt-1 text-sm text-gray-500">Prioriza el trabajo por vencimiento y conserva una vista detallada para operar.</p></div><div className="flex rounded-xl border border-gray-200 bg-white p-1"><Link href={href({ vista: 'radar' })} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${vista === 'radar' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}>Radar</Link><Link href={href({ vista: 'detalle' })} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${vista === 'detalle' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}>Detalle</Link></div></div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumen de tareas">
        {[['Pendientes', resumen.pendientes, 'bg-blue-50 text-blue-700'], ['Vencidas', resumen.vencidas, 'bg-red-50 text-red-700'], ['Próximas 24 h', resumen.proximas, 'bg-amber-50 text-amber-700'], ['Completadas', resumen.completadas, 'bg-emerald-50 text-emerald-700']].map(([label, value, tone]) => <div key={String(label)} className="rounded-2xl border border-gray-200 bg-white p-4"><span className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-bold ${tone}`}>{value}</span><p className="mt-2 text-sm text-gray-600">{label}</p></div>)}
      </section>

      <div className="flex flex-wrap gap-2">{filtros.map((f) => <Link key={f.key} href={href({ estado: f.key })} className={`rounded-xl px-3 py-1.5 text-sm font-medium ${estado === f.key ? 'bg-blue-600 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{f.label}</Link>)}</div>
      {errorMsg && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p>}
      {!errorMsg && filas.length === 0 && <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">No hay tareas para este filtro.</p>}

      {!errorMsg && filas.length > 0 && vista === 'radar' && <section className="rounded-2xl border border-gray-200 bg-white p-4"><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold text-gray-900">Radar de vencimiento</h2><p className="text-xs text-gray-500">De la más vencida a la que tiene más tiempo.</p></div><div className="grid grid-cols-[repeat(auto-fill,minmax(18px,1fr))] gap-1.5" aria-label="Cuadrícula de estado de tareas">{ordenadas.map((t) => <Link key={t.id} href={t.oportunidad_id ? `/leadcenter/oportunidades/${t.oportunidad_id}` : '#'} title={`${t.titulo || 'Tarea'} — ${t.radar.label}`} aria-label={`${t.titulo || 'Tarea'} — ${t.radar.label}`} className="flex h-7 w-7 items-center justify-center rounded border border-gray-100 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"><span className={`h-3.5 w-3.5 rounded-full ${t.radar.className}`} /></Link>)}</div><div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-600"><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Verde: en tiempo</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" />Amarillo: vence &lt;24 h</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-red-500" />Rojo: vencida ≤48 h</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-gray-950" />Negro: vencida &gt;48 h</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-blue-500" />Azul: realizada a tiempo</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-purple-500" />Morado: realizada tarde</span></div></section>}

      {!errorMsg && filas.length > 0 && vista === 'detalle' && <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{ordenadas.map((t) => <Link key={t.id} href={t.oportunidad_id ? `/leadcenter/oportunidades/${t.oportunidad_id}` : '#'} className="rounded-2xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm"><p className="text-xs font-semibold text-blue-600">{t.oportunidad_id ? `OP-${t.oportunidad_id.slice(0, 8).toUpperCase()}` : 'SIN OPORTUNIDAD'}</p><p className="mt-1 truncate font-medium text-gray-900">{t.titulo || 'Tarea sin título'}</p><p className="mt-1 text-sm text-gray-600">{t.estado} · {fecha(t.fecha_vencimiento)}</p><p className="mt-3 text-xs text-gray-500">{t.radar.label}</p></Link>)}</section>}
    </div>
  );
}
