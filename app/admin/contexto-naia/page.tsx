'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import FormField from '@/components/admin/FormField';
import FormTextarea from '@/components/admin/FormTextarea';
import FormToggle from '@/components/admin/FormToggle';
import Modal from '@/components/admin/Modal';
import ErrorToast from '@/components/admin/ErrorToast';
import SuccessToast from '@/components/admin/SuccessToast';

type ContextoNaia = {
  id: string;
  version: number;
  nombre: string;
  instrucciones_sistema: string | null;
  tono: string | null;
  prioridades_conversacionales: Record<string, any> | null;
  respuestas_guiadas: Record<string, any> | null;
  estado: 'borrador' | 'publicado' | 'archivado';
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
};

type FormState = {
  nombre: string;
  instrucciones_sistema: string;
  tono: string;
  prioridades_texto: string;
  respuestas_texto: string;
};

const EMPTY_FORM: FormState = {
  nombre: '',
  instrucciones_sistema: '',
  tono: 'Tranquilo, respetuoso y directo',
  prioridades_texto: '{\n  "objetivo": "orientar y filtrar con claridad"\n}',
  respuestas_texto: '{\n  "saludo": "Hola, soy NaIA. ¿Qué te gustaría estudiar?"\n}'
};

async function parseJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function parseObject(text: string, field: string): { ok: true; value: Record<string, any> } | { ok: false; error: string } {
  if (!text.trim()) return { ok: true, value: {} };
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { ok: false, error: `${field} debe ser un objeto JSON.` };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, error: `${field} contiene JSON inválido.` };
  }
}

