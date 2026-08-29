'use client';

import { useMemo, useState } from 'react';
import { validateRequiredFields, type ValidationErrors } from '@/src/lib/admin/validation';

export type InlineEditRow = {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
};

type InlineEditTableProps = {
  rows: InlineEditRow[];
  isLoading?: boolean;
  emptyMessage?: string;
  readOnly?: boolean;
  onSave: (id: string, payload: { codigo: string; nombre: string; descripcion: string | null; activo: boolean }) => Promise<boolean>;
  onToggleActive?: (row: InlineEditRow) => Promise<void>;
};

type DraftValues = {
  codigo: string;
  nombre: string;
  descripcion: string;
  activo: boolean;
};

function toDraft(row: InlineEditRow): DraftValues {
  return {
    codigo: row.codigo || '',
    nombre: row.nombre || '',
    descripcion: row.descripcion || '',
    activo: Boolean(row.activo)
  };
}

export default function InlineEditTable({
  rows,
  isLoading = false,
  emptyMessage = 'No hay registros.',
  readOnly = false,
  onSave,
  onToggleActive
}: InlineEditTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftValues>({ codigo: '', nombre: '', descripcion: '', activo: true });
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const hasRows = rows.length > 0;
  const orderedRows = useMemo(() => [...rows], [rows]);

  function startEdit(row: InlineEditRow) {
    setEditingId(row.id);
    setDraft(toDraft(row));
    setErrors({});
  }

  function cancelEdit() {
    setEditingId(null);
    setErrors({});
  }

  async function submitEdit(rowId: string) {
    const validation = validateRequiredFields(draft as unknown as Record<string, unknown>, [
      { key: 'codigo', label: 'Código' },
      { key: 'nombre', label: 'Nombre' }
    ]);

    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    setSavingId(rowId);
    try {
      const success = await onSave(rowId, {
        codigo: draft.codigo.trim(),
        nombre: draft.nombre.trim(),
        descripcion: draft.descripcion.trim() || null,
        activo: draft.activo
      });
      if (success) {
        setEditingId(null);
        setErrors({});
      }
    } finally {
      setSavingId(null);
    }
  }

  async function handleToggle(row: InlineEditRow) {
    if (!onToggleActive) return;
    setTogglingId(row.id);
    try {
      await onToggleActive(row);
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-buscoedu-border bg-white shadow-card">
      <table className="min-w-full divide-y divide-buscoedu-border">
        <thead className="bg-buscoedu-bg">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-buscoedu-muted">Código</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-buscoedu-muted">Nombre</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-buscoedu-muted">Descripción</th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-buscoedu-muted">Activo</th>
            {!readOnly ? (
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-buscoedu-muted">Acciones</th>
            ) : null}
          </tr>
        </thead>

        <tbody className="divide-y divide-buscoedu-border bg-white text-sm text-buscoedu-text">
          {isLoading ? (
            <tr>
              <td colSpan={readOnly ? 4 : 5} className="px-4 py-8 text-center text-buscoedu-muted">
                Cargando datos...
              </td>
            </tr>
          ) : !hasRows ? (
            <tr>
              <td colSpan={readOnly ? 4 : 5} className="px-4 py-8 text-center text-buscoedu-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            orderedRows.map((row) => {
              const isEditing = editingId === row.id;
              return (
                <tr key={row.id} className="align-top">
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <>
                        <input
                          value={draft.codigo}
                          onChange={(e) => setDraft((prev) => ({ ...prev, codigo: e.target.value }))}
                          className="w-full rounded-md border border-buscoedu-border px-2.5 py-1.5 text-sm"
                        />
                        {errors.codigo ? <p className="mt-1 text-xs text-red-600">{errors.codigo}</p> : null}
                      </>
                    ) : (
                      <span className="font-medium">{row.codigo}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <>
                        <input
                          value={draft.nombre}
                          onChange={(e) => setDraft((prev) => ({ ...prev, nombre: e.target.value }))}
                          className="w-full rounded-md border border-buscoedu-border px-2.5 py-1.5 text-sm"
                        />
                        {errors.nombre ? <p className="mt-1 text-xs text-red-600">{errors.nombre}</p> : null}
                      </>
                    ) : (
                      row.nombre
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <input
                        value={draft.descripcion}
                        onChange={(e) => setDraft((prev) => ({ ...prev, descripcion: e.target.value }))}
                        placeholder="Opcional"
                        className="w-full rounded-md border border-buscoedu-border px-2.5 py-1.5 text-sm"
                      />
                    ) : (
                      row.descripcion || '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.activo}
                          onChange={(e) => setDraft((prev) => ({ ...prev, activo: e.target.checked }))}
                          className="h-4 w-4 rounded border-buscoedu-border"
                        />
                        {draft.activo ? 'Sí' : 'No'}
                      </label>
                    ) : (
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs ${
                          row.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {row.activo ? 'Sí' : 'No'}
                      </span>
                    )}
                  </td>

                  {!readOnly ? (
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => submitEdit(row.id)}
                            disabled={savingId === row.id}
                            className="rounded-md bg-buscoedu-blue px-2.5 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {savingId === row.id ? 'Guardando...' : 'Guardar'}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="rounded-md border border-buscoedu-border px-2.5 py-1 text-xs font-medium"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            className="rounded-md border border-buscoedu-border bg-white px-2.5 py-1 text-xs font-medium"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggle(row)}
                            disabled={togglingId === row.id}
                            className="rounded-md bg-buscoedu-teal px-2.5 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                          >
                            {row.activo ? 'Desactivar' : 'Activar'}
                          </button>
                        </div>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
