'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import DataTable, { type DataTableColumn } from '@/components/admin/DataTable';
import FormSelect from '@/components/admin/FormSelect';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import SuccessToast from '@/components/admin/SuccessToast';
import ErrorToast from '@/components/admin/ErrorToast';
import { getSupabaseClient } from '@/src/lib/supabase';
import type { SelectOption } from '@/src/lib/admin/types';

type BeneficioRow = {
  id: string;
  oferta_id: string | null;
  tipo_beneficio_id: string | null;
  nombre_beneficio: string;
  cupos_disponibles: number | null;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  estado_publicacion: string | null;
  activo: boolean;
};

type OfertaCatalog = {
  id: string;
  nombre_oferta: string | null;
  universidad_id: string | null;
};

const PAGE_SIZE = 20;

function formatVigencia(desde: string | null, hasta: string | null) {
  if (!desde && !hasta) return '—';
  return `${desde || '—'} a ${hasta || '—'}`;
}

export default function AdminBeneficiosPage() {
  const router = useRouter();
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [rows, setRows] = useState<BeneficioRow[]>([]);
  const [ofertasMap, setOfertasMap] = useState<Record<string, string>>({});
  const [tiposMap, setTiposMap] = useState<Record<string, string>>({});
  const [ofertaUniversidadMap, setOfertaUniversidadMap] = useState<Record<string, string>>({});
  const [ofertasOptions, setOfertasOptions] = useState<SelectOption[]>([]);
  const [universidadesOptions, setUniversidadesOptions] = useState<SelectOption[]>([]);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [ofertaFilter, setOfertaFilter] = useState('');
  const [universidadFilter, setUniversidadFilter] = useState('');
  const [sortBy, setSortBy] = useState('nombre_beneficio');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isLoading, setIsLoading] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!supabase) return;

    async function loadCatalogs() {
      const [ofertasRes, tiposRes, universidadesRes] = await Promise.all([
        supabase.from('ofertas_academicas').select('id, nombre_oferta, universidad_id').order('nombre_oferta', { ascending: true }),
        supabase.from('tipos_beneficio').select('id, nombre').order('nombre', { ascending: true }),
        supabase.from('universidades').select('id, nombre_oficial').order('nombre_oficial', { ascending: true })
      ]);

      if (!ofertasRes.error) {
        const ofertas = (ofertasRes.data || []) as OfertaCatalog[];
        setOfertasMap(
          ofertas.reduce<Record<string, string>>((acc, item) => {
            acc[item.id] = item.nombre_oferta || 'Oferta sin nombre';
            return acc;
          }, {})
        );
        setOfertaUniversidadMap(
          ofertas.reduce<Record<string, string>>((acc, item) => {
            acc[item.id] = item.universidad_id || '';
            return acc;
          }, {})
        );
        setOfertasOptions(
          ofertas.map((item) => ({
            value: item.id,
            label: item.nombre_oferta || 'Oferta sin nombre'
          }))
        );
      }

      if (!tiposRes.error) {
        setTiposMap(
          (tiposRes.data || []).reduce<Record<string, string>>((acc, item) => {
            acc[item.id] = item.nombre || 'Tipo sin nombre';
            return acc;
          }, {})
        );
      }

      if (!universidadesRes.error) {
        setUniversidadesOptions(
          (universidadesRes.data || []).map((item) => ({
            value: item.id,
            label: item.nombre_oficial || 'Sin nombre'
          }))
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
        .from('beneficios_oferta')
        .select(
          'id, oferta_id, tipo_beneficio_id, nombre_beneficio, cupos_disponibles, vigente_desde, vigente_hasta, estado_publicacion, activo',
          { count: 'exact' }
        );

      if (ofertaFilter) {
        query = query.eq('oferta_id', ofertaFilter);
      }

      if (universidadFilter && !ofertaFilter) {
        const allowedOfferIds = Object.entries(ofertaUniversidadMap)
          .filter(([, universidadId]) => universidadId === universidadFilter)
          .map(([offerId]) => offerId);

        if (allowedOfferIds.length === 0) {
          setRows([]);
          setTotal(0);
          setIsLoading(false);
          return;
        }

        query = query.in('oferta_id', allowedOfferIds);
      }

      if (universidadFilter && ofertaFilter) {
        const universidadOfOferta = ofertaUniversidadMap[ofertaFilter] || '';
        if (universidadOfOferta !== universidadFilter) {
          setRows([]);
          setTotal(0);
          setIsLoading(false);
          return;
        }
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query
        .order(sortBy, { ascending: sortDirection === 'asc' })
        .range(from, to);

      if (error) {
        setErrorMessage(error.message || 'No fue posible cargar beneficios.');
        setRows([]);
        setTotal(0);
      } else {
        setRows((data || []) as BeneficioRow[]);
        setTotal(count || 0);
      }

      setIsLoading(false);
    }

    loadRows();
  }, [supabase, page, ofertaFilter, universidadFilter, sortBy, sortDirection, ofertaUniversidadMap]);

  async function toggleActivo(row: BeneficioRow) {
    if (!supabase) return;

    const { error } = await supabase.from('beneficios_oferta').update({ activo: !row.activo }).eq('id', row.id);

    if (error) {
      setErrorMessage(error.message || 'No fue posible actualizar el estado del beneficio.');
      return;
    }

    setRows((prev) => prev.map((item) => (item.id === row.id ? { ...item, activo: !item.activo } : item)));
    setSuccessMessage(`Beneficio ${!row.activo ? 'activado' : 'desactivado'} correctamente.`);
  }

  const columns: Array<DataTableColumn<BeneficioRow>> = [
    {
      key: 'nombre_beneficio',
      label: 'Nombre beneficio',
      sortable: true,
      render: (row) => <span className="font-medium">{row.nombre_beneficio}</span>
    },
    {
      key: 'oferta',
      label: 'Oferta',
      render: (row) => (row.oferta_id ? ofertasMap[row.oferta_id] || '—' : '—')
    },
    {
      key: 'tipo',
      label: 'Tipo',
      render: (row) => (row.tipo_beneficio_id ? tiposMap[row.tipo_beneficio_id] || '—' : '—')
    },
    {
      key: 'cupos',
      label: 'Cupos',
      sortable: true,
      render: (row) => (typeof row.cupos_disponibles === 'number' ? row.cupos_disponibles : '—')
    },
    {
      key: 'vigencia',
      label: 'Vigencia',
      render: (row) => formatVigencia(row.vigente_desde, row.vigente_hasta)
    },
    {
      key: 'estado',
      label: 'Estado',
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
            onClick={() => router.push(`/admin/beneficios/${row.id}`)}
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
          <h1 className="text-2xl font-bold text-buscoedu-blue">Beneficios de Ofertas</h1>
          <p className="text-sm text-buscoedu-muted">Administra beneficios comerciales asociados a cada oferta.</p>
        </div>

        <Link
          href="/admin/beneficios/nuevo"
          className="inline-flex items-center justify-center rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
        >
          Nuevo Beneficio
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-buscoedu-border bg-white p-4 shadow-card md:grid-cols-2">
        <FormSelect
          label="Filtrar por oferta"
          value={ofertaFilter}
          options={ofertasOptions}
          onChange={(value) => {
            setOfertaFilter(value);
            setPage(1);
          }}
          placeholder="Todas"
        />

        <FormSelect
          label="Filtrar por universidad"
          value={universidadFilter}
          options={universidadesOptions}
          onChange={(value) => {
            setUniversidadFilter(value);
            setPage(1);
          }}
          placeholder="Todas"
        />
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
          <LoadingSpinner text="Cargando beneficios..." />
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
          emptyMessage="No se encontraron beneficios con los filtros aplicados."
        />
      )}

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
