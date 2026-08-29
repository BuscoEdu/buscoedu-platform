import Link from 'next/link';
import { getServerSupabase } from '@/src/lib/supabase-server';

export const dynamic = 'force-dynamic';

const PAGINA_TAM = 20;

interface SearchParams {
  q?: string;
  page?: string;
}

export default async function PersonasPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const pagina = Math.max(1, parseInt(sp.page || '1', 10) || 1);
  const desde = (pagina - 1) * PAGINA_TAM;
  const hasta = desde + PAGINA_TAM - 1;

  let filas: any[] = [];
  let total = 0;
  let errorMsg = '';

  try {
    const supabase = await getServerSupabase();
    let q = supabase
      .from('personas')
      .select(
        'id, nombres, apellidos, correo_principal, celular_e164, telefono_principal, telefono_verificado, estado_relacion, actualizado_en',
        { count: 'exact' }
      )
      .neq('estado', 'inactivo');

    if (sp.q) {
      q = q.or(
        `nombres.ilike.%${sp.q}%,apellidos.ilike.%${sp.q}%,correo_principal.ilike.%${sp.q}%,celular_e164.ilike.%${sp.q}%`
      );
    }
    q = q.order('actualizado_en', { ascending: false }).range(desde, hasta);

    const { data, count, error } = await q;
    if (error) errorMsg = error.message;
    filas = data || [];
    total = count ?? 0;
  } catch (e: any) {
    errorMsg = e?.message || 'No se pudieron cargar las personas.';
  }

  const totalPaginas = Math.max(1, Math.ceil(total / PAGINA_TAM));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Personas</h1>
        <span className="text-sm text-gray-500">{total} en total</span>
      </div>

      <form className="flex gap-2" action="/leadcenter/personas" method="get">
        <input
          name="q"
          defaultValue={sp.q || ''}
          placeholder="Buscar por nombre, correo o celular…"
          className="min-w-[160px] flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
        />
        <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          Buscar
        </button>
      </form>

      {errorMsg && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMsg}
        </p>
      )}

      <div className="space-y-2">
        {filas.length === 0 && !errorMsg && (
          <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
            No hay personas con estos filtros.
          </p>
        )}
        {filas.map((p) => (
          <Link
            key={p.id}
            href={`/leadcenter/personas/${p.id}`}
            className="block rounded-2xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">
                  {[p.nombres, p.apellidos].filter(Boolean).join(' ') || 'Sin nombre'}
                </p>
                <p className="mt-0.5 truncate text-xs text-gray-500">
                  {p.correo_principal || '—'} · {p.celular_e164 || p.telefono_principal || '—'}
                </p>
              </div>
              {p.telefono_verificado && (
                <span className="shrink-0 rounded-full bg-green-100 px-2 py-1 text-[11px] font-medium text-green-700">
                  Verificado
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between">
          <Link
            href={`?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(Math.max(1, pagina - 1)) }).toString()}`}
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
            href={`?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), page: String(Math.min(totalPaginas, pagina + 1)) }).toString()}`}
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
