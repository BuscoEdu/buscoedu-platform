import Link from 'next/link';
import { getServerSupabase } from '@/src/lib/supabase-server';

export const dynamic = 'force-dynamic';

const PAGINA_TAM = 20;

const TEMP_BADGE: Record<string, string> = {
  frio: 'bg-sky-100 text-sky-700',
  tibio: 'bg-amber-100 text-amber-700',
  caliente: 'bg-orange-100 text-orange-700',
  muy_caliente: 'bg-red-100 text-red-700'
};

interface SearchParams {
  etapa?: string;
  estado?: string;
  temp?: string;
  q?: string;
  page?: string;
}

export default async function OportunidadesPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const pagina = Math.max(1, parseInt(sp.page || '1', 10) || 1);
  const desde = (pagina - 1) * PAGINA_TAM;
  const hasta = desde + PAGINA_TAM - 1;

  let etapas: any[] = [];
  let filas: any[] = [];
  let total = 0;
  let errorMsg = '';

  try {
    const supabase = await getServerSupabase();

    const { data: et } = await supabase
      .from('etapas_embudo')
      .select('id, nombre, orden')
      .order('orden');
    etapas = et || [];

    let q = supabase
      .from('oportunidades')
      .select(
        'id, nombre, estado, temperatura, puntaje, fecha_proxima_accion, etapa_id, persona_id, universidad_id, actualizado_en',
        { count: 'exact' }
      );

    if (sp.etapa) q = q.eq('etapa_id', sp.etapa);
    if (sp.estado) q = q.eq('estado', sp.estado);
    else q = q.neq('estado', 'archivada');
    if (sp.temp) q = q.eq('temperatura', sp.temp);
    if (sp.q) q = q.ilike('nombre', `%${sp.q}%`);

    q = q.order('actualizado_en', { ascending: false }).range(desde, hasta);

    const { data, count, error } = await q;
    if (error) errorMsg = error.message;
    filas = data || [];
    total = count ?? 0;
  } catch (e: any) {
    errorMsg = e?.message || 'No se pudo cargar el pipeline.';
  }

  const totalPaginas = Math.max(1, Math.ceil(total / PAGINA_TAM));
  const nombreEtapa = (id: string) => etapas.find((e) => e.id === id)?.nombre || '—';

  const qs = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const base = { etapa: sp.etapa, estado: sp.estado, temp: sp.temp, q: sp.q, ...extra };
    Object.entries(base).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    return `?${params.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Oportunidades</h1>
        <span className="text-sm text-gray-500">{total} en total</span>
      </div>

      {/* Filtros */}
      <form className="flex flex-wrap gap-2" action="/leadcenter/oportunidades" method="get">
        <input
          name="q"
          defaultValue={sp.q || ''}
          placeholder="Buscar por nombre…"
          className="min-w-[160px] flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
        />
        <select
          name="etapa"
          defaultValue={sp.etapa || ''}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Todas las etapas</option>
          {etapas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
        <select
          name="temp"
          defaultValue={sp.temp || ''}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Toda temperatura</option>
          <option value="frio">Frío</option>
          <option value="tibio">Tibio</option>
          <option value="caliente">Caliente</option>
          <option value="muy_caliente">Muy caliente</option>
        </select>
        <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          Filtrar
        </button>
      </form>

      {errorMsg && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMsg}
        </p>
      )}

      {/* Lista */}
      <div className="space-y-2">
        {filas.length === 0 && !errorMsg && (
          <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
            No hay oportunidades con estos filtros.
          </p>
        )}
        {filas.map((o) => (
          <Link
            key={o.id}
            href={`/leadcenter/oportunidades/${o.id}`}
            className="block rounded-2xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">{o.nombre || 'Oportunidad'}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {nombreEtapa(o.etapa_id)} · {o.estado}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${
                  TEMP_BADGE[o.temperatura] || 'bg-gray-100 text-gray-600'
                }`}
              >
                {(o.temperatura || '—').replace('_', ' ')}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
              <span>Puntaje: {o.puntaje ?? 0}</span>
              {o.fecha_proxima_accion && (
                <span>Próx. acción: {new Date(o.fecha_proxima_accion).toLocaleDateString('es-CO')}</span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div className="flex items-center justify-between">
          <Link
            href={qs({ page: String(Math.max(1, pagina - 1)) })}
            className={`rounded-xl border px-4 py-2 text-sm ${
              pagina <= 1 ? 'pointer-events-none opacity-40' : 'hover:bg-gray-50'
            }`}
          >
            ← Anterior
          </Link>
          <span className="text-sm text-gray-500">
            Página {pagina} de {totalPaginas}
          </span>
          <Link
            href={qs({ page: String(Math.min(totalPaginas, pagina + 1)) })}
            className={`rounded-xl border px-4 py-2 text-sm ${
              pagina >= totalPaginas ? 'pointer-events-none opacity-40' : 'hover:bg-gray-50'
            }`}
          >
            Siguiente →
          </Link>
        </div>
      )}
    </div>
  );
}
