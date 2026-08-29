'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import DataTable, { type DataTableColumn } from '@/components/admin/DataTable';
import FormField from '@/components/admin/FormField';
import FormSelect from '@/components/admin/FormSelect';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import ErrorToast from '@/components/admin/ErrorToast';
import Tabs from '@/components/admin/Tabs';
import StatusBadge from '@/components/admin/StatusBadge';
import { getSupabaseClient } from '@/src/lib/supabase';
import type { SelectOption } from '@/src/lib/admin/types';

type PeriodoAcademicoRow = {
  id: string;
  nombre: string;
  universidad_id: string | null;
  sede_id: string | null;
  tipo_periodicidad: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  estado: string | null;
  activo: boolean;
};

type PeriodoComercialRow = {
  id: string;
  nombre: string;
  descripcion: string | null;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  periodo_academico_objetivo_id: string | null;
  estado: string | null;
  activo: boolean;
};

const PAGE_SIZE = 20;
const TABS = [
  { id: 'academicos', label: 'Periodos Académicos' },
  { id: 'comerciales', label: 'Periodos Comerciales' }
];

const ACADEMICO_ESTADO_OPTIONS: SelectOption[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'en_curso', label: 'En curso' },
  { value: 'finalizado', label: 'Finalizado' },
  { value: 'cancelado', label: 'Cancelado' }
];

const COMERCIAL_ESTADO_OPTIONS: SelectOption[] = [
  { value: 'activo', label: 'Activo' },
  { value: 'finalizado', label: 'Finalizado' },
  { value: 'cancelado', label: 'Cancelado' }
];

