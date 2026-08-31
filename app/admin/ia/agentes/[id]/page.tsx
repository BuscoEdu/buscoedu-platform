'use client';

import { FormEvent, use, useEffect, useState } from 'react';
import Link from 'next/link';
import EstadoBadge from '@/components/admin/ia/EstadoBadge';
import TablaEjecuciones, { EjecucionItem } from '@/components/admin/ia/TablaEjecuciones';

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

interface Agente {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  tipo_agente: string;
  objetivo: string | null;
  idioma_principal: string | null;
  entorno: string | null;
  estado: string;
  activo: boolean;
  version_activa?: { id?: string; numero_version?: string; estado?: string } | null;
}

interface Version {
  id: string;
  numero_version: string;
  nombre_version: string | null;
  estado: string;
  creado_en: string;
}

const PESTANAS = ['General', 'Versiones', 'Ejecuciones'] as const;
type Pestana = (typeof PESTANAS)[number];

export default function AgenteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [agente, setAgente] = useState<Agente | null>(null);
  const [versiones, setVersiones] = useState<Version[]>([]);
  const [ejecuciones, setEjecuciones] = useState<EjecucionItem[]>([]);
  const [pestana, setPestana] = useState<Pestana>('General');
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [form, setForm] = useState({ nombre: '', descripcion: '', objetivo: '', estado: 'activo' });
  const [nuevaVersion, setNuevaVersion] = useState('');
  const [creandoVersion, setCreandoVersion] = useState(false);

  async function cargar() {
    setLoading(true);
    const [a, v, e] = await Promise.all([
      pedirJson(`/api/admin/ia/agentes/${id}`),
      pedirJson(`/api/admin/ia/versiones?agente_id=${id}`),
      pedirJson(`/api/admin/ia/ejecuciones?agente_id=${id}&limite=100`)
    ]);
    const ag: Agente | null = a.data?.item || null;
    setAgente(ag);
    if (ag) {
      setForm({
        nombre: ag.nombre || '',
        descripcion: ag.descripcion || '',
        objetivo: ag.objetivo || '',
        estado: ag.estado || 'activo'
      });
    }
    setVersiones(v.data?.items || []);
    setEjecuciones(e.data?.items || []);
    setLoading(false);
  }

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function guardarGeneral(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setMensaje('');
    const { ok, data } = await pedirJson(`/api/admin/ia/agentes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    setGuardando(false);
    setMensaje(ok && data?.ok ? 'Cambios guardados.' : data?.error || 'No se pudo guardar.');
    if (ok && data?.ok) await cargar();
  }

  async function crearVersion(e: FormEvent) {
    e.preventDefault();
    if (!nuevaVersion.trim()) return;
    setCreandoVersion(true);
    const { ok, data } = await pedirJson('/api/admin/ia/versiones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agente_id: id, numero_version: nuevaVersion.trim() })
    });
    setCreandoVersion(false);
    if (ok && data?.ok) {
      setNuevaVersion('');
      await cargar();
    }
  }

  if (loading) {
    return <p className="text-sm text-buscoedu-muted">Cargando agente...</p>;
  }
  if (!agente) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-600">No se encontró el agente.</p>
        <Link href="/admin/ia/agentes" className="text-sm font-semibold text-buscoedu-blue hover:underline">
          ← Volver a agentes
        </Link>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div>
        <Link href="/admin/ia/agentes" className="text-sm font-semibold text-buscoedu-blue hover:underline">
          ← Agentes
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-buscoedu-blue">{agente.nombre}</h1>
          <EstadoBadge estado={agente.estado} />
          <span className="text-xs text-buscoedu-muted">{agente.codigo}</span>
        </div>
      </div>

      <div className="flex gap-1 border-b border-buscoedu-border">
        {PESTANAS.map((p) => (
          <button
            key={p}
            onClick={() => setPestana(p)}
            className={`px-4 py-2 text-sm font-semibold ${
              pestana === p
                ? 'border-b-2 border-buscoedu-blue text-buscoedu-blue'
                : 'text-buscoedu-muted hover:text-buscoedu-text'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {pestana === 'General' ? (
        <form onSubmit={guardarGeneral} className="max-w-2xl space-y-3 rounded-xl border border-buscoedu-border bg-white p-5 shadow-card">
          {mensaje ? <p className="rounded-md bg-buscoedu-bg px-3 py-2 text-sm text-buscoedu-text">{mensaje}</p> : null}
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-buscoedu-text">Nombre</span>
            <input value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} className="w-full rounded-lg border border-buscoedu-border px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-buscoedu-text">Descripción</span>
            <textarea value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} rows={2} className="w-full rounded-lg border border-buscoedu-border px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-buscoedu-text">Objetivo</span>
            <textarea value={form.objetivo} onChange={(e) => setForm((p) => ({ ...p, objetivo: e.target.value }))} rows={3} className="w-full rounded-lg border border-buscoedu-border px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-buscoedu-text">Estado</span>
            <select value={form.estado} onChange={(e) => setForm((p) => ({ ...p, estado: e.target.value }))} className="w-full rounded-lg border border-buscoedu-border px-3 py-2">
              <option value="activo">activo</option>
              <option value="pausado">pausado</option>
              <option value="archivado">archivado</option>
            </select>
          </label>
          <div className="flex justify-end">
            <button type="submit" disabled={guardando} className="rounded-md bg-buscoedu-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {guardando ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      ) : null}

      {pestana === 'Versiones' ? (
        <div className="space-y-4">
          <form onSubmit={crearVersion} className="flex flex-wrap items-end gap-2 rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-buscoedu-text">Nueva versión (número)</span>
              <input value={nuevaVersion} onChange={(e) => setNuevaVersion(e.target.value)} placeholder="Ej: 1.1" className="rounded-lg border border-buscoedu-border px-3 py-2" />
            </label>
            <button type="submit" disabled={creandoVersion} className="rounded-md bg-buscoedu-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {creandoVersion ? 'Creando...' : 'Crear versión borrador'}
            </button>
          </form>

          <div className="overflow-x-auto rounded-xl border border-buscoedu-border bg-white shadow-card">
            <table className="min-w-full text-sm">
              <thead className="bg-buscoedu-bg text-left text-xs uppercase tracking-wide text-buscoedu-muted">
                <tr>
                  <th className="px-3 py-3">Versión</th>
                  <th className="px-3 py-3">Nombre</th>
                  <th className="px-3 py-3">Estado</th>
                  <th className="px-3 py-3">Creada</th>
                  <th className="px-3 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-buscoedu-border text-buscoedu-text">
                {versiones.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-buscoedu-muted">No hay versiones.</td>
                  </tr>
                ) : (
                  versiones.map((v) => (
                    <tr key={v.id} className={agente.version_activa?.id === v.id ? 'bg-emerald-50/40' : ''}>
                      <td className="px-3 py-3 font-medium">
                        v{v.numero_version}
                        {agente.version_activa?.id === v.id ? <span className="ml-2 text-xs text-emerald-700">(activa)</span> : null}
                      </td>
                      <td className="px-3 py-3">{v.nombre_version || '—'}</td>
                      <td className="px-3 py-3"><EstadoBadge estado={v.estado} /></td>
                      <td className="px-3 py-3 text-xs text-buscoedu-muted">{new Date(v.creado_en).toLocaleDateString('es-CO')}</td>
                      <td className="px-3 py-3">
                        <Link href={`/admin/ia/versiones/${v.id}`} className="rounded-md border border-buscoedu-border px-2.5 py-1 text-xs font-semibold hover:bg-buscoedu-bg">
                          {v.estado === 'borrador' ? 'Editar' : 'Ver'}
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {pestana === 'Ejecuciones' ? <TablaEjecuciones items={ejecuciones} /> : null}
    </section>
  );
}
