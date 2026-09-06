'use client';

import { useEffect, useRef, useState } from 'react';
import DemoWappPanel from '@/components/demowapp/DemoWappPanel';

export default function OpportunityWappPanel({
  oportunidadId,
  celular,
  correo
}: {
  oportunidadId: string;
  celular?: string | null;
  correo?: string | null;
}) {
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [abierta, setAbierta] = useState(false);
  const [minimizada, setMinimizada] = useState(false);
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
    if (!abierta) return;
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
  }, [oportunidadId, abierta]);

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

  const abrirWhatsApp = () => {
    setMinimizada(false);
    setAbierta(true);
  };

  return <>
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3"><h2 className="text-base font-semibold text-gray-900">Canales</h2><p className="text-xs text-gray-500">Abre el canal de trabajo sin salir de la oportunidad.</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={abrirWhatsApp} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">WhatsApp</button>
        {celular ? <a href={`tel:${celular}`} className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Llamada</a> : <button disabled className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-400">Llamada</button>}
        {correo ? <a href={`mailto:${correo}`} className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Email</a> : <button disabled className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-400">Email</button>}
      </div>
    </section>

    {abierta && !minimizada && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 p-4" role="dialog" aria-modal="true" aria-label="Conversación de WhatsApp">
      <section className="flex h-[min(720px,calc(100vh-4rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3"><div><h2 className="font-semibold text-gray-900">Conversación WhatsApp</h2><p className="text-xs text-gray-500">Simulación interna de NaIA; no envía mensajes reales.</p></div><div className="flex gap-2"><button type="button" onClick={() => setMinimizada(true)} className="rounded-lg border border-gray-300 px-2.5 py-1 text-sm text-gray-600">Minimizar</button><button type="button" onClick={() => { setAbierta(false); setMinimizada(false); }} className="rounded-lg border border-gray-300 px-2.5 py-1 text-sm text-gray-600">Cerrar</button></div></header>
        <div className="min-h-0 flex-1 overflow-hidden p-4">{loading ? <p className="text-sm text-gray-500">Cargando conversación…</p> : null}{!loading && error ? <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">{error}</p> : null}{!loading && detail ? <DemoWappPanel titulo={[detail.persona?.nombres, detail.persona?.apellidos].filter(Boolean).join(' ') || 'Estudiante'} subtitulo={`NaIA · ${detail.oferta?.nombre_oferta || 'Oferta'} · ${detail.contexto?.etapa || 'Etapa'}`} mensajes={detail.mensajes || []} onEnviar={onSend} alturaClase="h-full" /> : null}</div>
      </section>
    </div>}
    {abierta && minimizada && <button type="button" onClick={abrirWhatsApp} className="fixed bottom-5 right-5 z-50 rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-emerald-700">WhatsApp · volver a abrir</button>}
  </>;
}