export default function AdminPeriodosPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const tabFromQuery = searchParams.get('tab');
  const activeTab = tabFromQuery === 'comerciales' ? 'comerciales' : 'academicos';

  const [academicoRows, setAcademicoRows] = useState<PeriodoAcademicoRow[]>([]);
  const [comercialRows, setComercialRows] = useState<PeriodoComercialRow[]>([]);

  const [universidadOptions, setUniversidadOptions] = useState<SelectOption[]>([]);
  const [universidadMap, setUniversidadMap] = useState<Record<string, string>>({});
  const [sedeMap, setSedeMap] = useState<Record<string, string>>({});
  const [periodoAcademicoMap, setPeriodoAcademicoMap] = useState<Record<string, string>>({});

  const [academicoPage, setAcademicoPage] = useState(1);
  const [academicoTotal, setAcademicoTotal] = useState(0);
  const [academicoSearch, setAcademicoSearch] = useState('');
  const [academicoUniversidadFilter, setAcademicoUniversidadFilter] = useState('');
  const [academicoEstadoFilter, setAcademicoEstadoFilter] = useState('');
  const [academicoSortBy, setAcademicoSortBy] = useState('nombre');
  const [academicoSortDirection, setAcademicoSortDirection] = useState<'asc' | 'desc'>('asc');

  const [comercialPage, setComercialPage] = useState(1);
  const [comercialTotal, setComercialTotal] = useState(0);
  const [comercialSearch, setComercialSearch] = useState('');
  const [comercialEstadoFilter, setComercialEstadoFilter] = useState('');
  const [comercialSortBy, setComercialSortBy] = useState('nombre');
  const [comercialSortDirection, setComercialSortDirection] = useState<'asc' | 'desc'>('asc');

  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState(true);
  const [isLoadingRows, setIsLoadingRows] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!supabase) return;

    async function loadCatalogs() {
      setIsLoadingCatalogs(true);
      const [universidadesRes, sedesRes, periodosRes] = await Promise.all([
        supabase.from('universidades').select('id, nombre_oficial').order('nombre_oficial', { ascending: true }),
        supabase.from('sedes').select('id, nombre').order('nombre', { ascending: true }),
        supabase.from('periodos_academicos').select('id, nombre').order('nombre', { ascending: true })
      ]);

      if (!universidadesRes.error) {
        const options = (universidadesRes.data || []).map((item) => ({
          value: item.id,
          label: item.nombre_oficial || 'Universidad sin nombre'
        }));
        setUniversidadOptions(options);
        setUniversidadMap(
          options.reduce<Record<string, string>>((acc, option) => {
            acc[option.value] = option.label;
            return acc;
          }, {})
        );
      }

      if (!sedesRes.error) {
        setSedeMap(
          (sedesRes.data || []).reduce<Record<string, string>>((acc, item) => {
            acc[item.id] = item.nombre || 'Sede sin nombre';
            return acc;
          }, {})
        );
      }

      if (!periodosRes.error) {
        setPeriodoAcademicoMap(
          (periodosRes.data || []).reduce<Record<string, string>>((acc, item) => {
            acc[item.id] = item.nombre || 'Periodo sin nombre';
            return acc;
          }, {})
        );
      }

      setIsLoadingCatalogs(false);
    }

    loadCatalogs();
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    async function loadAcademicos() {
      setIsLoadingRows(true);

      let query = supabase
        .from('periodos_academicos')
        .select('id, nombre, universidad_id, sede_id, tipo_periodicidad, fecha_inicio, fecha_fin, estado, activo', {
          count: 'exact'
        });

      if (academicoSearch.trim()) {
        query = query.ilike('nombre', `%${academicoSearch.trim()}%`);
      }

      if (academicoUniversidadFilter) {
        query = query.eq('universidad_id', academicoUniversidadFilter);
      }

      if (academicoEstadoFilter) {
        query = query.eq('estado', academicoEstadoFilter);
      }

      const from = (academicoPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query
        .order(academicoSortBy, { ascending: academicoSortDirection === 'asc' })
        .range(from, to);

      if (error) {
        setErrorMessage(error.message || 'No fue posible cargar periodos académicos.');
        setAcademicoRows([]);
        setAcademicoTotal(0);
      } else {
        setAcademicoRows((data || []) as PeriodoAcademicoRow[]);
        setAcademicoTotal(count || 0);
      }

      setIsLoadingRows(false);
    }

    async function loadComerciales() {
      setIsLoadingRows(true);

      let query = supabase
        .from('periodos_comerciales')
        .select('id, nombre, descripcion, fecha_inicio, fecha_fin, periodo_academico_objetivo_id, estado, activo', {
          count: 'exact'
        });

      if (comercialSearch.trim()) {
        query = query.ilike('nombre', `%${comercialSearch.trim()}%`);
      }

      if (comercialEstadoFilter) {
        query = query.eq('estado', comercialEstadoFilter);
      }

      const from = (comercialPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query
        .order(comercialSortBy, { ascending: comercialSortDirection === 'asc' })
        .range(from, to);

      if (error) {
        setErrorMessage(error.message || 'No fue posible cargar periodos comerciales.');
        setComercialRows([]);
        setComercialTotal(0);
      } else {
        setComercialRows((data || []) as PeriodoComercialRow[]);
        setComercialTotal(count || 0);
      }

      setIsLoadingRows(false);
    }

    if (activeTab === 'academicos') {
      loadAcademicos();
      return;
    }

    loadComerciales();
  }, [
    supabase,
    activeTab,
    academicoPage,
    academicoSearch,
    academicoUniversidadFilter,
    academicoEstadoFilter,
    academicoSortBy,
    academicoSortDirection,
    comercialPage,
    comercialSearch,
    comercialEstadoFilter,
    comercialSortBy,
    comercialSortDirection
  ]);

  const academicoColumns: Array<DataTableColumn<PeriodoAcademicoRow>> = [
    { key: 'nombre', label: 'Nombre', sortable: true, render: (row) => <span className="font-medium">{row.nombre}</span> },
    {
      key: 'universidad',
      label: 'Universidad',
      render: (row) => (row.universidad_id ? universidadMap[row.universidad_id] || '—' : '—')
    },
    { key: 'sede', label: 'Sede', render: (row) => (row.sede_id ? sedeMap[row.sede_id] || '—' : '—') },
    {
      key: 'tipo_periodicidad',
      label: 'Tipo periodicidad',
      sortable: true,
      render: (row) => (row.tipo_periodicidad ? row.tipo_periodicidad.replaceAll('_', ' ') : '—')
    },
    { key: 'fecha_inicio', label: 'Fecha inicio', sortable: true, render: (row) => row.fecha_inicio || '—' },
    { key: 'fecha_fin', label: 'Fecha fin', sortable: true, render: (row) => row.fecha_fin || '—' },
    { key: 'estado', label: 'Estado', sortable: true, render: (row) => <StatusBadge status={row.estado} /> },
    { key: 'activo', label: 'Activo', sortable: true, render: (row) => <StatusBadge active={row.activo} /> },
    {
      key: 'acciones',
      label: 'Acciones',
      render: (row) => (
        <Link
          href={`/admin/periodos/${row.id}?tab=academicos`}
          className="inline-flex rounded-md border border-buscoedu-border bg-white px-2.5 py-1 text-xs font-medium"
        >
          Editar
        </Link>
      )
    }
  ];

  const comercialColumns: Array<DataTableColumn<PeriodoComercialRow>> = [
    { key: 'nombre', label: 'Nombre', sortable: true, render: (row) => <span className="font-medium">{row.nombre}</span> },
    {
      key: 'descripcion',
      label: 'Descripción',
      render: (row) => {
        if (!row.descripcion) return '—';
        return <span className="line-clamp-2 max-w-xs">{row.descripcion}</span>;
      }
    },
    { key: 'fecha_inicio', label: 'Fecha inicio', sortable: true, render: (row) => row.fecha_inicio || '—' },
    { key: 'fecha_fin', label: 'Fecha fin', sortable: true, render: (row) => row.fecha_fin || '—' },
    {
      key: 'periodo_academico_objetivo',
      label: 'Periodo académico objetivo',
      render: (row) =>
        row.periodo_academico_objetivo_id ? periodoAcademicoMap[row.periodo_academico_objetivo_id] || '—' : '—'
    },
    { key: 'estado', label: 'Estado', sortable: true, render: (row) => <StatusBadge status={row.estado} /> },
    { key: 'activo', label: 'Activo', sortable: true, render: (row) => <StatusBadge active={row.activo} /> },
    {
      key: 'acciones',
      label: 'Acciones',
      render: (row) => (
        <Link
          href={`/admin/periodos/${row.id}?tab=comerciales`}
          className="inline-flex rounded-md border border-buscoedu-border bg-white px-2.5 py-1 text-xs font-medium"
        >
          Editar
        </Link>
      )
    }
  ];

  function setTab(nextTab: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', nextTab);
    router.replace(`${pathname}?${params.toString()}`);
  }

  if (isLoadingCatalogs) {
    return (
      <section className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
        <LoadingSpinner text="Cargando módulo de periodos..." />
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-buscoedu-blue">Gestión de Periodos</h1>
          <p className="text-sm text-buscoedu-muted">Administra periodos académicos y comerciales del ecosistema BuscoEdu.</p>
        </div>

        <Link
          href={`/admin/periodos/nuevo?tab=${activeTab}`}
          className="inline-flex items-center justify-center rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
        >
          Nuevo Periodo
        </Link>
      </div>

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setTab} />

      {activeTab === 'academicos' ? (
        <>
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:grid-cols-3">
            <FormField
              label="Buscar por nombre"
              value={academicoSearch}
              onChange={(e) => {
                setAcademicoSearch(e.target.value);
                setAcademicoPage(1);
              }}
              placeholder="Ej: 2026-2"
            />

            <FormSelect
              label="Filtrar por universidad"
              value={academicoUniversidadFilter}
              options={universidadOptions}
              onChange={(value) => {
                setAcademicoUniversidadFilter(value);
                setAcademicoPage(1);
              }}
              placeholder="Todas"
            />

            <FormSelect
              label="Filtrar por estado"
              value={academicoEstadoFilter}
              options={ACADEMICO_ESTADO_OPTIONS}
              onChange={(value) => {
                setAcademicoEstadoFilter(value);
                setAcademicoPage(1);
              }}
              placeholder="Todos"
              searchable={false}
            />
          </div>

          <DataTable
            columns={academicoColumns}
            data={academicoRows}
            rowKey={(row) => row.id}
            page={academicoPage}
            pageSize={PAGE_SIZE}
            total={academicoTotal}
            onPageChange={setAcademicoPage}
            sortBy={academicoSortBy}
            sortDirection={academicoSortDirection}
            onSortChange={(newSortBy, direction) => {
              setAcademicoSortBy(newSortBy);
              setAcademicoSortDirection(direction);
            }}
            isLoading={isLoadingRows}
            emptyMessage="No se encontraron periodos académicos con los filtros aplicados."
          />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:grid-cols-2">
            <FormField
              label="Buscar por nombre"
              value={comercialSearch}
              onChange={(e) => {
                setComercialSearch(e.target.value);
                setComercialPage(1);
              }}
              placeholder="Ej: Campaña 2026"
            />

            <FormSelect
              label="Filtrar por estado"
              value={comercialEstadoFilter}
              options={COMERCIAL_ESTADO_OPTIONS}
              onChange={(value) => {
                setComercialEstadoFilter(value);
                setComercialPage(1);
              }}
              placeholder="Todos"
              searchable={false}
            />
          </div>

          <DataTable
            columns={comercialColumns}
            data={comercialRows}
            rowKey={(row) => row.id}
            page={comercialPage}
            pageSize={PAGE_SIZE}
            total={comercialTotal}
            onPageChange={setComercialPage}
            sortBy={comercialSortBy}
            sortDirection={comercialSortDirection}
            onSortChange={(newSortBy, direction) => {
              setComercialSortBy(newSortBy);
              setComercialSortDirection(direction);
            }}
            isLoading={isLoadingRows}
            emptyMessage="No se encontraron periodos comerciales con los filtros aplicados."
          />
        </>
      )}

      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
