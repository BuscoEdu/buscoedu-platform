'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DataTable, { type DataTableColumn } from '@/components/admin/DataTable';
import FormField from '@/components/admin/FormField';
import FormSelect from '@/components/admin/FormSelect';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import SuccessToast from '@/components/admin/SuccessToast';
import ErrorToast from '@/components/admin/ErrorToast';
import { getSupabaseClient } from '@/src/lib/supabase';
import { ESTADOS_PUBLICACION_OPTIONS } from '@/src/lib/admin/constants';
import type { SelectOption } from '@/src/lib/admin/types';

type UniversidadRow = {
  id: string;
  nombre_oficial: string;
  sigla: string | null;
  pais_id: string | null;
  estado_alianza: string | null;
  estado_publicacion: string | null;
  activo: boolean;
};

const PAGE_SIZE = 20;

export default function AdminUniversidadesPage() {
  const router = useRouter();
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [rows, setRows] = useState<UniversidadRow[]>([]);
  const [countriesMap, setCountriesMap] = useState<Record<string, string>>({});
  const [estadoOptions, setEstadoOptions] = useState<SelectOption[]>(ESTADOS_PUBLICACION_OPTIONS);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [estadoPublicacion, setEstadoPublicacion] = useState('');
  const [activoFilter, setActivoFilter] = useState('');
  const [sortBy, setSortBy] = useState('nombre_oficial');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isLoading, setIsLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!supabase) return;

    async function loadCatalogs() {
      const [countriesRes, stateRes] = await Promise.all([
        supabase.from('paises').select('id, nombre').order('nombre', { ascending: true }),
        supabase.from('universidades').select('estado_publicacion').limit(500)
      ]);

      if (!countriesRes.error) {
        const map = (countriesRes.data || []).reduce<Record<string, string>>((acc, item) => {
          acc[item.id] = item.nombre || 'Sin nombre';
          return acc;
        }, {});
        setCountriesMap(map);
      }

      if (!stateRes.error) {
        const dynamic = Array.from(new Set((stateRes.data || []).map((r) => r.estado_publicacion || '')))
          .filter(Boolean)
          .map((value) => ({ value, label: value.replaceAll('_', ' ') }));

        const merged = new Map<string, SelectOption>();
        [...ESTADOS_PUBLICACION_OPTIONS, ...dynamic].forEach((option) => merged.set(option.value, option));
        setEstadoOptions(Array.from(merged.values()));
      }
    }

    loadCatalogs();
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    async function loadRows() {
      setIsLoading(true);

      let query = supabase
        .from('universidades')
        .select('id, nombre_oficial, sigla, pais_id, estado_alianza, estado_publicacion, activo', {
          count: 'exact'
        });

      if (search.trim()) {
        query = query.ilike('nombre_oficial', `%${search.trim()}%`);
      }

      if (estadoPublicacion) {
        query = query.eq('estado_publicacion', estadoPublicacion);
      }

      if (activoFilter) {
        query = query.eq('activo', activoFilter === 'true');
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query
        .order(sortBy, { ascending: sortDirection === 'asc' })
        .range(from, to);

      if (error) {
        setErrorMessage(error.message || 'No fue posible cargar universidades.');
        setRows([]);
        setTotal(0);
      } else {
        setRows((data || []) as UniversidadRow[]);
        setTotal(count || 0);
      }

      setIsLoading(false);
    }

    loadRows();
  }, [supabase, page, search, estadoPublicacion, activoFilter, sortBy, sortDirection]);

  async function toggleActivo(row: UniversidadRow) {
    if (!supabase) return;

    const { error } = await supabase.from('universidades').update({ activo: !row.activo }).eq('id', row.id);

    if (error) {
      setErrorMessage(error.message || 'No fue posible actualizar el estado activo.');
      return;
    }

    setSuccessMessage(`Universidad ${!row.activo ? 'activada' : 'desactivada'} correctamente.`);
    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, activo: !item.activo } : item)));
  }

  const columns: Array<DataTableColumn<UniversidadRow>> = [
    {
      key: 'nombre_oficial',
      label: 'Nombre oficial',
      sortable: true,
      render: (row) => <span className="font-medium">{row.nombre_oficial}</span>
    },
    {
      key: 'sigla',
      label: 'Sigla',
      sortable: true,
      render: (row) => row.sigla || '—'
    },
    {
      key: 'pais',
      label: 'País',
      render: (row) => (row.pais_id ? countriesMap[row.pais_id] || 'Sin país' : '—')
    },
    {
      key: 'estado_alianza',
      label: 'Estado alianza',
      sortable: true,
      render: (row) => row.estado_alianza || '—'
    },
    {
      key: 'estado_publicacion',
      label: 'Estado publicación',
      sortable: true,
      render: (row) => row.estado_publicacion || '—'
    },
    {
      key: 'activo',
      label: 'Activo',
      sortable: true,
      render: (row) => (
        <span className={`rounded-full px-2 py-1 text-xs ${row.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-700'}`}>
          {row.activo ? 'Sí' : 'No'}
        </span>
      )
    },
    {
      key: 'acciones',
      label: 'Acciones',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-buscoedu-border bg-white px-2.5 py-1 text-xs font-medium"
            onClick={() => router.push(`/admin/universidades/${row.id}`)}
          >
            Editar
          </button>
          <button
            type="button"
            className="rounded-md bg-buscoedu-teal px-2.5 py-1 text-xs font-semibold text-white"
            onClick={() => toggleActivo(row)}
          >
            {row.activo ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      )
    }
  ];

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-buscoedu-blue">Universidades</h1>
          <p className="text-sm text-buscoedu-muted">Administra las instituciones aliadas y su estado de publicación.</p>
        </div>
        <Link
          href="/admin/universidades/nueva"
          className="inline-flex items-center justify-center rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
        >
          Nueva Universidad
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:grid-cols-3">
        <FormField
          label="Buscar por nombre"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Escribe el nombre oficial..."
        />

        <FormSelect
          label="Estado publicación"
          value={estadoPublicacion}
          options={estadoOptions}
          onChange={(value) => {
            setEstadoPublicacion(value);
            setPage(1);
          }}
          placeholder="Todos"
          searchable={false}
        />

        <FormSelect
          label="Activo"
          value={activoFilter}
          options={[
            { value: 'true', label: 'Activas' },
            { value: 'false', label: 'Inactivas' }
          ]}
          onChange={(value) => {
            setActivoFilter(value);
            setPage(1);
          }}
          placeholder="Todos"
          searchable={false}
        />
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
          <LoadingSpinner text="Cargando universidades..." />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(row) => row.id}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSortChange={(newSortBy, direction) => {
            setSortBy(newSortBy);
            setSortDirection(direction);
          }}
          isLoading={isLoading}
          emptyMessage="No se encontraron universidades con los filtros aplicados."
        />
      )}

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
