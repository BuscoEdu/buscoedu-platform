'use client';

import { FormEvent, useEffect, useState } from 'react';
import EstadoBadge from './EstadoBadge';

export interface ColumnaCatalogo {
  clave: string;
  etiqueta: string;
  render?: (fila: any) => React.ReactNode;
}

export interface CampoCatalogo {
  clave: string;
  etiqueta: string;
  tipo?: 'texto' | 'textarea' | 'select' | 'checkbox' | 'json';
  opciones?: { valor: string; etiqueta: string }[];
  requerido?: boolean;
  ayuda?: string;
  valorPorDefecto?: any;
}

async function pedirJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: 'no-store', ...init });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* noop */
  }
  return { ok: res.ok, data };
}

/**
 * Página genérica de catálogo del Centro de Agentes IA.
 * Lista registros, permite crearlos, editarlos y activar/desactivar (borrado lógico).
 */
export default function PaginaCatalogo({
  titulo,
  descripcion,
  endpoint,
  columnas,
  campos,
  textoNuevo = 'Nuevo registro'
}: {
  titulo: string;
  descripcion: string;
  endpoint: string;
  columnas: ColumnaCatalogo[];
  campos: CampoCatalogo[];
  textoNuevo?: string;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function formularioVacio() {
    const base: Record<string, any> = {};
    campos.forEach((c) => {
      base[c.clave] = c.valorPorDefecto ?? (c.tipo === 'checkbox' ? false : '');
    });
    return base;
  }

  const [form, setForm] = useState<Record<string, any>>(formularioVacio());

  async function cargar() {
    setLoading(true);
    const { data } = await pedirJson(endpoint);
    setItems(data?.items || []);
    setLoading(false);
  }

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function abrirCrear() {
    setEditandoId(null);
    setForm(formularioVacio());
    setError('');
    setModal(true);
  }

  function abrirEditar(fila: any) {
    setEditandoId(fila.id);
    const valores: Record<string, any> = {};
    campos.forEach((c) => {
      let v = fila[c.clave];
      if (c.tipo === 'json' && v != null && typeof v !== 'string') v = JSON.stringify(v, null, 2);
      valores[c.clave] = v ?? (c.tipo === 'checkbox' ? false : '');
    });
    setForm(valores);
    setError('');
    setModal(true);
  }

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError('');
    const url = editandoId ? `${endpoint}/${editandoId}` : endpoint;
    const metodo = editandoId ? 'PATCH' : 'POST';
    const { ok, data } = await pedirJson(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    setGuardando(false);
    if (!ok || !data?.ok) {
      setError(data?.error || 'No se pudo guardar el registro.');
      return;
    }
    setModal(false);
    await cargar();
  }

  async function alternarActivo(fila: any) {
    await pedirJson(`${endpoint}/${fila.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !fila.activo })
    });
    await cargar();
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-buscoedu-blue">{titulo}</h1>
          <p className="text-sm text-buscoedu-muted">{descripcion}</p>
        </div>
        <button
          onClick={abrirCrear}
          className="rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white hover:brightness-95"
        >
          {textoNuevo}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-buscoedu-border bg-white shadow-card">
        <table className="min-w-full text-sm">
          <thead className="bg-buscoedu-bg text-left text-xs uppercase tracking-wide text-buscoedu-muted">
            <tr>
              {columnas.map((c) => (
                <th key={c.clave} className="px-3 py-3">
                  {c.etiqueta}
                </th>
              ))}
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-buscoedu-border text-buscoedu-text">
            {loading ? (
              <tr>
                <td colSpan={columnas.length + 2} className="px-3 py-6 text-center text-buscoedu-muted">
                  Cargando...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={columnas.length + 2} className="px-3 py-6 text-center text-buscoedu-muted">
                  No hay registros.
                </td>
              </tr>
            ) : (
              items.map((fila) => (
                <tr key={fila.id} className={fila.activo === false ? 'opacity-50' : ''}>
                  {columnas.map((c) => (
                    <td key={c.clave} className="px-3 py-3">
                      {c.render ? c.render(fila) : (fila[c.clave] ?? '—')}
                    </td>
                  ))}
                  <td className="px-3 py-3">
                    <EstadoBadge estado={fila.activo === false ? 'inactivo' : fila.estado || 'activo'} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => abrirEditar(fila)}
                        className="rounded-md border border-buscoedu-border px-2.5 py-1 text-xs font-semibold hover:bg-buscoedu-bg"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => alternarActivo(fila)}
                        className="rounded-md border border-buscoedu-border px-2.5 py-1 text-xs font-semibold hover:bg-buscoedu-bg"
                      >
                        {fila.activo === false ? 'Activar' : 'Desactivar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-buscoedu-border bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-buscoedu-blue">
              {editandoId ? 'Editar registro' : textoNuevo}
            </h3>
            {error ? <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <form onSubmit={guardar} className="mt-3 space-y-3">
              {campos.map((campo) => (
                <label key={campo.clave} className="block text-sm">
                  {campo.tipo === 'checkbox' ? (
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(form[campo.clave])}
                        onChange={(e) => setForm((p) => ({ ...p, [campo.clave]: e.target.checked }))}
                      />
                      <span className="font-medium text-buscoedu-text">{campo.etiqueta}</span>
                    </span>
                  ) : (
                    <>
                      <span className="mb-1 block font-medium text-buscoedu-text">
                        {campo.etiqueta}
                        {campo.requerido ? ' *' : ''}
                      </span>
                      {campo.tipo === 'textarea' || campo.tipo === 'json' ? (
                        <textarea
                          value={form[campo.clave] ?? ''}
                          onChange={(e) => setForm((p) => ({ ...p, [campo.clave]: e.target.value }))}
                          required={campo.requerido}
                          rows={campo.tipo === 'json' ? 5 : 3}
                          className={`w-full rounded-lg border border-buscoedu-border px-3 py-2 ${
                            campo.tipo === 'json' ? 'font-mono text-xs' : ''
                          }`}
                        />
                      ) : campo.tipo === 'select' ? (
                        <select
                          value={form[campo.clave] ?? ''}
                          onChange={(e) => setForm((p) => ({ ...p, [campo.clave]: e.target.value }))}
                          className="w-full rounded-lg border border-buscoedu-border px-3 py-2"
                        >
                          <option value="">Seleccionar...</option>
                          {(campo.opciones || []).map((o) => (
                            <option key={o.valor} value={o.valor}>
                              {o.etiqueta}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={form[campo.clave] ?? ''}
                          onChange={(e) => setForm((p) => ({ ...p, [campo.clave]: e.target.value }))}
                          required={campo.requerido}
                          disabled={Boolean(editandoId) && campo.clave === 'codigo'}
                          className="w-full rounded-lg border border-buscoedu-border px-3 py-2 disabled:bg-buscoedu-bg"
                        />
                      )}
                      {campo.ayuda ? <span className="mt-1 block text-xs text-buscoedu-muted">{campo.ayuda}</span> : null}
                    </>
                  )}
                </label>
              ))}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  disabled={guardando}
                  className="rounded-md border border-buscoedu-border px-3 py-2 text-sm font-semibold disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="rounded-md bg-buscoedu-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
