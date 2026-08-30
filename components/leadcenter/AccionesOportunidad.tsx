'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface Etapa {
  id: string;
  nombre: string;
}
interface Subestado {
  id: string;
  nombre: string;
  etapa_id: string;
}

/**
 * Acciones del CRM sobre una oportunidad: cambiar etapa y registrar contacto.
 * Ambas invocan las API routes que a su vez llaman RPCs autorizadas por RLS
 * (puede_ver_oportunidad). No hay escritura directa a tablas desde el cliente.
 */
export default function AccionesOportunidad({
  oportunidadId,
  personaId,
  etapaActualId,
  etapas,
  subestados
}: {
  oportunidadId: string;
  personaId: string;
  etapaActualId: string;
  etapas: Etapa[];
  subestados: Subestado[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'etapa' | 'contacto'>('contacto');

  // --- Cambiar etapa ---
  const [etapaNueva, setEtapaNueva] = useState(etapaActualId);
  const [subestadoNuevo, setSubestadoNuevo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [msgEtapa, setMsgEtapa] = useState('');
  const [cargEtapa, setCargEtapa] = useState(false);

  // --- Registrar contacto ---
  const [canal, setCanal] = useState('llamada');
  const [resultado, setResultado] = useState('contactado');
  const [nota, setNota] = useState('');
  const [crearTarea, setCrearTarea] = useState(false);
  const [fechaTarea, setFechaTarea] = useState('');
  const [tituloTarea, setTituloTarea] = useState('');
  const [msgContacto, setMsgContacto] = useState('');
  const [cargContacto, setCargContacto] = useState(false);

  const subDeEtapa = subestados.filter((s) => s.etapa_id === etapaNueva);

  async function enviarEtapa() {
    setCargEtapa(true);
    setMsgEtapa('');
    try {
      const r = await fetch(`/api/leadcenter/oportunidad/${oportunidadId}/etapa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etapaNueva,
          subestadoNuevo: subestadoNuevo || null,
          motivo: motivo || null
        })
      });
      const d = await r.json();
      if (d.ok) {
        setMsgEtapa('Etapa actualizada.');
        setMotivo('');
        router.refresh();
      } else {
        if (d.error === 'no_autorizado') {
          setMsgEtapa('No tienes permiso sobre esta oportunidad.');
        } else if (d.error === 'subestado_invalido_para_etapa') {
          setMsgEtapa('El subestado seleccionado no pertenece a la etapa elegida.');
        } else if (d.error === 'etapa_invalida') {
          setMsgEtapa('La etapa seleccionada no está disponible.');
        } else {
          setMsgEtapa('No se pudo actualizar.');
        }
      }
    } catch {
      setMsgEtapa('Error de red.');
    } finally {
      setCargEtapa(false);
    }
  }

  async function enviarContacto() {
    setCargContacto(true);
    setMsgContacto('');
    try {
      const r = await fetch(`/api/leadcenter/oportunidad/${oportunidadId}/contacto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personaId,
          canal,
          resultado,
          nota: nota || null,
          crearTarea,
          fechaTarea: crearTarea && fechaTarea ? new Date(fechaTarea).toISOString() : null,
          tituloTarea: tituloTarea || null
        })
      });
      const d = await r.json();
      if (d.ok) {
        setMsgContacto('Contacto registrado.');
        setNota('');
        setTituloTarea('');
        setCrearTarea(false);
        setFechaTarea('');
        router.refresh();
      } else {
        setMsgContacto(d.error === 'no_autorizado' ? 'No tienes permiso sobre esta oportunidad.' : 'No se pudo registrar.');
      }
    } catch {
      setMsgContacto('Error de red.');
    } finally {
      setCargContacto(false);
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => setTab('contacto')}
          className={`rounded-xl px-3 py-1.5 text-sm font-medium ${
            tab === 'contacto' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Registrar contacto
        </button>
        <button
          onClick={() => setTab('etapa')}
          className={`rounded-xl px-3 py-1.5 text-sm font-medium ${
            tab === 'etapa' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Cambiar etapa
        </button>
      </div>

      {tab === 'contacto' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">Canal</span>
              <select value={canal} onChange={(e) => setCanal(e.target.value)} className={inputCls}>
                <option value="llamada">Llamada</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="presencial">Presencial</option>
                <option value="otro">Otro</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-gray-600">Resultado</span>
              <select
                value={resultado}
                onChange={(e) => setResultado(e.target.value)}
                className={inputCls}
              >
                <option value="contactado">Contactado</option>
                <option value="sin_respuesta">Sin respuesta</option>
                <option value="interesado">Interesado</option>
                <option value="no_interesado">No interesado</option>
                <option value="reagendar">Reagendar</option>
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">Comentario de gestión</span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              className={inputCls}
              placeholder="Comentario de gestión del contacto…"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={crearTarea}
              onChange={(e) => setCrearTarea(e.target.checked)}
            />
            Crear tarea de seguimiento
          </label>
          {crearTarea && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={tituloTarea}
                onChange={(e) => setTituloTarea(e.target.value)}
                placeholder="Título de la tarea"
                className={inputCls}
              />
              <input
                type="datetime-local"
                value={fechaTarea}
                onChange={(e) => setFechaTarea(e.target.value)}
                className={inputCls}
              />
            </div>
          )}
          <button
            onClick={enviarContacto}
            disabled={cargContacto}
            className="w-full rounded-xl bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {cargContacto ? 'Guardando…' : 'Registrar contacto'}
          </button>
          {msgContacto && <p className="text-sm text-gray-600">{msgContacto}</p>}
        </div>
      )}

      {tab === 'etapa' && (
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">Etapa</span>
            <select
              value={etapaNueva}
              onChange={(e) => {
                setEtapaNueva(e.target.value);
                setSubestadoNuevo('');
              }}
              className={inputCls}
            >
              {etapas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </label>
          {subDeEtapa.length > 0 && (
            <label className="block text-sm">
              <span className="mb-1 block text-gray-600">Subestado</span>
              <select
                value={subestadoNuevo}
                onChange={(e) => setSubestadoNuevo(e.target.value)}
                className={inputCls}
              >
                <option value="">Sin subestado</option>
                {subDeEtapa.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block text-gray-600">Motivo (opcional)</span>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls} />
          </label>
          <button
            onClick={enviarEtapa}
            disabled={cargEtapa}
            className="w-full rounded-xl bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {cargEtapa ? 'Guardando…' : 'Actualizar etapa'}
          </button>
          {msgEtapa && <p className="text-sm text-gray-600">{msgEtapa}</p>}
        </div>
      )}
    </div>
  );
}
