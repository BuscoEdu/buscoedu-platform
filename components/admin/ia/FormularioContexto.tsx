'use client';

import { FormEvent, useEffect, useState } from 'react';

export interface ContextoFormValores {
  codigo: string;
  nombre: string;
  tipo_contexto: string;
  contenido: string;
  prioridad: number;
  es_obligatorio: boolean;
  version: string;
  estado: string;
}

const VACIO: ContextoFormValores = {
  codigo: '',
  nombre: '',
  tipo_contexto: 'identidad',
  contenido: '',
  prioridad: 100,
  es_obligatorio: false,
  version: '1.0',
  estado: 'activo'
};

const TIPOS = [
  'identidad',
  'personalidad',
  'objetivo',
  'regla_negocio',
  'seguridad',
  'canal',
  'formato_respuesta'
];

/**
 * Formulario para crear/editar un componente de contexto.
 */
export default function FormularioContexto({
  inicial,
  editando,
  guardando,
  onGuardar,
  onCancelar
}: {
  inicial?: Partial<ContextoFormValores>;
  editando: boolean;
  guardando: boolean;
  onGuardar: (valores: ContextoFormValores) => void;
  onCancelar: () => void;
}) {
  const [form, setForm] = useState<ContextoFormValores>({ ...VACIO, ...inicial });

  useEffect(() => {
    setForm({ ...VACIO, ...inicial });
  }, [inicial]);

  function submit(e: FormEvent) {
    e.preventDefault();
    onGuardar(form);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-buscoedu-text">Código</span>
          <input
            value={form.codigo}
            onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))}
            disabled={editando}
            required
            className="w-full rounded-lg border border-buscoedu-border px-3 py-2 disabled:bg-buscoedu-bg"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-buscoedu-text">Nombre</span>
          <input
            value={form.nombre}
            onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
            required
            className="w-full rounded-lg border border-buscoedu-border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-buscoedu-text">Tipo de contexto</span>
          <select
            value={form.tipo_contexto}
            onChange={(e) => setForm((p) => ({ ...p, tipo_contexto: e.target.value }))}
            className="w-full rounded-lg border border-buscoedu-border px-3 py-2"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-buscoedu-text">Prioridad</span>
          <input
            type="number"
            value={form.prioridad}
            onChange={(e) => setForm((p) => ({ ...p, prioridad: Number(e.target.value) }))}
            className="w-full rounded-lg border border-buscoedu-border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-buscoedu-text">Versión</span>
          <input
            value={form.version}
            onChange={(e) => setForm((p) => ({ ...p, version: e.target.value }))}
            className="w-full rounded-lg border border-buscoedu-border px-3 py-2"
          />
        </label>
        <label className="flex items-center gap-2 pt-6 text-sm">
          <input
            type="checkbox"
            checked={form.es_obligatorio}
            onChange={(e) => setForm((p) => ({ ...p, es_obligatorio: e.target.checked }))}
          />
          <span className="font-medium text-buscoedu-text">Es obligatorio</span>
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-buscoedu-text">Contenido</span>
        <textarea
          value={form.contenido}
          onChange={(e) => setForm((p) => ({ ...p, contenido: e.target.value }))}
          rows={8}
          required
          className="w-full rounded-lg border border-buscoedu-border px-3 py-2 font-mono text-xs"
        />
      </label>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancelar}
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
          {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Crear componente'}
        </button>
      </div>
    </form>
  );
}
