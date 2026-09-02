'use client';

import { useEffect, useRef, useState } from 'react';
import DemoWappPanel from '@/components/demowapp/DemoWappPanel';

export default function OpportunityWappPanel({ oportunidadId }: { oportunidadId: string }) {
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const polling = useRef(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/demowapp/sesiones/${oportunidadId}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        setDetail(null);
        setError(data.error === 'aplicacion_no_encontrada' ? 'Esta oportunidad aún no tiene una aplicación para simular por WhatsApp.' : 'No se pudo cargar la conversación de WhatsApp.');
        return;
      }
      setDetail(data.detalle);
      setError('');
    } catch {
      setError('No se pudo cargar la conversación de WhatsApp.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      if (polling.current) return;
      polling.current = true;
      void (async () => {
        try {
          await fetch('/api/demowapp/push/procesar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oportunidadId })
          });
          await load(true);
        } finally {
          polling.current = false;
        }
      })();
    }, 5000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oportunidadId]);

  const onSend = async (texto: string, clientMessageId: string) => {
    const response = await fetch(`/api/demowapp/sesiones/${oportunidadId}/mensaje`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto, clientMessageId })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'No se pudo enviar el mensaje.');
    const nuevos = [data.result?.inbound, data.result?.outbound].filter(Boolean);
    if (nuevos.length) {
      setDetail((actual: any) => {
        if (!actual) return actual;
        const porId = new Map<string, any>();
        [...(actual.mensajes || []), ...nuevos].forEach((mensaje: any) => porId.set(mensaje.id, mensaje));
        return { ...actual, mensajes: Array.from(porId.values()) };
      });
    }
    void load(true);
  };

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <h2 className="text-base font-semibold text-gray-900">Conversación WhatsApp</h2>
        <p className="text-xs text-gray-500">Simulación interna de NaIA; no envía mensajes reales.</p>
      </div>
      {loading ? <p className="text-sm text-gray-500">Cargando conversación…</p> : null}
      {!loading && error ? <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{error}</p> : null}
      {!loading && detail ? (
        <DemoWappPanel
          titulo={[detail.persona?.nombres, detail.persona?.apellidos].filter(Boolean).join(' ') || 'Estudiante'}
          subtitulo={`NaIA · ${detail.oferta?.nombre_oferta || 'Oferta'} · ${detail.contexto?.etapa || 'Etapa'}`}
          mensajes={detail.mensajes || []}
          onEnviar={onSend}
        />
      ) : null}
    </section>
  );
}
