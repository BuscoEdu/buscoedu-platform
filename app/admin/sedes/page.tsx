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
import type { SelectOption } from '@/src/lib/admin/types';

type SedeRow = {
  id: string;
  universidad_id: string | null;
  ciudad_id: string | null;
  nombre: string;
  tipo: string | null;
  estado_publicacion: string | null;
  activo: boolean;
};

const PAGE_SIZE = 20;

export default function AdminSedesPage() {
  const router = useRouter();
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [rows, setRows] = useState<SedeRow[]>([]);
  const [universidadesMap, setUniversidadesMap] = useState<Record<string, string>>({});
  const [ciudadesMap, setCiudadesMap] = useState<Record<string, string>>({});
  const [universidadesOptions, setUniversidadesOptions] = useState<SelectOption[]>([]);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [universidadFilter, setUniversidadFilter] = useState('');
  const [sortBy, setSortBy] = useState('nombre');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isLoading, setIsLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!supabase) return;

    async function loadCatalogs() {
      const [universidadesRes, ciudadesRes] = await Promise.all([
        supabase.from('universidades').select('id, nombre_oficial').order('nombre_oficial', { ascending: true }),
        supabase.from('ciudades').select('id, nombre').order('nombre', { ascending: true })
      ]);

      if (!universidadesRes.error) {
        const options = (universidadesRes.data || []).map((item) => ({
          value: item.id,
          label: item.nombre_oficial || 'Sin nombre'
        }));
        setUniversidadesOptions(options);
        setUniversidadesMap(
          options.reduce<Record<string, string>>((acc, item) => {
            acc[item.value] = item.label;
            return acc;
          }, {})
        );
      }

      if (!ciudadesRes.error) {
        setCiudadesMap(
          (ciudadesRes.data || []).reduce<Record<string, string>>((acc, item) => {
            acc[item.id] = item.nombre || 'Sin nombre';
            return acc;
          }, {})
        );
      }
    }

    loadCatalogs();
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    async function loadRows() {
      setIsLoading(true);
      let query = supabase
        .from('sedes')
        .select('id, universidad_id, ciudad_id, nombre, tipo, estado_publicacion, activo', { count: 'exact' });

      if (search.trim()) {
        query = query.ilike('nombre', `%${search.trim()}%`);
      }

      if (universidadFilter) {
        query = query.eq('universidad_id', universidadFilter);
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query
        .order(sortBy, { ascending: sortDirection === 'asc' })
        .range(from, to);

      if (error) {
        setErrorMessage(error.message || 'No fue posible cargar sedes.');
        setRows([]);
        setTotal(0);
      } else {
        setRows((data || []) as SedeRow[]);
        setTotal(count || 0);
      }

      setIsLoading(false);
    }

    loadRows();
  }, [supabase, page, search, universidadFilter, sortBy, sortDirection]);

  async function toggleActivo(row: SedeRow) {
    if (!supabase) return;

    const { error } = await supabase.from('sedes').update({ activo: !row.activo }).eq('id', row.id);

    if (error) {
      setErrorMessage(error.message || 'No fue posible actualizar el estado de la sede.');
      return;
    }

    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, activo: !item.activo } : item)));
    setSuccessMessage(`Sede ${!row.activo ? 'activada' : 'desactivada'} correctamente.`);
  }

  const columns: Array<DataTableColumn<SedeRow>> = [
    {
      key: 'nombre',
      label: 'Nombre',
      sortable: true,
      render: (row) => <span className="font-medium">{row.nombre}</span>
    },
    {
      key: 'universidad',
      label: 'Universidad',
      render: (row) => (row.universidad_id ? universidadesMap[row.universidad_id] || '—' : '—')
    },
    {
      key: 'ciudad',
      label: 'Ciudad',
      render: (row) => (row.ciudad_id ? ciudadesMap[row.ciudad_id] || '—' : '—')
    },
    {
      key: 'tipo',
      label: 'Tipo',
      sortable: true,
      render: (row) => row.tipo || '—'
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
            onClick={() => router.push(`/admin/sedes/${row.id}`)}
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
          <h1 className="text-2xl font-bold text-buscoedu-blue">Sedes</h1>
          <p className="text-sm text-buscoedu-muted">Gestiona las sedes y su estado dentro del catálogo público.</p>
        </div>

        <Link
          href="/admin/sedes/nueva"
          className="inline-flex items-center justify-center rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
        >
          Nueva Sede
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:grid-cols-2">
        <FormField
          label="Buscar por nombre"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Escribe el nombre de la sede..."
        />

        <FormSelect
          label="Filtrar por universidad"
          value={universidadFilter}
          options={universidadesOptions}
          onChange={(value) => {
            setUniversidadFilter(value);
            setPage(1);
          }}
          placeholder="Todas las universidades"
        />
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
          <LoadingSpinner text="Cargando sedes..." />
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
          emptyMessage="No se encontraron sedes con los filtros aplicados."
        />
      )}

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
