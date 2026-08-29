'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import DataTable, { type DataTableColumn } from '@/components/admin/DataTable';
import FormSelect from '@/components/admin/FormSelect';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import ErrorToast from '@/components/admin/ErrorToast';
import PrecioActivoBadge from '@/components/admin/PrecioActivoBadge';
import { getSupabaseClient } from '@/src/lib/supabase';
import type { SelectOption } from '@/src/lib/admin/types';

type PrecioRow = {
  id: string;
  oferta_id: string | null;
  concepto_cobro: string | null;
  valor: number | null;
  moneda: string | null;
  periodicidad: string | null;
  vigente_desde: string | null;
  vigente_hasta: string | null;
  es_precio_activo: boolean;
};

const PAGE_SIZE = 20;

function formatCurrency(value: number | null, moneda: string | null) {
  if (value === null || value === undefined) return '—';

  try {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: moneda || 'COP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${moneda || ''} ${value}`.trim();
  }
}

export default function AdminPreciosPage() {
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [rows, setRows] = useState<PrecioRow[]>([]);
  const [ofertasMap, setOfertasMap] = useState<Record<string, string>>({});
  const [ofertasOptions, setOfertasOptions] = useState<SelectOption[]>([]);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [ofertaFilter, setOfertaFilter] = useState('');
  const [sortBy, setSortBy] = useState('creado_en');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!supabase) return;

    async function loadCatalogs() {
      const { data, error } = await supabase
        .from('ofertas_academicas')
        .select('id, nombre_oferta')
        .order('nombre_oferta', { ascending: true });

      if (error) {
        setErrorMessage(error.message || 'No fue posible cargar el catálogo de ofertas.');
        return;
      }

      const mapped = (data || []).map((item) => ({ value: item.id, label: item.nombre_oferta || 'Oferta sin nombre' }));
      setOfertasOptions(mapped);
      setOfertasMap(
        mapped.reduce<Record<string, string>>((acc, item) => {
          acc[item.value] = item.label;
          return acc;
        }, {})
      );
    }

    loadCatalogs();
  }, [supabase]);

  useEffect(() => {
    if (!supabase) return;

    async function loadRows() {
      setIsLoading(true);

      let query = supabase
        .from('precios_oferta')
        .select(
          'id, oferta_id, concepto_cobro, valor, moneda, periodicidad, vigente_desde, vigente_hasta, es_precio_activo, creado_en',
          { count: 'exact' }
        );

      if (ofertaFilter) {
        query = query.eq('oferta_id', ofertaFilter);
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query
        .order(sortBy, { ascending: sortDirection === 'asc' })
        .range(from, to);

      if (error) {
        setErrorMessage(error.message || 'No fue posible cargar precios.');
        setRows([]);
        setTotal(0);
      } else {
        setRows((data || []) as PrecioRow[]);
        setTotal(count || 0);
      }

      setIsLoading(false);
    }

    loadRows();
  }, [supabase, page, ofertaFilter, sortBy, sortDirection]);

  const columns: Array<DataTableColumn<PrecioRow>> = [
    {
      key: 'oferta',
      label: 'Oferta',
      render: (row) => (row.oferta_id ? ofertasMap[row.oferta_id] || '—' : '—')
    },
    {
      key: 'concepto_cobro',
      label: 'Concepto cobro',
      sortable: true,
      render: (row) => row.concepto_cobro || '—'
    },
    {
      key: 'valor',
      label: 'Valor',
      sortable: true,
      render: (row) => formatCurrency(row.valor, row.moneda)
    },
    {
      key: 'moneda',
      label: 'Moneda',
      sortable: true,
      render: (row) => row.moneda || '—'
    },
    {
      key: 'periodicidad',
      label: 'Periodicidad',
      sortable: true,
      render: (row) => row.periodicidad || '—'
    },
    {
      key: 'vigente_desde',
      label: 'Vigente desde',
      sortable: true,
      render: (row) => row.vigente_desde || '—'
    },
    {
      key: 'vigente_hasta',
      label: 'Vigente hasta',
      sortable: true,
      render: (row) => row.vigente_hasta || '—'
    },
    {
      key: 'es_precio_activo',
      label: 'Precio activo',
      sortable: true,
      render: (row) => <PrecioActivoBadge isActive={Boolean(row.es_precio_activo)} />
    },
    {
      key: 'acciones',
      label: 'Acciones',
      render: (row) => (
        <Link
          href={row.oferta_id ? `/admin/precios/nuevo?oferta_id=${row.oferta_id}` : '/admin/precios/nuevo'}
          className="inline-flex rounded-md bg-buscoedu-blue px-2.5 py-1 text-xs font-semibold text-white"
        >
          Nuevo Precio
        </Link>
      )
    }
  ];

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-buscoedu-blue">Precios de Ofertas</h1>
          <p className="text-sm text-buscoedu-muted">
            Historial versionado de precios. No se permite edición: siempre se crea un nuevo precio.
          </p>
        </div>

        <Link
          href="/admin/precios/nuevo"
          className="inline-flex items-center justify-center rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95"
        >
          Nuevo Precio
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
      </div>

      {isLoading && rows.length === 0 ? (
        <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
          <LoadingSpinner text="Cargando precios..." />
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
          emptyMessage="No se encontraron precios con los filtros aplicados."
        />
      )}

      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
