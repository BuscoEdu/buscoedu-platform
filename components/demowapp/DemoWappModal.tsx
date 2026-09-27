'use client';

import { useEffect, useState } from 'react';
import DemoWappPanel from './DemoWappPanel';

interface Props {
  token: string;
  abierto: boolean;
  autoOpenDelayMs?: number;
  onCerrar: () => void;
}

/**
 * BA-033: canal del estudiante a pantalla completa.
 * No es un modal con marco de portal, ni un acceso a Explorar.
 */
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
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const interval = window.setInterval(() => void cargar(), 5000);
    return () => {
      document.body.style.overflow = previo;
      window.clearInterval(interval);
    };
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

  const avisoHilo = error ? error : loading && !session ? 'Cargando la conversación…' : null;

  return (
    /* BA-033: el canal cubre móvil y escritorio. No hay ficha ni columnas alrededor. */
    <div className="fixed inset-0 z-[80] flex h-dvh min-h-0 flex-col bg-[#0b141a]">
      <DemoWappPanel
        soloHilo
        titulo="NaIA"
        subtitulo="en línea"
        mensajes={session?.mensajes || []}
        onEnviar={enviar}
        disabled={!session}
        onCerrar={onCerrar}
        ofertaNombre={session?.oferta || null}
        avisoHilo={avisoHilo}
      />
    </div>
  );
}
