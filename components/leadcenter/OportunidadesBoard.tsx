'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

const TEMP_BADGE: Record<string, string> = {
  frio: 'bg-sky-100 text-sky-700',
  tibio: 'bg-amber-100 text-amber-700',
  caliente: 'bg-orange-100 text-orange-700',
  muy_caliente: 'bg-red-100 text-red-700'
};

type Option = { id: string; nombre: string };

type Item = {
  id: string;
  estado: string;
  temperatura: string;
  puntaje: number;
  fecha_proxima_accion?: string | null;
  actualizado_en?: string | null;
  etapa: string;
  persona: { id?: string; nombre_completo: string };
  universidad: { id?: string; nombre: string };
  programa: { id?: string; nombre: string };
  oferta: { id?: string; nombre: string };
};

interface ApiResponse {
  ok: boolean;
  items: Item[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
  error?: string;
}

function fecha(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO');
}

export default function OportunidadesBoard({ etapas }: { etapas: Option[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(searchParams.get('q') || '');
  const [etapa, setEtapa] = useState(searchParams.get('etapa') || '');
  const [temp, setTemp] = useState(searchParams.get('temp') || '');
  const [estado, setEstado] = useState(searchParams.get('estado') || '');
  const [limit, setLimit] = useState<number>(Number(searchParams.get('limit') || 20));

  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const paramsString = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (etapa) p.set('etapa', etapa);
    if (temp) p.set('temp', temp);
    if (estado) p.set('estado', estado);
    p.set('limit', String(limit));
    return p.toString();
  }, [q, etapa, temp, estado, limit]);

  const syncUrl = useCallback(
    (extra?: Record<string, string>) => {
      const p = new URLSearchParams(paramsString);
      if (extra) {
        Object.entries(extra).forEach(([k, v]) => {
          if (!v) p.delete(k);
          else p.set(k, v);
        });
      }
      router.replace(`${pathname}?${p.toString()}`);
    },
    [paramsString, pathname, router]
  );

  const fetchData = useCallback(
    async (offset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setErrorMsg('');
      try {
        const res = await fetch(`/api/leadcenter/oportunidades?${paramsString}&offset=${offset}`, {
          cache: 'no-store'
        });
        const data: ApiResponse = await res.json();
        if (!data.ok) {
          setErrorMsg(data.error || 'No se pudo cargar oportunidades.');
          return;
        }

        setTotal(data.total || 0);
        setHasMore(Boolean(data.hasMore));
        setItems((prev) => (append ? [...prev, ...(data.items || [])] : data.items || []));
      } catch {
        setErrorMsg('Error de red cargando oportunidades.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [paramsString]
  );

  useEffect(() => {
    void fetchData(0, false);
  }, [fetchData]);

  const aplicarFiltros = (e: React.FormEvent) => {
    e.preventDefault();
    syncUrl({ offset: '' });
    void fetchData(0, false);
  };

  const cambiarLimite = (nuevo: number) => {
    setLimit(nuevo);
    const p = new URLSearchParams(searchParams.toString());
    p.set('limit', String(nuevo));
    ['offset'].forEach((k) => p.delete(k));
    router.replace(`${pathname}?${p.toString()}`);
  };

  const mostrarMas = async () => {
    await fetchData(items.length, true);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Oportunidades</h1>
        <span className="text-sm text-gray-500">{total} en total</span>
      </div>

      <form onSubmit={aplicarFiltros} className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por oportunidad…"
          className="min-w-[160px] flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={etapa}
          onChange={(e) => setEtapa(e.target.value)}
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
          value={temp}
          onChange={(e) => setTemp(e.target.value)}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Toda temperatura</option>
          <option value="frio">Frío</option>
          <option value="tibio">Tibio</option>
          <option value="caliente">Caliente</option>
          <option value="muy_caliente">Muy caliente</option>
        </select>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Estados activos</option>
          <option value="activa">Activa</option>
          <option value="pausada">Pausada</option>
          <option value="ganada">Ganada</option>
          <option value="perdida">Perdida</option>
          <option value="archivada">Archivada</option>
        </select>
        <button className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
          Filtrar
        </button>
      </form>

      {errorMsg && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMsg}</p>
      )}

      <div className="space-y-2">
        {loading && <p className="text-sm text-gray-500">Cargando oportunidades...</p>}
        {!loading && items.length === 0 && !errorMsg && (
          <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
            No hay oportunidades con estos filtros.
          </p>
        )}
        {items.map((o) => (
          <Link
            key={o.id}
            href={`/leadcenter/oportunidades/${o.id}`}
            className="block rounded-2xl border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="truncate font-semibold text-gray-900">{o.persona.nombre_completo}</p>
                <p className="truncate text-xs text-gray-500">{o.universidad.nombre}</p>
                <p className="truncate text-xs text-gray-500">
                  {o.programa.nombre} · {o.oferta.nombre}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {o.etapa} · {o.estado}
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
              <span>Próx. acción: {fecha(o.fecha_proxima_accion)}</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="text-xs text-gray-500">Mostrando {items.length} de {total}</div>

        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600">Tamaño de bloque</label>
          <div className="inline-flex overflow-hidden rounded-xl border border-gray-200">
            {[20, 50, 100].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => cambiarLimite(n)}
                className={`px-3 py-1.5 text-xs font-semibold ${
                  limit === n ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={mostrarMas}
          disabled={loadingMore}
          className="w-full rounded-xl border border-gray-300 bg-white py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          {loadingMore ? 'Cargando más…' : 'Mostrar más'}
        </button>
      )}
    </div>
  );
}
