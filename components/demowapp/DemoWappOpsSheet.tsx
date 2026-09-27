'use client';

import { useEffect } from 'react';
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
  detail
}: Props) {
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
        {/* Búsqueda de sesiones. Vive aquí, no junto al hilo del estudiante. */}
        <label className="block text-sm text-gray-700">
          <span className="mb-1 block font-medium">Buscar conversación</span>
          <input
            value={query}
            onChange={(evento) => onQuery(evento.target.value)}
            placeholder="Nombre, celular u oferta"
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
