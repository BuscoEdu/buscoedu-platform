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

type ProgramaRow = {
  id: string;
  nombre_oficial: string;
  codigo_snies: string | null;
  universidad_id: string | null;
  sede_id: string | null;
  nivel_academico_id: string | null;
  modalidad_id: string | null;
  estado_publicacion: string | null;
  activo: boolean;
};

const PAGE_SIZE = 20;

export default function AdminProgramasPage() {
  const router = useRouter();
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [rows, setRows] = useState<ProgramaRow[]>([]);
  const [universidadesMap, setUniversidadesMap] = useState<Record<string, string>>({});
  const [sedesMap, setSedesMap] = useState<Record<string, string>>({});
  const [nivelesMap, setNivelesMap] = useState<Record<string, string>>({});
  const [modalidadesMap, setModalidadesMap] = useState<Record<string, string>>({});

  const [universidadesOptions, setUniversidadesOptions] = useState<SelectOption[]>([]);
  const [sedesOptions, setSedesOptions] = useState<SelectOption[]>([]);
  const [nivelesOptions, setNivelesOptions] = useState<SelectOption[]>([]);
  const [estadoOptions, setEstadoOptions] = useState<SelectOption[]>(ESTADOS_PUBLICACION_OPTIONS);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [universidadFilter, setUniversidadFilter] = useState('');
  const [sedeFilter, setSedeFilter] = useState('');
  const [nivelFilter, setNivelFilter] = useState('');
  const [estadoPublicacion, setEstadoPublicacion] = useState('');
  const [sortBy, setSortBy] = useState('nombre_oficial');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isLoading, setIsLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!supabase) return;

    async function loadCatalogs() {
      const [universidadesRes, sedesRes, nivelesRes, modalidadesRes, estadosRes] = await Promise.all([
        supabase.from('universidades').select('id, nombre_oficial').order('nombre_oficial', { ascending: true }),
        supabase.from('sedes').select('id, nombre').order('nombre', { ascending: true }),
        supabase.from('niveles_academicos').select('id, nombre').order('nombre', { ascending: true }),
        supabase.from('modalidades').select('id, nombre').order('nombre', { ascending: true }),
        supabase.from('programas_academicos').select('estado_publicacion').limit(500)
      ]);

      const toMap = (items: Array<{ id: string; nombre?: string | null; nombre_oficial?: string | null }>) =>
        items.reduce<Record<string, string>>((acc, item) => {
          acc[item.id] = item.nombre_oficial || item.nombre || 'Sin nombre';
          return acc;
        }, {});

      if (!universidadesRes.error) {
        const data = universidadesRes.data || [];
        setUniversidadesMap(toMap(data));
        setUniversidadesOptions(data.map((item) => ({ value: item.id, label: item.nombre_oficial || 'Sin nombre' })));
      }

      if (!sedesRes.error) {
        const data = sedesRes.data || [];
        setSedesMap(toMap(data));
        setSedesOptions(data.map((item) => ({ value: item.id, label: item.nombre || 'Sin nombre' })));
      }

      if (!nivelesRes.error) {
        const data = nivelesRes.data || [];
        setNivelesMap(toMap(data));
        setNivelesOptions(data.map((item) => ({ value: item.id, label: item.nombre || 'Sin nombre' })));
      }

      if (!modalidadesRes.error) {
        setModalidadesMap(toMap(modalidadesRes.data || []));
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
        .from('programas_academicos')
        .select(
          'id, nombre_oficial, codigo_snies, universidad_id, sede_id, nivel_academico_id, modalidad_id, estado_publicacion, activo',
          { count: 'exact' }
        );

      if (search.trim()) {
        query = query.or(`nombre_oficial.ilike.%${search.trim()}%,codigo_snies.ilike.%${search.trim()}%`);
      }

      if (universidadFilter) {
        query = query.eq('universidad_id', universidadFilter);
      }

      if (sedeFilter) {
        query = query.eq('sede_id', sedeFilter);
      }

      if (nivelFilter) {
        query = query.eq('nivel_academico_id', nivelFilter);
      }

      if (estadoPublicacion) {
        query = query.eq('estado_publicacion', estadoPublicacion);
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query
        .order(sortBy, { ascending: sortDirection === 'asc' })
        .range(from, to);

      if (error) {
        setErrorMessage(error.message || 'No fue posible cargar programas académicos.');
        setRows([]);
        setTotal(0);
      } else {
        setRows((data || []) as ProgramaRow[]);
        setTotal(count || 0);
      }

      setIsLoading(false);
    }

    loadRows();
  }, [
    supabase,
    page,
    search,
    universidadFilter,
    sedeFilter,
    nivelFilter,
    estadoPublicacion,
    sortBy,
    sortDirection
  ]);

  async function toggleActivo(row: ProgramaRow) {
    if (!supabase) return;

    const { error } = await supabase
      .from('programas_academicos')
      .update({ activo: !row.activo })
      .eq('id', row.id);

    if (error) {
      setErrorMessage(error.message || 'No fue posible actualizar el estado del programa.');
      return;
    }

    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, activo: !item.activo } : item)));
    setSuccessMessage(`Programa ${!row.activo ? 'activado' : 'desactivado'} correctamente.`);
  }

  const columns: Array<DataTableColumn<ProgramaRow>> = [
    {
      key: 'nombre_oficial',
      label: 'Nombre oficial',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-medium">{row.nombre_oficial}</p>
          {row.codigo_snies ? <p className="text-xs text-buscoedu-muted">SNIES: {row.codigo_snies}</p> : null}
        </div>
      )
    },
    {
      key: 'universidad',
      label: 'Universidad',
      render: (row) => (row.universidad_id ? universidadesMap[row.universidad_id] || '—' : '—')
    },
    {
      key: 'sede',
      label: 'Sede',
      render: (row) => (row.sede_id ? sedesMap[row.sede_id] || '—' : '—')
    },
    {
      key: 'nivel_academico',
      label: 'Nivel académico',
      render: (row) => (row.nivel_academico_id ? nivelesMap[row.nivel_academico_id] || '—' : '—')
    },
    {
      key: 'modalidad',
      label: 'Modalidad',
      render: (row) => (row.modalidad_id ? modalidadesMap[row.modalidad_id] || '—' : '—')
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
            onClick={() => router.push(`/admin/programas/${row.id}`)}
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
      <CajaAyuda titulo="Programas académicos">
        <p>
          Los programas son las carreras, diplomados o cursos que ofrecen las
          universidades. Cada programa pertenece a una universidad y puede tener
          múltiples ofertas con precios y beneficios. Un programa debe estar vinculado
          a una universidad antes de poder crear ofertas para él.
        </p>
      </CajaAyuda>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-buscoedu-blue">Programas Académicos</h1>
          <p className="text-sm text-buscoedu-muted">Gestiona programas, niveles y visibilidad comercial.</p>
        </div>

        <Link
          href="/admin/programas/nuevo"
          className="inline-flex items-center justify-center rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
        >
          Nuevo Programa
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:grid-cols-2 xl:grid-cols-5">
        <FormField
          label="Buscar nombre o SNIES"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Ej: Ingeniería o 12345"
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
          label="Sede"
          value={sedeFilter}
          options={sedesOptions}
          onChange={(value) => {
            setSedeFilter(value);
            setPage(1);
          }}
          placeholder="Todas"
        />

        <FormSelect
          label="Nivel"
          value={nivelFilter}
          options={nivelesOptions}
          onChange={(value) => {
            setNivelFilter(value);
            setPage(1);
          }}
          placeholder="Todos"
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
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
          <LoadingSpinner text="Cargando programas..." />
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
          emptyMessage="No se encontraron programas con los filtros aplicados."
        />
      )}

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
