'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import FormField from '@/components/admin/FormField';
import FormToggle from '@/components/admin/FormToggle';
import Modal from '@/components/admin/Modal';
import ErrorToast from '@/components/admin/ErrorToast';
import SuccessToast from '@/components/admin/SuccessToast';
import { isValidEmail } from '@/src/lib/admin/validation';

type Role = {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
};

type InternalUser = {
  id: string;
  auth_user_id: string | null;
  rol_id: string | null;
  nombres: string;
  apellidos: string;
  correo: string;
  telefono: string | null;
  cargo: string | null;
  activo: boolean;
  ultimo_acceso_en: string | null;
  creado_en: string;
  updated_at?: string;
  roles?: Role | null;
};

type FormValues = {
  nombres: string;
  apellidos: string;
  correo: string;
  telefono: string;
  cargo: string;
  rol_id: string;
  activo: boolean;
};

const EMPTY_FORM: FormValues = {
  nombres: '',
  apellidos: '',
  correo: '',
  telefono: '',
  cargo: '',
  rol_id: '',
  activo: true
};

async function parseJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function AdminUsuariosPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState<InternalUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [query, setQuery] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [authMessage, setAuthMessage] = useState('');

  const rolesActivos = useMemo(() => roles.filter((r) => r.activo), [roles]);

  async function cargar() {
    setLoading(true);
    setErrorMessage('');

    const [uRes, rRes] = await Promise.all([
      fetch('/api/admin/usuarios', { cache: 'no-store' }),
      fetch('/api/admin/roles', { cache: 'no-store' })
    ]);

    const [uData, rData] = await Promise.all([parseJson(uRes), parseJson(rRes)]);

    if (!uRes.ok || !uData?.ok) {
      setErrorMessage(uData?.error || 'No fue posible cargar usuarios internos.');
      setLoading(false);
      return;
    }

    if (!rRes.ok || !rData?.ok) {
      setErrorMessage(rData?.error || 'No fue posible cargar roles.');
      setLoading(false);
      return;
    }

    setUsers(uData.items || []);
    setRoles(rData.items || []);
    setLoading(false);
  }

  useEffect(() => {
    void cargar();
  }, []);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) =>
      [u.nombres, u.apellidos, u.correo, u.cargo || '', u.roles?.nombre || '', u.roles?.codigo || '']
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [query, users]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, rol_id: rolesActivos[0]?.id || '' });
    setErrors({});
    setAuthMessage('');
    setModalOpen(true);
  }

  function openEdit(user: InternalUser) {
    setEditingId(user.id);
    setForm({
      nombres: user.nombres || '',
      apellidos: user.apellidos || '',
      correo: user.correo || '',
      telefono: user.telefono || '',
      cargo: user.cargo || '',
      rol_id: user.rol_id || rolesActivos[0]?.id || '',
      activo: user.activo
    });
    setErrors({});
    setAuthMessage('');
    setModalOpen(true);
  }

  function validar(values: FormValues) {
    const e: Record<string, string> = {};
    if (!values.nombres.trim()) e.nombres = 'Nombres es obligatorio.';
    if (!values.apellidos.trim()) e.apellidos = 'Apellidos es obligatorio.';
    if (!values.correo.trim()) e.correo = 'Correo es obligatorio.';
    else if (!isValidEmail(values.correo.trim())) e.correo = 'El formato del correo no es válido.';
    if (!values.rol_id) e.rol_id = 'Debes seleccionar un rol.';
    return e;
  }

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const e = validar(form);
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    setErrorMessage('');

    const payload = {
      nombres: form.nombres.trim(),
      apellidos: form.apellidos.trim(),
      correo: form.correo.trim().toLowerCase(),
      telefono: form.telefono.trim() || null,
      cargo: form.cargo.trim() || null,
      rol_id: form.rol_id,
      activo: form.activo
    };

    const endpoint = editingId ? `/api/admin/usuarios/${editingId}` : '/api/admin/usuarios';
    const method = editingId ? 'PUT' : 'POST';

    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await parseJson(res);

    if (!res.ok || !data?.ok) {
      if (data?.error === 'correo_duplicado') {
        setErrors((prev) => ({ ...prev, correo: 'Este correo ya existe en usuarios internos.' }));
      } else {
        setErrorMessage(data?.error || 'No fue posible guardar el usuario.');
      }
      setSaving(false);
      return;
    }

    if (data?.auth_integration?.mensaje) {
      setAuthMessage(data.auth_integration.mensaje);
    }

    setSuccessMessage(editingId ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.');
    setSaving(false);
    setModalOpen(false);
    await cargar();
  }

  async function toggleActivo(user: InternalUser) {
    setErrorMessage('');
    const res = await fetch(`/api/admin/usuarios/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombres: user.nombres,
        apellidos: user.apellidos,
        correo: user.correo,
        telefono: user.telefono,
        cargo: user.cargo,
        rol_id: user.rol_id,
        activo: !user.activo
      })
    });
    const data = await parseJson(res);
    if (!res.ok || !data?.ok) {
      setErrorMessage(data?.error || 'No fue posible cambiar el estado del usuario.');
      return;
    }

    setSuccessMessage(user.activo ? 'Usuario desactivado correctamente.' : 'Usuario activado correctamente.');
    await cargar();
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-buscoedu-blue">Usuarios internos</h1>
          <p className="text-sm text-buscoedu-muted">
            Gestión de accesos para Lead Center y administración. No se realizan eliminaciones físicas.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white hover:brightness-95"
        >
          Crear usuario
        </button>
      </div>

      <div className="rounded-xl border border-buscoedu-border bg-white p-3 shadow-card">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, correo, rol o cargo..."
          className="w-full rounded-lg border border-buscoedu-border px-3 py-2 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-buscoedu-border bg-white shadow-card">
        <table className="min-w-full text-sm">
          <thead className="bg-buscoedu-bg text-left text-xs uppercase tracking-wide text-buscoedu-muted">
            <tr>
              <th className="px-3 py-3">Nombre</th>
              <th className="px-3 py-3">Correo</th>
              <th className="px-3 py-3">Rol</th>
              <th className="px-3 py-3">Cargo</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3">Último acceso</th>
              <th className="px-3 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-buscoedu-border text-buscoedu-text">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-buscoedu-muted">
                  Cargando usuarios...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-buscoedu-muted">
                  No hay usuarios para mostrar.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td className="px-3 py-3 font-medium">{[user.nombres, user.apellidos].filter(Boolean).join(' ')}</td>
                  <td className="px-3 py-3">{user.correo}</td>
                  <td className="px-3 py-3">{user.roles?.nombre || user.roles?.codigo || 'Sin rol'}</td>
                  <td className="px-3 py-3">{user.cargo || '—'}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                        user.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {user.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-buscoedu-muted">
                    {user.ultimo_acceso_en
                      ? new Date(user.ultimo_acceso_en).toLocaleString('es-CO')
                      : 'Sin acceso'}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(user)}
                        className="rounded-md border border-buscoedu-border px-2.5 py-1 text-xs font-semibold hover:bg-buscoedu-bg"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleActivo(user)}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold text-white ${
                          user.activo ? 'bg-gray-700 hover:bg-gray-800' : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                      >
                        {user.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
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
        title={editingId ? 'Editar usuario interno' : 'Crear usuario interno'}
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
              form="usuario-form"
              className="rounded-md bg-buscoedu-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
              disabled={saving}
            >
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        }
      >
        <form id="usuario-form" className="space-y-3" onSubmit={guardar}>
          <FormField
            label="Nombres"
            requiredMark
            value={form.nombres}
            onChange={(e) => setForm((p) => ({ ...p, nombres: e.target.value }))}
            error={errors.nombres}
          />
          <FormField
            label="Apellidos"
            requiredMark
            value={form.apellidos}
            onChange={(e) => setForm((p) => ({ ...p, apellidos: e.target.value }))}
            error={errors.apellidos}
          />
          <FormField
            label="Correo"
            type="email"
            requiredMark
            value={form.correo}
            onChange={(e) => setForm((p) => ({ ...p, correo: e.target.value }))}
            error={errors.correo}
            helperText="Debe ser único y con formato válido."
          />
          <FormField
            label="Teléfono"
            value={form.telefono}
            onChange={(e) => setForm((p) => ({ ...p, telefono: e.target.value }))}
          />
          <FormField
            label="Cargo"
            value={form.cargo}
            onChange={(e) => setForm((p) => ({ ...p, cargo: e.target.value }))}
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-buscoedu-text">
              Rol <span className="text-red-600">*</span>
            </label>
            <select
              value={form.rol_id}
              onChange={(e) => setForm((p) => ({ ...p, rol_id: e.target.value }))}
              className={`w-full rounded-lg border px-3 py-2.5 text-sm ${
                errors.rol_id ? 'border-red-300 bg-red-50/40' : 'border-buscoedu-border bg-white'
              }`}
            >
              <option value="">Selecciona un rol</option>
              {rolesActivos.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.nombre} ({role.codigo})
                </option>
              ))}
            </select>
            {errors.rol_id ? <p className="text-xs text-red-600">{errors.rol_id}</p> : null}
          </div>

          <FormToggle
            label="Activo"
            checked={form.activo}
            onChange={(checked) => setForm((p) => ({ ...p, activo: checked }))}
          />

          {!editingId ? (
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
              Se intentará crear y vincular la cuenta en Supabase Auth. Si el flujo de invitación no está disponible,
              el usuario interno quedará creado y la activación de acceso se gestionará por el flujo pendiente.
            </p>
          ) : null}
        </form>
      </Modal>

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
      {authMessage ? <SuccessToast message={authMessage} onClose={() => setAuthMessage('')} /> : null}
    </section>
  );
}