export default function AdminContextoNaiaPage() {
  const [items, setItems] = useState<ContextoNaia[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const contextoActivo = useMemo(() => items.find((x) => x.activo), [items]);

  async function cargar() {
    setLoading(true);
    setErrorMessage('');

    const res = await fetch('/api/admin/contexto-naia', { cache: 'no-store' });
    const data = await parseJson(res);

    if (!res.ok || !data?.ok) {
      setErrorMessage(data?.error || 'No fue posible cargar el contexto de NaIA.');
      setLoading(false);
      return;
    }

    setItems(data.items || []);
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

  function openEdit(item: ContextoNaia) {
    setEditingId(item.id);
    setForm({
      nombre: item.nombre,
      instrucciones_sistema: item.instrucciones_sistema || '',
      tono: item.tono || '',
      prioridades_texto: JSON.stringify(item.prioridades_conversacionales || {}, null, 2),
      respuestas_texto: JSON.stringify(item.respuestas_guiadas || {}, null, 2)
    });
    setErrors({});
    setModalOpen(true);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();

    const nextErrors: Record<string, string> = {};
    if (!form.nombre.trim()) nextErrors.nombre = 'El nombre es obligatorio.';

    const prioridades = parseObject(form.prioridades_texto, 'Prioridades conversacionales');
    const respuestas = parseObject(form.respuestas_texto, 'Respuestas guiadas');
    if ('error' in prioridades) {
      nextErrors.prioridades = prioridades.error;
    }
    if ('error' in respuestas) {
      nextErrors.respuestas = respuestas.error;
    }

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !prioridades.ok || !respuestas.ok) return;

    setSaving(true);

    const payload = {
      nombre: form.nombre.trim(),
      instrucciones_sistema: form.instrucciones_sistema.trim() || null,
      tono: form.tono.trim() || null,
      prioridades_conversacionales: prioridades.value,
      respuestas_guiadas: respuestas.value
    };

    const endpoint = editingId ? `/api/admin/contexto-naia/${editingId}` : '/api/admin/contexto-naia';
    const method = editingId ? 'PUT' : 'POST';

    const res = await fetch(endpoint, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await parseJson(res);
    setSaving(false);

    if (!res.ok || !data?.ok) {
      setErrorMessage(data?.error || 'No se pudo guardar el contexto.');
      return;
    }

    setSuccessMessage(editingId ? 'Versión actualizada.' : 'Versión creada en borrador.');
    setModalOpen(false);
    await cargar();
  }

  async function cambiarEstado(id: string, accion: 'publicar' | 'archivar') {
    const res = await fetch(`/api/admin/contexto-naia/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion })
    });

    const data = await parseJson(res);
    if (!res.ok || !data?.ok) {
      setErrorMessage(data?.error || `No se pudo ${accion} la versión.`);
      return;
    }

    setSuccessMessage(
      accion === 'publicar' ? 'Versión publicada y activada correctamente.' : 'Versión archivada.'
    );
    await cargar();
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-buscoedu-blue">Contexto NaIA</h1>
          <p className="text-sm text-buscoedu-muted">
            Gestiona versiones de instrucciones, tono y respuestas guiadas. Solo una versión publicada puede estar activa.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white hover:brightness-95"
        >
          Nueva versión
        </button>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
        Contexto activo: {contextoActivo ? `v${contextoActivo.version} — ${contextoActivo.nombre}` : 'ninguno'}
      </div>

      <div className="overflow-x-auto rounded-xl border border-buscoedu-border bg-white shadow-card">
        <table className="min-w-full text-sm">
          <thead className="bg-buscoedu-bg text-left text-xs uppercase tracking-wide text-buscoedu-muted">
            <tr>
              <th className="px-3 py-3">Versión</th>
              <th className="px-3 py-3">Nombre</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3">Activa</th>
              <th className="px-3 py-3">Actualizada</th>
              <th className="px-3 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-buscoedu-border text-buscoedu-text">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-buscoedu-muted">Cargando contexto...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-buscoedu-muted">No hay versiones creadas.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-3 font-medium">v{item.version}</td>
                  <td className="px-3 py-3">{item.nombre}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
                      {item.estado}
                    </span>
                  </td>
                  <td className="px-3 py-3">{item.activo ? 'Sí' : 'No'}</td>
                  <td className="px-3 py-3 text-xs text-buscoedu-muted">
                    {new Date(item.actualizado_en).toLocaleString('es-CO')}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        disabled={item.estado !== 'borrador'}
                        className="rounded-md border border-buscoedu-border px-2.5 py-1 text-xs font-semibold hover:bg-buscoedu-bg disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void cambiarEstado(item.id, 'publicar')}
                        disabled={item.activo}
                        className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Publicar
                      </button>
                      <button
                        type="button"
                        onClick={() => void cambiarEstado(item.id, 'archivar')}
                        disabled={item.estado === 'archivado'}
                        className="rounded-md bg-gray-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Archivar
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
        title={editingId ? 'Editar versión de contexto (borrador)' : 'Nueva versión de contexto NaIA'}
        maxWidthClassName="max-w-3xl"
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
              form="contexto-naia-form"
              className="rounded-md bg-buscoedu-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
              disabled={saving}
            >
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear versión'}
            </button>
          </div>
        }
      >
        <form id="contexto-naia-form" className="space-y-3" onSubmit={guardar}>
          <FormField
            label="Nombre de versión"
            requiredMark
            value={form.nombre}
            onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
            error={errors.nombre}
          />

          <FormTextarea
            label="Instrucciones del sistema"
            value={form.instrucciones_sistema}
            onChange={(e) => setForm((prev) => ({ ...prev, instrucciones_sistema: e.target.value }))}
            maxLength={12000}
          />

          <FormTextarea
            label="Guía de tono"
            value={form.tono}
            onChange={(e) => setForm((prev) => ({ ...prev, tono: e.target.value }))}
            maxLength={2000}
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-buscoedu-text">Prioridades conversacionales (JSON)</label>
            <textarea
              rows={6}
              value={form.prioridades_texto}
              onChange={(e) => setForm((prev) => ({ ...prev, prioridades_texto: e.target.value }))}
              className={`w-full rounded-lg border px-3 py-2.5 font-mono text-xs ${
                errors.prioridades ? 'border-red-300 bg-red-50/40' : 'border-buscoedu-border bg-white'
              }`}
            />
            {errors.prioridades ? <p className="text-xs text-red-600">{errors.prioridades}</p> : null}
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-buscoedu-text">Respuestas guiadas (JSON)</label>
            <textarea
              rows={6}
              value={form.respuestas_texto}
              onChange={(e) => setForm((prev) => ({ ...prev, respuestas_texto: e.target.value }))}
              className={`w-full rounded-lg border px-3 py-2.5 font-mono text-xs ${
                errors.respuestas ? 'border-red-300 bg-red-50/40' : 'border-buscoedu-border bg-white'
              }`}
            />
            {errors.respuestas ? <p className="text-xs text-red-600">{errors.respuestas}</p> : null}
          </div>

          <FormToggle
            label="Nota: la activación se hace solo al publicar la versión"
            checked={false}
            onChange={() => undefined}
            disabled
          />
        </form>
      </Modal>

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
