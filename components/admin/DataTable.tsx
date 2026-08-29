'use client';

import React from 'react';

type SortDirection = 'asc' | 'desc';

export type DataTableColumn<T> = {
  key: string;
  label: string;
  className?: string;
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
};

type DataTableProps<T> = {
  columns: Array<DataTableColumn<T>>;
  data: T[];
  rowKey: (row: T) => string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  sortBy?: string;
  sortDirection?: SortDirection;
  onSortChange?: (sortBy: string, sortDirection: SortDirection) => void;
  emptyMessage?: string;
  isLoading?: boolean;
};

export default function DataTable<T>({
  columns,
  data,
  rowKey,
  page,
  pageSize,
  total,
  onPageChange,
  sortBy,
  sortDirection = 'asc',
  onSortChange,
  emptyMessage = 'No hay registros para mostrar.',
  isLoading = false
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function handleSort(col: DataTableColumn<T>) {
    if (!col.sortable || !onSortChange) return;
    const nextDirection: SortDirection = sortBy === col.key && sortDirection === 'asc' ? 'desc' : 'asc';
    onSortChange(col.key, nextDirection);
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-buscoedu-border bg-white shadow-card">
        <table className="min-w-full divide-y divide-buscoedu-border">
          <thead className="bg-buscoedu-bg">
            <tr>
              {columns.map((column) => {
                const isSorted = sortBy === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-buscoedu-muted ${
                      column.className || ''
                    }`}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(column)}
                        className="inline-flex items-center gap-1 hover:text-buscoedu-blue"
                      >
                        {column.label}
                        <span className="text-[10px]">
                          {isSorted ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-buscoedu-border bg-white text-sm text-buscoedu-text">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-buscoedu-muted">
                  Cargando datos...
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-buscoedu-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr key={rowKey(row)} className="align-top">
                  {columns.map((column) => (
                    <td key={column.key} className={`px-4 py-3 ${column.className || ''}`}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-buscoedu-muted">
          Mostrando {(page - 1) * pageSize + (data.length > 0 ? 1 : 0)} a {(page - 1) * pageSize + data.length} de {total}{' '}
          registros
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded-md border border-buscoedu-border bg-white px-3 py-1.5 text-xs font-medium text-buscoedu-text disabled:cursor-not-allowed disabled:opacity-60"
          >
            Anterior
          </button>
          <span className="text-xs text-buscoedu-muted">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="rounded-md border border-buscoedu-border bg-white px-3 py-1.5 text-xs font-medium text-buscoedu-text disabled:cursor-not-allowed disabled:opacity-60"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
