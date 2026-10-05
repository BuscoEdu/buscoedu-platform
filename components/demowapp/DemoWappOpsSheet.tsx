'use client';

import { useEffect, useState } from 'react';
import SessionList from './SessionList';
import ContextPanel from './ContextPanel';

interface Props {
  onCerrar: () => void;
  query: string;
  onQuery: (valor: string) => void;
  loading: boolean;
  sessions: any[];
  selectedId: string | null;
  onSelect: (oportunidadId: string) => void;
  detail: any;
  /** Alta QA. La página abre el hilo cuando el servidor responde 201. */
  onCrearQa: (etiqueta: string) => Promise<string | null>;
  creandoQa: boolean;
  errorQa: string;
}

/**
 * BA-030 / BA-033: operación del demo (sesiones, búsqueda y CRM).
 * Cubre el hilo por completo. No es una columna al lado del chat
 * ni un panel de Explorar.
 */
export default function DemoWappOpsSheet({
  onCerrar,
  query,
  onQuery,
  loading,
  sessions,
  selectedId,
  onSelect,
  detail,
  onCrearQa,
  creandoQa,
  errorQa
}: Props) {
  const [etiquetaQa, setEtiquetaQa] = useState('');
  useEffect(() => {
    const alTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alTeclar);
    return () => document.removeEventListener('keydown', alTeclar);
  }, [onCerrar]);

  return (
    <div
      className="absolute inset-0 z-20 flex min-h-0 flex-col bg-[#f4f6f8]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demowapp-ops-titulo"
    >
      {/* Encabezado de operación. Al cerrar, el estudiante vuelve al hilo solo. */}
      <header className="flex shrink-0 items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-full px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
        >
          Volver al chat
        </button>
        <div className="min-w-0">
          <h2 id="demowapp-ops-titulo" className="text-base font-semibold">
            Operación
          </h2>
          <p className="text-xs text-green-100">Simulación interna. No envía WhatsApp real.</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* Alta de hilo QA. Solo llega aquí quien ya pasó el guard de super admin. */}
        <form
          className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            void onCrearQa(etiquetaQa).then((id) => {
              if (id) setEtiquetaQa('');
            });
          }}
        >
          <p className="text-sm font-semibold text-amber-950">Nueva conversación QA</p>
          <p className="text-xs leading-relaxed text-amber-900">
            Abre un hilo de prueba. El lead, si el estudiante acepta, no sale a la universidad.
          </p>
          <label className="block text-sm text-gray-700">
            <span className="mb-1 block font-medium">Etiqueta</span>
            <input
              value={etiquetaQa}
              onChange={(evento) => setEtiquetaQa(evento.target.value)}
              placeholder="Corredor medicina"
              maxLength={80}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#075e54]"
            />
          </label>
          <button
            type="submit"
            disabled={creandoQa || etiquetaQa.trim().length < 2}
            className="min-h-11 rounded-full bg-amber-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {creandoQa ? 'Abriendo…' : 'Nueva conversación QA'}
          </button>
          {errorQa ? <p className="text-sm text-red-700" role="alert">{errorQa}</p> : null}
        </form>

        {/* Búsqueda de sesiones. Vive aquí, no junto al hilo del estudiante. */}
        <label className="block text-sm text-gray-700">
          <span className="mb-1 block font-medium">Buscar conversación</span>
          <input
            value={query}
            onChange={(evento) => onQuery(evento.target.value)}
            placeholder="Nombre, teléfono u oferta"
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#075e54]"
          />
        </label>

        {/* Listado de sesiones para elegir cuál hilo abrir. */}
        {loading ? (
          <p className="text-sm text-gray-500">Cargando conversaciones…</p>
        ) : (
          <SessionList
            sessions={sessions}
            selectedId={selectedId}
            onSelect={(id) => {
              onSelect(id);
              onCerrar();
            }}
          />
        )}

        {/* CRM de la oportunidad. Solo en esta hoja, nunca al lado del chat. */}
        {detail ? (
          <ContextPanel
            persona={detail.persona}
            oferta={detail.oferta}
            aplicacion={detail.aplicacion}
            contexto={detail.contexto}
            esQa={detail.esQa === true || detail.es_qa === true || detail.persona?.es_qa === true}
          />
        ) : (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
            Elige una conversación para ver el contexto. El estudiante no ve esta hoja.
          </p>
        )}
      </div>
    </div>
  );
}
