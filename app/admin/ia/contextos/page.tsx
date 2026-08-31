'use client';

import { useEffect, useState } from 'react';
import EstadoBadge from '@/components/admin/ia/EstadoBadge';
import FormularioContexto, { ContextoFormValores } from '@/components/admin/ia/FormularioContexto';
import CajaAyuda from '@/components/admin/CajaAyuda';

interface ContextoItem extends ContextoFormValores {
  id: string;
  activo: boolean;
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

export default function ContextosPage() {
  const [items, setItems] = useState<ContextoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<ContextoItem | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  async function cargar() {
    setLoading(true);
    const { data } = await pedirJson('/api/admin/ia/contextos');
    setItems(data?.items || []);
    setLoading(false);
  }

  useEffect(() => {
    void cargar();
  }, []);

  function abrirCrear() {
    setEditando(null);
    setError('');
    setModal(true);
  }

  function abrirEditar(item: ContextoItem) {
    setEditando(item);
    setError('');
    setModal(true);
  }

  async function guardar(valores: ContextoFormValores) {
    setGuardando(true);
    setError('');
    const url = editando ? `/api/admin/ia/contextos/${editando.id}` : '/api/admin/ia/contextos';
    const metodo = editando ? 'PATCH' : 'POST';
    const { ok, data } = await pedirJson(url, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(valores)
    });
    setGuardando(false);
    if (!ok || !data?.ok) {
      setError(data?.error || 'No se pudo guardar el componente.');
      return;
    }
    setModal(false);
    await cargar();
  }

  async function alternarActivo(item: ContextoItem) {
    await pedirJson(`/api/admin/ia/contextos/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !item.activo })
    });
    await cargar();
  }

  return (
    <section className="space-y-5">
      <CajaAyuda titulo="¿Qué son los contextos?">
        <p>
          Los contextos son los &quot;bloques de personalidad&quot; del agente.
          Piénsalo como las instrucciones que le das a un empleado nuevo antes de su
          primer día. Hay contextos de identidad (quién es), personalidad (cómo
          habla), reglas de negocio (qué puede ofrecer) y formato (cómo debe
          responder). Puedes editar el texto de cada contexto aquí y luego asignarlo
          a una versión del agente.
        </p>
      </CajaAyuda>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-buscoedu-blue">Componentes de contexto</h1>
          <p className="text-sm text-buscoedu-muted">
            Bloques reutilizables de instrucciones (identidad, personalidad, reglas, seguridad, formato) que componen el
            prompt de los agentes.
          </p>
        </div>
        <button
          onClick={abrirCrear}
          className="rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white hover:brightness-95"
        >
          Nuevo componente
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-buscoedu-border bg-white shadow-card">
        <table className="min-w-full text-sm">
          <thead className="bg-buscoedu-bg text-left text-xs uppercase tracking-wide text-buscoedu-muted">
            <tr>
              <th className="px-3 py-3">Nombre</th>
              <th className="px-3 py-3">Código</th>
              <th className="px-3 py-3">Tipo</th>
              <th className="px-3 py-3">Prioridad</th>
              <th className="px-3 py-3">Obligatorio</th>
              <th className="px-3 py-3">Estado</th>
              <th className="px-3 py-3">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-buscoedu-border text-buscoedu-text">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-buscoedu-muted">
                  Cargando...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-buscoedu-muted">
                  No hay componentes de contexto.
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} className={it.activo === false ? 'opacity-50' : ''}>
                  <td className="px-3 py-3 font-medium">{it.nombre}</td>
                  <td className="px-3 py-3 text-xs text-buscoedu-muted">{it.codigo}</td>
                  <td className="px-3 py-3">{it.tipo_contexto}</td>
                  <td className="px-3 py-3">{it.prioridad}</td>
                  <td className="px-3 py-3">{it.es_obligatorio ? 'Sí' : 'No'}</td>
                  <td className="px-3 py-3">
                    <EstadoBadge estado={it.activo === false ? 'inactivo' : it.estado || 'activo'} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => abrirEditar(it)}
                        className="rounded-md border border-buscoedu-border px-2.5 py-1 text-xs font-semibold hover:bg-buscoedu-bg"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => alternarActivo(it)}
                        className="rounded-md border border-buscoedu-border px-2.5 py-1 text-xs font-semibold hover:bg-buscoedu-bg"
                      >
                        {it.activo === false ? 'Activar' : 'Desactivar'}
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
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-buscoedu-border bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-buscoedu-blue">
              {editando ? 'Editar componente de contexto' : 'Nuevo componente de contexto'}
            </h3>
            {error ? <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <div className="mt-3">
              <FormularioContexto
                inicial={editando || undefined}
                editando={Boolean(editando)}
                guardando={guardando}
                onGuardar={guardar}
                onCancelar={() => setModal(false)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
