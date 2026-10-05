'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DemoWappPanel from '@/components/demowapp/DemoWappPanel';
import DemoWappOpsSheet from '@/components/demowapp/DemoWappOpsSheet';

/**
 * BA-030 / BA-033: consola Demo WApp.
 * Lo que se ve al entrar es solo el hilo. Sesiones, búsqueda y CRM
 * están en la hoja de operación, que tapa el chat y no queda a su lado.
 */
export default function DemoWappPage() {
  const [loading, setLoading] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [opsAbierta, setOpsAbierta] = useState(false);
  const [creandoQa, setCreandoQa] = useState(false);
  const [errorQa, setErrorQa] = useState('');
  const refreshInFlight = useRef(false);

  /* Lista de sesiones para la hoja de operación. No se pinta junto al hilo. */
  const loadSessions = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const res = await fetch('/api/demowapp/sesiones', { cache: 'no-store' });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error || 'No fue posible cargar sesiones.');
        return;
      }
      // Defensa adicional: una oportunidad solo puede tener una sesión visible.
      const porOportunidad = new Map<string, any>();
      (data.items || []).forEach((item: any) => {
        if (item?.oportunidadId && !porOportunidad.has(item.oportunidadId)) porOportunidad.set(item.oportunidadId, item);
      });
      setSessions(Array.from(porOportunidad.values()));
    } catch {
      setError('Error de red al cargar sesiones.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  /* POST sesiones/qa. Al 201 se abre ese hilo; el error queda en la hoja, no en blanco. */
  const crearConversacionQa = async (etiqueta: string) => {
    const limpia = etiqueta.trim();
    if (limpia.length < 2) {
      setErrorQa('La etiqueta tiene que tener entre 2 y 80 caracteres.');
      return null;
    }
    setCreandoQa(true);
    setErrorQa('');
    try {
      const res = await fetch('/api/demowapp/sesiones/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etiqueta: limpia })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.oportunidadId) {
        setErrorQa(data.error || 'No pude abrir la conversación QA.');
        return null;
      }
      const item = {
        oportunidadId: data.oportunidadId,
        codigoOportunidad: data.codigo,
        nombre: limpia.startsWith('QA ') ? limpia : `QA ${limpia}`,
        telefonoEnmascarado: data.telefonoEnmascarado,
        esQa: data.esQa === true,
        oferta: '—',
        estadoAplicacion: '—',
        etapa: '—',
        subestado: '—',
        temperatura: '—',
        conversacionExiste: false
      };
      setSessions((actuales) => [item, ...actuales.filter((sesion) => sesion.oportunidadId !== data.oportunidadId)]);
      await loadDetail(data.oportunidadId);
      setOpsAbierta(false);
      void loadSessions({ silent: true });
      return data.oportunidadId as string;
    } catch {
      setErrorQa('Error de red al abrir la conversación QA.');
      return null;
    } finally {
      setCreandoQa(false);
    }
  };

  /* Mensajes de la conversación elegida. El CRM del detalle no entra al hilo. */
  const loadDetail = async (oportunidadId: string, { silent = false } = {}) => {
    if (!silent) {
      setSelectedId(oportunidadId);
      setLoadingDetail(true);
      setError('');
    }
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

  /* Envío dentro del hilo. El texto no abre Explorar ni otra ruta. */
  const onSend = async (texto: string, clientMessageId: string) => {
    if (!selectedId) return;
    const oportunidadId = selectedId;
    setError('');
    const optimista = { id: clientMessageId, remitente_tipo: 'persona', contenido: texto, enviado_en: new Date().toISOString(), creado_en: new Date().toISOString() };
    setDetail((actual: any) => actual ? { ...actual, mensajes: [...(actual.mensajes || []), optimista] } : actual);
    try {
      const res = await fetch(`/api/demowapp/sesiones/${oportunidadId}/mensaje`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, clientMessageId })
      });

      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo enviar');

      // El turno de NaIA llega en la respuesta. Se muestra de inmediato sin
      // esperar el procesador de recordatorios ni el refresco periódico.
      const nuevos = [data.result?.inbound, data.result?.outbound].filter(Boolean);
      if (nuevos.length) {
        setDetail((actual: any) => {
          if (!actual) return actual;
          const porId = new Map<string, any>();
          [...(actual.mensajes || []).filter((mensaje: any) => mensaje.id !== clientMessageId), ...nuevos].forEach((mensaje: any) => porId.set(mensaje.id, mensaje));
          return { ...actual, mensajes: Array.from(porId.values()) };
        });
      }

      // Los recordatorios y la sincronización son secundarios: si fallan no
      // bloquean el mensaje ni vuelven a dejar el texto en el campo.
      void (async () => {
        try {
          await fetch('/api/demowapp/push/procesar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oportunidadId })
          });
        } catch {
          // El siguiente ciclo de sincronización reintentará los recordatorios.
        }
        await Promise.allSettled([
          loadDetail(oportunidadId, { silent: true }),
          loadSessions({ silent: true })
        ]);
      })();
    } catch (e: any) {
      setDetail((actual: any) => actual ? { ...actual, mensajes: (actual.mensajes || []).filter((mensaje: any) => mensaje.id !== clientMessageId) } : actual);
      const message = e?.message || 'No se pudo enviar el mensaje.';
      setError(message);
      throw e;
    }
  };

  useEffect(() => {
    void loadSessions();
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previo;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    const interval = window.setInterval(() => {
      void (async () => {
        if (refreshInFlight.current) return;
        refreshInFlight.current = true;
        try {
          await fetch('/api/demowapp/push/procesar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oportunidadId: selectedId })
          });
          await loadDetail(selectedId, { silent: true });
        } finally {
          refreshInFlight.current = false;
        }
      })();
    }, 5000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const filteredSessions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return sessions;
    return sessions.filter((s) =>
      [s.nombre, s.telefonoEnmascarado, s.oferta, s.etapa, s.subestado, s.esQa ? 'qa' : ''].join(' ').toLowerCase().includes(term)
    );
  }, [query, sessions]);

  const sesionActiva = sessions.find((sesion) => sesion.oportunidadId === selectedId);
  const hiloQa = detail?.esQa === true || detail?.es_qa === true || sesionActiva?.esQa === true;

  const avisoHilo = error
    ? error
    : loadingDetail
      ? 'Cargando la conversación…'
      : null;

  return (
    <div className="relative flex h-dvh min-h-0 flex-col">
      {/*
        BA-033: un solo hilo, de borde a borde, en móvil y en escritorio.
        BA-030: sin listado, sin filtros de Explorar y sin CRM en esta capa.
        BA-031: ofertaId abre Aplicar y Mi lista dentro de este mismo hilo.
      */}
      <DemoWappPanel
        soloHilo
        titulo="NaIA"
        subtitulo={hiloQa ? 'QA · en línea' : 'en línea'}
        esQa={hiloQa}
        mensajes={detail?.mensajes || []}
        onEnviar={onSend}
        disabled={!detail || loadingDetail}
        onAbrirOperacion={() => setOpsAbierta(true)}
        ofertaNombre={detail?.oferta?.nombre_oferta || detail?.oferta?.nombre || null}
        ofertaId={detail?.oferta?.id || null}
        oportunidadId={selectedId}
        avisoHilo={avisoHilo}
        accionVacia={
          detail
            ? null
            : { etiqueta: 'Elegir conversación', onClick: () => setOpsAbierta(true) }
        }
      />

      {/* La operación tapa el hilo. Al cerrarla no queda ninguna columna. */}
      {opsAbierta ? (
        <DemoWappOpsSheet
          onCerrar={() => setOpsAbierta(false)}
          query={query}
          onQuery={setQuery}
          loading={loading}
          sessions={filteredSessions}
          selectedId={selectedId}
          onSelect={(id) => {
            void loadDetail(id);
          }}
          detail={detail}
          onCrearQa={crearConversacionQa}
          creandoQa={creandoQa}
          errorQa={errorQa}
        />
      ) : null}
    </div>
  );
}
