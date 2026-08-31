'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import EstadoBadge from '@/components/admin/ia/EstadoBadge';

interface AgenteItem {
  id: string;
  codigo: string;
  nombre: string;
  tipo_agente: string;
  estado: string;
  activo: boolean;
  version_activa?: { numero_version?: string } | null;
}

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: 'no-store', ...init });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* noop */
  }
  return { ok: res.ok, data };
}

export default function AgentesPage() {
  const [items, setItems] = useState<AgenteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ codigo: '', nombre: '', tipo_agente: 'asesor_educativo', objetivo: '' });

  async function cargar() {
    setLoading(true);
    const { data } = await getJson('/api/admin/ia/agentes');
    setItems(data?.items || []);
    setLoading(false);
  }

  useEffect(() => {
    void cargar();
  }, []);

  async function crear(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setError('');
    const { ok, data } = await getJson('/api/admin/ia/agentes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    setGuardando(false);
    if (!ok || !data?.ok) {
      setError(data?.error || 'No se pudo crear el agente.');
      return;
    }
    setModal(false);
    setForm({ codigo: '', nombre: '', tipo_agente: 'asesor_educativo', objetivo: '' });
    await cargar();
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-buscoedu-blue">Agentes IA</h1>
          <p className="text-sm text-buscoedu-muted">Listado de agentes configurables del Centro de Agentes IA.</p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white hover:brightness-95"
        >
          Nuevo agente
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-buscoedu-border bg-white shadow-card">
        <table className="min-w-full text-sm">
          <thead className="bg-buscoedu-bg text-left text-xs uppercase tracking-wide text-buscoedu-muted">
            <tr>
              <th className="px-3 py-3">Nombre</th>
              <th className="px-3 py-3">Código</th>
              <th className="px-3 py-3">Tipo</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3">Versión activa</th>
              <th className="px-3 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-buscoedu-border text-buscoedu-text">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-buscoedu-muted">Cargando agentes...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-buscoedu-muted">No hay agentes.</td>
              </tr>
            ) : (
              items.map((a) => (
                <tr key={a.id}>
                  <td className="px-3 py-3 font-medium">{a.nombre}</td>
                  <td className="px-3 py-3 text-xs text-buscoedu-muted">{a.codigo}</td>
                  <td className="px-3 py-3">{a.tipo_agente}</td>
                  <td className="px-3 py-3"><EstadoBadge estado={a.estado} /></td>
                  <td className="px-3 py-3">{a.version_activa?.numero_version ? `v${a.version_activa.numero_version}` : '—'}</td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/admin/ia/agentes/${a.id}`}
                      className="rounded-md border border-buscoedu-border px-2.5 py-1 text-xs font-semibold hover:bg-buscoedu-bg"
                    >
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl border border-buscoedu-border bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-buscoedu-blue">Nuevo agente</h3>
            {error ? <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <form onSubmit={crear} className="mt-3 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-buscoedu-text">Código</span>
                <input required value={form.codigo} onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))} className="w-full rounded-lg border border-buscoedu-border px-3 py-2" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-buscoedu-text">Nombre</span>
                <input required value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} className="w-full rounded-lg border border-buscoedu-border px-3 py-2" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-buscoedu-text">Tipo de agente</span>
                <input value={form.tipo_agente} onChange={(e) => setForm((p) => ({ ...p, tipo_agente: e.target.value }))} className="w-full rounded-lg border border-buscoedu-border px-3 py-2" />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-buscoedu-text">Objetivo</span>
                <textarea value={form.objetivo} onChange={(e) => setForm((p) => ({ ...p, objetivo: e.target.value }))} rows={3} className="w-full rounded-lg border border-buscoedu-border px-3 py-2" />
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setModal(false)} disabled={guardando} className="rounded-md border border-buscoedu-border px-3 py-2 text-sm font-semibold disabled:opacity-60">Cancelar</button>
                <button type="submit" disabled={guardando} className="rounded-md bg-buscoedu-blue px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">{guardando ? 'Guardando...' : 'Crear agente'}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}
