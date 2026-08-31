'use client';

import { useEffect, useState } from 'react';
import TablaEjecuciones, { EjecucionItem } from '@/components/admin/ia/TablaEjecuciones';
import CajaAyuda from '@/components/admin/CajaAyuda';

async function getJson(url: string) {
  const res = await fetch(url, { cache: 'no-store' });
  try {
    return await res.json();
  } catch {
    return null;
  }
}

interface OpcionSimple {
  id: string;
  nombre: string;
  codigo: string;
}

export default function EjecucionesPage() {
  const [items, setItems] = useState<EjecucionItem[]>([]);
  const [agentes, setAgentes] = useState<OpcionSimple[]>([]);
  const [canales, setCanales] = useState<OpcionSimple[]>([]);
  const [loading, setLoading] = useState(true);

  const [filtros, setFiltros] = useState({ agente_id: '', canal_id: '', estado: '', desde: '', hasta: '' });

  async function cargar() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtros.agente_id) params.set('agente_id', filtros.agente_id);
    if (filtros.canal_id) params.set('canal_id', filtros.canal_id);
    if (filtros.estado) params.set('estado', filtros.estado);
    if (filtros.desde) params.set('desde', new Date(filtros.desde).toISOString());
    if (filtros.hasta) params.set('hasta', new Date(filtros.hasta).toISOString());
    params.set('limite', '200');
    const data = await getJson(`/api/admin/ia/ejecuciones?${params.toString()}`);
    setItems(data?.items || []);
    setLoading(false);
  }

  useEffect(() => {
    async function inicial() {
      const [a, c] = await Promise.all([getJson('/api/admin/ia/agentes'), getJson('/api/admin/ia/canales')]);
      setAgentes(a?.items || []);
      setCanales(c?.items || []);
      await cargar();
    }
    void inicial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="space-y-5">
      <CajaAyuda titulo="Historial de ejecuciones">
        <p>
          Cada vez que un usuario le escribe a NaIA, se registra una
          &quot;ejecución&quot; aquí. Puedes ver si fue exitosa o si hubo un error,
          cuánto tardó en responder y qué respondió exactamente. Úsalo para detectar
          problemas o medir el desempeño.
        </p>
      </CajaAyuda>
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Ejecuciones</h1>
        <p className="text-sm text-buscoedu-muted">Historial de ejecuciones de los agentes (solo lectura).</p>
      </div>

      <div className="rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-buscoedu-text">Agente</span>
            <select
              value={filtros.agente_id}
              onChange={(e) => setFiltros((p) => ({ ...p, agente_id: e.target.value }))}
              className="w-full rounded-lg border border-buscoedu-border px-3 py-2"
            >
              <option value="">Todos</option>
              {agentes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-buscoedu-text">Canal</span>
            <select
              value={filtros.canal_id}
              onChange={(e) => setFiltros((p) => ({ ...p, canal_id: e.target.value }))}
              className="w-full rounded-lg border border-buscoedu-border px-3 py-2"
            >
              <option value="">Todos</option>
              {canales.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-buscoedu-text">Estado</span>
            <select
              value={filtros.estado}
              onChange={(e) => setFiltros((p) => ({ ...p, estado: e.target.value }))}
              className="w-full rounded-lg border border-buscoedu-border px-3 py-2"
            >
              <option value="">Todos</option>
              <option value="exitoso">Exitoso</option>
              <option value="fallback">Fallback</option>
              <option value="error">Error</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-buscoedu-text">Desde</span>
            <input
              type="date"
              value={filtros.desde}
              onChange={(e) => setFiltros((p) => ({ ...p, desde: e.target.value }))}
              className="w-full rounded-lg border border-buscoedu-border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-buscoedu-text">Hasta</span>
            <input
              type="date"
              value={filtros.hasta}
              onChange={(e) => setFiltros((p) => ({ ...p, hasta: e.target.value }))}
              className="w-full rounded-lg border border-buscoedu-border px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => void cargar()}
            className="rounded-lg bg-buscoedu-blue px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
          >
            Aplicar filtros
          </button>
        </div>
      </div>

      <TablaEjecuciones items={items} loading={loading} />
    </section>
  );
}
