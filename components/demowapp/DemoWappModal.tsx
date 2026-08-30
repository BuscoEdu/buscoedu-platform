'use client';

import { useEffect, useState } from 'react';
import DemoWappPanel from './DemoWappPanel';

interface Props {
  token: string;
  abierto: boolean;
  autoOpenDelayMs?: number;
  onCerrar: () => void;
}

export default function DemoWappModal({ token, abierto, autoOpenDelayMs = 5000, onCerrar }: Props) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [error, setError] = useState('');

  const cargar = async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/demowapp/estudiante/${encodeURIComponent(token)}`, { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) {
        setError('No pudimos abrir esta sesión. Intenta nuevamente desde la confirmación.');
        return;
      }
      setSession(data.session);
    } catch {
      setError('Error de conexión al cargar la conversación.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!abierto) {
      setVisible(false);
      return;
    }

    const t = setTimeout(() => {
      setVisible(true);
      void cargar();
    }, autoOpenDelayMs);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, token, autoOpenDelayMs]);

  useEffect(() => {
    if (!visible) return;
    const interval = window.setInterval(() => void cargar(), 5000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, token]);

  const enviar = async (texto: string, clientMessageId: string) => {
    const res = await fetch(`/api/demowapp/estudiante/${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto, clientMessageId })
    });

    const data = await res.json();
    if (!data.ok) {
      throw new Error(data.error || 'No se pudo enviar');
    }

    await cargar();
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-2 sm:items-center sm:p-6">
      <div className="h-[88vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <p className="font-semibold text-gray-900">NaIA · BuscoEdu</p>
            <p className="text-xs text-gray-500">Simulación de conversación (no es WhatsApp real)</p>
          </div>
          <button
            onClick={onCerrar}
            className="rounded-lg border border-gray-200 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
          >
            Cerrar
          </button>
        </div>

        {loading && <div className="p-4 text-sm text-gray-500">Cargando conversación...</div>}
        {error && <div className="p-4 text-sm text-red-600">{error}</div>}

        {session && (
          <div className="p-3">
            <DemoWappPanel
              titulo={session.nombre || 'Estudiante'}
              subtitulo={`Oferta: ${session.oferta || 'Oferta'} · NaIA · BuscoEdu`}
              mensajes={session.mensajes || []}
              onEnviar={enviar}
            />
          </div>
        )}
      </div>
    </div>
  );
}
