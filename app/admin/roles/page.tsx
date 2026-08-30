'use client';

import { FormEvent, useEffect, useState } from 'react';
import FormField from '@/components/admin/FormField';
import FormTextarea from '@/components/admin/FormTextarea';
import FormToggle from '@/components/admin/FormToggle';
import Modal from '@/components/admin/Modal';
import ErrorToast from '@/components/admin/ErrorToast';
import SuccessToast from '@/components/admin/SuccessToast';

type RoleItem = {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  permisos: Record<string, any> | null;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
};

type RoleForm = {
  codigo: string;
  nombre: string;
  descripcion: string;
  permisosText: string;
  activo: boolean;
};

const EMPTY_FORM: RoleForm = {
  codigo: '',
  nombre: '',
  descripcion: '',
  permisosText: '{\n  \n}',
  activo: true
};

async function parseJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function parsePermisos(permisosText: string): { value?: Record<string, any>; error?: string } {
  try {
    const parsed = JSON.parse(permisosText || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'Permisos debe ser un JSON de objeto.' };
    }
    return { value: parsed };
  } catch {
    return { error: 'Permisos JSON inválido.' };
  }
}

export default function AdminRolesPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<RoleItem[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RoleForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  async function cargar() {
    setLoading(true);
    setErrorMessage('');
    const res = await fetch('/api/admin/roles', { cache: 'no-store' });
    const data = await parseJson(res);

    if (!res.ok || !data?.ok) {
      setErrorMessage(data?.error || 'No fue posible cargar roles.');
      setLoading(false);
      return;
    }

    setRoles(data.items || []);
    setLoading(false);
  }

  useEffect(() => {
    void cargar();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(role: RoleItem) {
    setEditingId(role.id);
    setForm({
      codigo: role.codigo,
      nombre: role.nombre,
      descripcion: role.descripcion || '',
      permisosText: JSON.stringify(role.permisos || {}, null, 2),
      activo: role.activo
    });
    setErrors({});
    setModalOpen(true);
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: Record<string, string> = {};
    const codigo = form.codigo.trim().toLowerCase();
    const nombre = form.nombre.trim();

    if (!codigo) nextErrors.codigo = 'Código es obligatorio.';
    else if (!/^[a-z0-9_]+$/.test(codigo)) {
      nextErrors.codigo = 'Código inválido. Usa minúsculas, números y guion bajo.';
    }

    if (!nombre) nextErrors.nombre = 'Nombre es obligatorio.';

    const permisosParsed = parsePermisos(form.permisosText);
    if (permisosParsed.error) nextErrors.permisos = permisosParsed.error;

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !permisosParsed.value) return;

    setSaving(true);
    const payload = {
      codigo,
      nombre,
      descripcion: form.descripcion.trim() || null,
      permisos: permisosParsed.value,
      activo: form.activo
    };

    const endpoint = editingId ? `/api/admin/roles/${editingId}` : '/api/admin/roles';
    const method = editingId ? 'PUT' : 'POST';

    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await parseJson(res);

    if (!res.ok || !data?.ok) {
      if (data?.error === 'codigo_duplicado') {
        setErrors((prev) => ({ ...prev, codigo: 'El código ya existe.' }));
      } else {
        setErrorMessage(data?.error || 'No fue posible guardar el rol.');
      }
      setSaving(false);
      return;
    }

    setSuccessMessage(editingId ? 'Rol actualizado correctamente.' : 'Rol creado correctamente.');
    setSaving(false);
    setModalOpen(false);
    await cargar();
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-buscoedu-blue">Roles y permisos</h1>
          <p className="text-sm text-buscoedu-muted">
            Gestión básica de roles internos. Los permisos se almacenan en formato JSONB.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white hover:brightness-95"
        >
          Crear rol
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-buscoedu-border bg-white shadow-card">
        <table className="min-w-full text-sm">
          <thead className="bg-buscoedu-bg text-left text-xs uppercase tracking-wide text-buscoedu-muted">
            <tr>
              <th className="px-3 py-3">Código</th>
              <th className="px-3 py-3">Nombre</th>
              <th className="px-3 py-3">Descripción</th>
              <th className="px-3 py-3">Activo</th>
              <th className="px-3 py-3">Permisos (JSON)</th>
              <th className="px-3 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-buscoedu-border text-buscoedu-text">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-buscoedu-muted">
                  Cargando roles...
                </td>
              </tr>
            ) : roles.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-buscoedu-muted">
                  No hay roles registrados.
                </td>
              </tr>
            ) : (
              roles.map((role) => (
                <tr key={role.id}>
                  <td className="px-3 py-3 font-medium">{role.codigo}</td>
                  <td className="px-3 py-3">{role.nombre}</td>
                  <td className="px-3 py-3">{role.descripcion || '—'}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                        role.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {role.activo ? 'Sí' : 'No'}
                    </span>
                  </td>
                  <td className="max-w-[360px] px-3 py-3">
                    <pre className="max-h-24 overflow-auto rounded-md bg-buscoedu-bg p-2 text-[11px] text-buscoedu-text">
                      {JSON.stringify(role.permisos || {}, null, 2)}
                    </pre>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      onClick={() => openEdit(role)}
                      className="rounded-md border border-buscoedu-border px-2.5 py-1 text-xs font-semibold hover:bg-buscoedu-bg"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => (!saving ? setModalOpen(false) : undefined)}
        title={editingId ? 'Editar rol' : 'Crear rol'}
        maxWidthClassName="max-w-2xl"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-md border border-buscoedu-border px-3 py-2 text-sm"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="rol-form"
              className="rounded-md bg-buscoedu-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
              disabled={saving}
            >
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear rol'}
            </button>
          </div>
        }
      >
        <form id="rol-form" className="space-y-3" onSubmit={guardar}>
          <FormField
            label="Código"
            requiredMark
            value={form.codigo}
            onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))}
            error={errors.codigo}
            helperText="Único, sin espacios (ej: super_admin, asesor, coordinador)."
          />
          <FormField
            label="Nombre"
            requiredMark
            value={form.nombre}
            onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
            error={errors.nombre}
          />
          <FormTextarea
            label="Descripción"
            value={form.descripcion}
            onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
            maxLength={1000}
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-buscoedu-text">Permisos (JSON)</label>
            <textarea
              value={form.permisosText}
              onChange={(e) => setForm((p) => ({ ...p, permisosText: e.target.value }))}
              rows={8}
              className={`w-full rounded-lg border px-3 py-2.5 font-mono text-xs ${
                errors.permisos ? 'border-red-300 bg-red-50/40' : 'border-buscoedu-border bg-white'
              }`}
            />
            {errors.permisos ? <p className="text-xs text-red-600">{errors.permisos}</p> : null}
          </div>

          <FormToggle
            label="Activo"
            checked={form.activo}
            onChange={(checked) => setForm((p) => ({ ...p, activo: checked }))}
          />
        </form>
      </Modal>

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
