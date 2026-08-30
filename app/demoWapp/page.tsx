'use client';

import { useEffect, useMemo, useState } from 'react';
import SessionList from '@/components/demowapp/SessionList';
import DemoWappPanel from '@/components/demowapp/DemoWappPanel';
import ContextPanel from '@/components/demowapp/ContextPanel';
import WhatsAppMark from '@/components/demowapp/WhatsAppMark';

export default function DemoWappPage() {
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const loadSessions = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/demowapp/sesiones', { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) {
        setError('No fue posible cargar sesiones. Verifica permisos de super_admin.');
        return;
      }
      setSessions(data.items || []);
    } catch {
      setError('Error de red al cargar sesiones.');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (oportunidadId: string, silent = false) => {
    setSelectedId(oportunidadId);
    if (!silent) setLoadingDetail(true);
    try {
      const res = await fetch(`/api/demowapp/sesiones/${oportunidadId}`, { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) {
        setError('No se pudo cargar el detalle de la sesión.');
        return;
      }
      setDetail(data.detalle);
    } catch {
      setError('Error de red al cargar el detalle.');
    } finally {
      if (!silent) setLoadingDetail(false);
    }
  };

  const handleStart = async () => {
    setStarted(true);
    await loadSessions();
  };

  const onSend = async (texto: string, clientMessageId: string) => {
    if (!selectedId) return;
    setError('');
    try {
      const res = await fetch(`/api/demowapp/sesiones/${selectedId}/mensaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, clientMessageId })
      });

      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'No se pudo enviar');

      await fetch('/api/demowapp/push/procesar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oportunidadId: selectedId })
      });
      await loadDetail(selectedId);
      await loadSessions();
    } catch (e: any) {
      setError(`No se pudo enviar el mensaje: ${e?.message || 'error desconocido'}`);
      throw e;
    }
  };

  useEffect(() => {
    if (!selectedId) return;
    const interval = window.setInterval(() => {
      void (async () => {
        await fetch('/api/demowapp/push/procesar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oportunidadId: selectedId })
        });
        await loadDetail(selectedId, true);
        await loadSessions();
      })();
    }, 5000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const filteredSessions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sessions;
    return sessions.filter((s) =>
      [s.nombre, s.celular, s.oferta, s.etapa, s.subestado].join(' ').toLowerCase().includes(term)
    );
  }, [query, sessions]);

  if (!started) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <WhatsAppMark className="h-9 w-9" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Demo WApp</h1>
          <p className="mt-2 text-sm text-gray-500">
            Simulación interna de conversación. No envía mensajes por WhatsApp.
          </p>
          <button
            onClick={() => void handleStart()}
            className="mt-6 rounded-xl bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700"
          >
            Iniciar sesión
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-4 p-4">
      <header className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2"><WhatsAppMark /><h1 className="text-xl font-bold text-gray-900">Demo WApp</h1></div>
        <p className="text-xs text-gray-500">NaIA · BuscoEdu · Simulación interna</p>
      </header>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr_320px]">
        <section className="space-y-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrar por nombre, celular, oferta..."
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />
          {loading ? (
            <p className="text-sm text-gray-500">Cargando sesiones...</p>
          ) : (
            <SessionList
              sessions={filteredSessions}
              selectedId={selectedId}
              onSelect={(id) => {
                void loadDetail(id);
              }}
            />
          )}
        </section>

        <section>
          {loadingDetail && <p className="text-sm text-gray-500">Cargando conversación...</p>}
          {detail && (
            <DemoWappPanel
              titulo={[detail.persona?.nombres, detail.persona?.apellidos].filter(Boolean).join(' ') || 'Estudiante'}
              subtitulo={`NaIA · ${detail.oferta?.nombre || 'Oferta'} · ${detail.contexto?.etapa || 'Etapa'}`}
              mensajes={detail.mensajes || []}
              onEnviar={onSend}
            />
          )}
          {!detail && !loadingDetail && (
            <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-500">
              Selecciona una sesión para abrir el chat.
            </div>
          )}
        </section>

        <section>{detail && <ContextPanel persona={detail.persona} oferta={detail.oferta} aplicacion={detail.aplicacion} contexto={detail.contexto} />}</section>
      </div>
    </main>
  );
}
