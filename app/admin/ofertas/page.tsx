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
import CajaAyuda from '@/components/admin/CajaAyuda';

type OfertaRow = {
  id: string;
  nombre_oferta: string;
  programa_id: string | null;
  universidad_id: string | null;
  tipo_beneficio: string | null;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  estado_publicacion: string | null;
  activo: boolean;
};

const PAGE_SIZE = 20;
const TODAY = new Date().toISOString().slice(0, 10);

const VIGENCIA_OPTIONS: SelectOption[] = [
  { value: 'vigente', label: 'Vigente' },
  { value: 'futura', label: 'Futura' },
  { value: 'vencida', label: 'Vencida' }
];

function formatVigencia(desde: string | null, hasta: string | null) {
  if (!desde && !hasta) return '—';
  return `${desde || '—'} a ${hasta || '—'}`;
}

export default function AdminOfertasPage() {
  const router = useRouter();
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [rows, setRows] = useState<OfertaRow[]>([]);
  const [programasMap, setProgramasMap] = useState<Record<string, string>>({});
  const [universidadesMap, setUniversidadesMap] = useState<Record<string, string>>({});
  const [universidadesOptions, setUniversidadesOptions] = useState<SelectOption[]>([]);
  const [estadoOptions, setEstadoOptions] = useState<SelectOption[]>(ESTADOS_PUBLICACION_OPTIONS);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [universidadFilter, setUniversidadFilter] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [vigenciaFilter, setVigenciaFilter] = useState('');
  const [sortBy, setSortBy] = useState('nombre_oferta');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isLoading, setIsLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!supabase) return;

    async function loadCatalogs() {
      const [programasRes, universidadesRes, estadosRes] = await Promise.all([
        supabase.from('programas_academicos').select('id, nombre_oficial').order('nombre_oficial', { ascending: true }),
        supabase.from('universidades').select('id, nombre_oficial').order('nombre_oficial', { ascending: true }),
        supabase.from('ofertas_academicas').select('estado_publicacion').limit(500)
      ]);

      if (!programasRes.error) {
        setProgramasMap(
          (programasRes.data || []).reduce<Record<string, string>>((acc, item) => {
            acc[item.id] = item.nombre_oficial || 'Sin nombre';
            return acc;
          }, {})
        );
      }

      if (!universidadesRes.error) {
        const options = (universidadesRes.data || []).map((item) => ({
          value: item.id,
          label: item.nombre_oficial || 'Sin nombre'
        }));

        setUniversidadesMap(
          options.reduce<Record<string, string>>((acc, item) => {
            acc[item.value] = item.label;
            return acc;
          }, {})
        );
        setUniversidadesOptions(options);
      }

      if (!estadosRes.error) {
        const dynamic = Array.from(new Set((estadosRes.data || []).map((item) => item.estado_publicacion || '')))
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
        .from('ofertas_academicas')
        .select(
          'id, nombre_oferta, programa_id, universidad_id, tipo_beneficio, vigente_desde, vigente_hasta, estado_publicacion, activo',
          { count: 'exact' }
        );

      if (search.trim()) {
        query = query.ilike('nombre_oferta', `%${search.trim()}%`);
      }

      if (universidadFilter) {
        query = query.eq('universidad_id', universidadFilter);
      }

      if (estadoFilter) {
        query = query.eq('estado_publicacion', estadoFilter);
      }

      if (vigenciaFilter === 'vigente') {
        query = query.lte('vigente_desde', TODAY).gte('vigente_hasta', TODAY);
      } else if (vigenciaFilter === 'futura') {
        query = query.gt('vigente_desde', TODAY);
      } else if (vigenciaFilter === 'vencida') {
        query = query.lt('vigente_hasta', TODAY);
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query
        .order(sortBy, { ascending: sortDirection === 'asc' })
        .range(from, to);

      if (error) {
        setErrorMessage(error.message || 'No fue posible cargar ofertas académicas.');
        setRows([]);
        setTotal(0);
      } else {
        setRows((data || []) as OfertaRow[]);
        setTotal(count || 0);
      }

      setIsLoading(false);
    }

    loadRows();
  }, [supabase, page, search, universidadFilter, estadoFilter, vigenciaFilter, sortBy, sortDirection]);

  async function toggleActivo(row: OfertaRow) {
    if (!supabase) return;

    const { error } = await supabase.from('ofertas_academicas').update({ activo: !row.activo }).eq('id', row.id);

    if (error) {
      setErrorMessage(error.message || 'No fue posible actualizar el estado de la oferta.');
      return;
    }

    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, activo: !item.activo } : item)));
    setSuccessMessage(`Oferta ${!row.activo ? 'activada' : 'desactivada'} correctamente.`);
  }

  const columns: Array<DataTableColumn<OfertaRow>> = [
    {
      key: 'nombre_oferta',
      label: 'Nombre oferta',
      sortable: true,
      render: (row) => <span className="font-medium">{row.nombre_oferta}</span>
    },
    {
      key: 'programa',
      label: 'Programa',
      render: (row) => (row.programa_id ? programasMap[row.programa_id] || '—' : '—')
    },
    {
      key: 'universidad',
      label: 'Universidad',
      render: (row) => (row.universidad_id ? universidadesMap[row.universidad_id] || '—' : '—')
    },
    {
      key: 'tipo_beneficio',
      label: 'Tipo beneficio',
      render: (row) => row.tipo_beneficio || '—'
    },
    {
      key: 'vigencia',
      label: 'Vigencia',
      render: (row) => formatVigencia(row.vigente_desde, row.vigente_hasta)
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
            onClick={() => router.push(`/admin/ofertas/${row.id}`)}
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
      <CajaAyuda titulo="Ofertas académicas">
        <p>
          Una oferta es una combinación específica de programa + precio + beneficio +
          periodo. Es lo que el usuario ve en la página de exploración. Para que
          aparezca en el portal público, la oferta debe estar en estado
          &quot;publicada&quot; y activa.
        </p>
      </CajaAyuda>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-buscoedu-blue">Ofertas Académicas</h1>
          <p className="text-sm text-buscoedu-muted">Administra ofertas comerciales, vigencias y estados de publicación.</p>
        </div>

        <Link
          href="/admin/ofertas/nueva"
          className="inline-flex items-center justify-center rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
        >
          Nueva Oferta
        </Link>
        <Link
          href="/admin/cargas-catalogo"
          className="inline-flex items-center justify-center rounded-lg border border-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-buscoedu-blue transition hover:bg-buscoedu-bg"
        >
          Carga masiva
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:grid-cols-2 xl:grid-cols-4">
        <FormField
          label="Buscar por nombre"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Escribe el nombre de la oferta..."
        />

        <FormSelect
          label="Universidad"
          value={universidadFilter}
          options={universidadesOptions}
          onChange={(value) => {
            setUniversidadFilter(value);
            setPage(1);
          }}
          placeholder="Todas"
        />

        <FormSelect
          label="Estado publicación"
          value={estadoFilter}
          options={estadoOptions}
          onChange={(value) => {
            setEstadoFilter(value);
            setPage(1);
          }}
          placeholder="Todos"
          searchable={false}
        />

        <FormSelect
          label="Vigencia"
          value={vigenciaFilter}
          options={VIGENCIA_OPTIONS}
          onChange={(value) => {
            setVigenciaFilter(value);
            setPage(1);
          }}
          placeholder="Todas"
          searchable={false}
        />
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
          <LoadingSpinner text="Cargando ofertas..." />
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
          emptyMessage="No se encontraron ofertas con los filtros aplicados."
        />
      )}

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
