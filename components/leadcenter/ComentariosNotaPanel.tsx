'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type Comentario = {
  id: string;
  contenido: string;
  creado_en: string;
  autor_nombre?: string;
};

function fecha(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ComentariosNotaPanel({
  oportunidadId,
  personaId,
  notaInicial,
  comentariosIniciales,
  puedeEditarNota
}: {
  oportunidadId: string;
  personaId: string;
  notaInicial?: string | null;
  comentariosIniciales: Comentario[];
  puedeEditarNota: boolean;
}) {
  const router = useRouter();

  const [nota, setNota] = useState(notaInicial || '');
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [msgNota, setMsgNota] = useState('');

  const [comentarios, setComentarios] = useState<Comentario[]>(comentariosIniciales || []);
  const [comentarioNuevo, setComentarioNuevo] = useState('');
  const [guardandoComentario, setGuardandoComentario] = useState(false);
  const [msgComentario, setMsgComentario] = useState('');

  const totalComentarios = useMemo(() => comentarios.length, [comentarios]);

  async function guardarNota() {
    if (!puedeEditarNota) return;
    setGuardandoNota(true);
    setMsgNota('');
    try {
      const res = await fetch(`/api/leadcenter/oportunidad/${oportunidadId}/nota`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota })
      });
      const data = await res.json();
      if (!data.ok) {
        setMsgNota(data.error === 'forbidden' ? 'No tienes permisos para editar la nota.' : 'No se pudo guardar la nota.');
        return;
      }
      setMsgNota('Nota interna actualizada.');
      router.refresh();
    } catch {
      setMsgNota('Error de red al guardar la nota.');
    } finally {
      setGuardandoNota(false);
    }
  }

  async function agregarComentario() {
    if (!comentarioNuevo.trim()) {
      setMsgComentario('Escribe un comentario antes de guardar.');
      return;
    }

    setGuardandoComentario(true);
    setMsgComentario('');
    try {
      const res = await fetch(`/api/leadcenter/oportunidad/${oportunidadId}/comentarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaId, contenido: comentarioNuevo.trim() })
      });
      const data = await res.json();
      if (!data.ok) {
        setMsgComentario(data.error === 'forbidden' ? 'No tienes permisos para comentar esta oportunidad.' : 'No se pudo guardar el comentario.');
        return;
      }

      setComentarios((prev) => [data.item, ...prev]);
      setComentarioNuevo('');
      setMsgComentario('Comentario registrado.');
      router.refresh();
    } catch {
      setMsgComentario('Error de red al guardar el comentario.');
    } finally {
      setGuardandoComentario(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-base font-semibold text-gray-900">Nota interna</h2>
        <p className="mb-2 text-xs text-gray-500">
          Campo único de contexto interno de la oportunidad (separado de comentarios de gestión).
        </p>
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={4}
          disabled={!puedeEditarNota}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          placeholder="Agregar nota interna de contexto..."
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={guardarNota}
            disabled={!puedeEditarNota || guardandoNota}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {guardandoNota ? 'Guardando…' : 'Guardar nota'}
          </button>
          {msgNota && <p className="text-xs text-gray-600">{msgNota}</p>}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Comentarios de gestión</h2>
          <span className="text-xs text-gray-500">{totalComentarios} comentarios</span>
        </div>

        <div className="space-y-2">
          <textarea
            value={comentarioNuevo}
            onChange={(e) => setComentarioNuevo(e.target.value)}
            rows={3}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-blue-500"
            placeholder="Registrar comentario de gestión..."
          />
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={agregarComentario}
              disabled={guardandoComentario}
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {guardandoComentario ? 'Guardando…' : 'Agregar comentario'}
            </button>
            {msgComentario && <p className="text-xs text-gray-600">{msgComentario}</p>}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {comentarios.length === 0 && (
            <p className="text-sm text-gray-500">Aún no hay comentarios de gestión.</p>
          )}
          {comentarios.map((c) => (
            <article key={c.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <p className="whitespace-pre-line text-sm text-gray-700">{c.contenido}</p>
              <p className="mt-2 text-xs text-gray-500">
                {c.autor_nombre || 'Usuario interno'} · {fecha(c.creado_en)}
              </p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
