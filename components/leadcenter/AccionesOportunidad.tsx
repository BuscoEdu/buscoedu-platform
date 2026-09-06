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
  estaCerrada = false,
  etapas,
  subestados
}: {
  oportunidadId: string;
  personaId: string;
  etapaActualId: string;
  estaCerrada?: boolean;
  etapas: Etapa[];
  subestados: Subestado[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'etapa' | 'contacto'>('contacto');
  const [cierreAbierto, setCierreAbierto] = useState(false);
  const [tipoCierre, setTipoCierre] = useState<'ganada' | 'perdida'>('ganada');
  const [causas, setCausas] = useState<Array<{ codigo: string; nombre: string }>>([]);
  const [causaCodigo, setCausaCodigo] = useState('');
  const [comentarioCierre, setComentarioCierre] = useState('');
  const [pagoConfirmado, setPagoConfirmado] = useState(false);
  const [evidenciaPago, setEvidenciaPago] = useState(false);
  const [msgCierre, setMsgCierre] = useState('');
  const [cargCierre, setCargCierre] = useState(false);
  const [motivoReapertura, setMotivoReapertura] = useState('');
  const [etapaReapertura, setEtapaReapertura] = useState(etapaActualId);
  const [subestadoReapertura, setSubestadoReapertura] = useState('');

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

  async function cargarCausas() {
    if (causas.length) return;
    const r = await fetch('/api/leadcenter/funnel/cierres');
    const d = await r.json();
    if (d.ok) setCausas(d.causas || []);
  }

  async function enviarCierre() {
    setCargCierre(true); setMsgCierre('');
    const requisitos = { pago_inscripcion_confirmado: pagoConfirmado, evidencia_pago: evidenciaPago, programa_seleccionado: true, universidad_seleccionada: true, fecha_confirmacion: true, actor_validacion: true, canal_origen: true, comentario_cierre: Boolean(comentarioCierre.trim()) };
    try {
      const r = await fetch(`/api/leadcenter/oportunidad/${oportunidadId}/cierre`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipoCierre, causaCodigo: causaCodigo || null, comentario: comentarioCierre, requisitos, canal: 'leadcenter' }) });
      const d = await r.json();
      if (!d.ok) {
        setMsgCierre(d.error === 'requisitos_ganada_incompletos' ? `Faltan requisitos: ${(d.faltantes || []).join(', ')}` : d.error === 'causa_y_comentario_requeridos' ? 'Selecciona una causa y escribe el detalle.' : 'No se pudo cerrar la oportunidad.');
      } else { setMsgCierre('Cierre guardado.'); setCierreAbierto(false); setComentarioCierre(''); router.refresh(); }
    } catch { setMsgCierre('Error de red.'); } finally { setCargCierre(false); }
  }

  async function enviarReapertura() {
    setCargCierre(true); setMsgCierre('');
    try {
      const r = await fetch(`/api/leadcenter/oportunidad/${oportunidadId}/cierre`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion: 'reabrir', etapaNueva: etapaReapertura, subestadoNuevo: subestadoReapertura || null, motivo: motivoReapertura }) });
      const d = await r.json();
      if (!d.ok) setMsgCierre(d.error === 'motivo_reapertura_requerido' ? 'Escribe el motivo de reapertura.' : 'No se pudo reabrir.');
      else { setMsgCierre('Oportunidad reabierta.'); setMotivoReapertura(''); router.refresh(); }
    } catch { setMsgCierre('Error de red.'); } finally { setCargCierre(false); }
  }

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

      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-sm font-semibold text-amber-900">Cierre de oportunidad</p><p className="text-xs text-amber-800">Ganada o Perdida desde cualquier etapa.</p></div>
          <button onClick={() => { setCierreAbierto(!cierreAbierto); cargarCausas(); }} className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white">{cierreAbierto ? 'Cancelar' : 'Cerrar oportunidad'}</button>
        </div>
        {cierreAbierto && <div className="mt-3 space-y-3 border-t border-amber-200 pt-3">
          <div className="grid grid-cols-2 gap-2"><button onClick={() => setTipoCierre('ganada')} className={`rounded-lg px-3 py-2 text-sm ${tipoCierre === 'ganada' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-700'}`}>Ganada</button><button onClick={() => setTipoCierre('perdida')} className={`rounded-lg px-3 py-2 text-sm ${tipoCierre === 'perdida' ? 'bg-red-600 text-white' : 'bg-white text-gray-700'}`}>Perdida</button></div>
          {tipoCierre === 'ganada' ? <div className="space-y-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={pagoConfirmado} onChange={(e) => setPagoConfirmado(e.target.checked)} /> Pago de inscripción confirmado</label><label className="flex items-center gap-2"><input type="checkbox" checked={evidenciaPago} onChange={(e) => setEvidenciaPago(e.target.checked)} /> Evidencia o comprobante validado</label></div> : <select value={causaCodigo} onChange={(e) => setCausaCodigo(e.target.value)} className={inputCls}><option value="">Selecciona la causa de pérdida</option>{causas.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}</select>}
          <textarea value={comentarioCierre} onChange={(e) => setComentarioCierre(e.target.value)} rows={3} className={inputCls} placeholder={tipoCierre === 'ganada' ? 'Comentario de validación de la conversión' : 'Explica la causa de pérdida'} />
          <div className="flex gap-2"><button onClick={enviarCierre} disabled={cargCierre} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-50">{cargCierre ? 'Guardando…' : 'Guardar cierre'}</button><button onClick={() => setCierreAbierto(false)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Cancelar</button></div>
          {msgCierre && <p className="text-sm text-gray-700">{msgCierre}</p>}
        </div>}
      </div>
      {estaCerrada && <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3"><p className="text-sm font-semibold text-blue-900">Reabrir oportunidad</p><div className="mt-2 space-y-2"><select value={etapaReapertura} onChange={(e) => { setEtapaReapertura(e.target.value); setSubestadoReapertura(''); }} className={inputCls}>{etapas.filter((e) => e.nombre.toLowerCase() !== 'cerrada').map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select>{subestados.filter((s) => s.etapa_id === etapaReapertura).length > 0 && <select value={subestadoReapertura} onChange={(e) => setSubestadoReapertura(e.target.value)} className={inputCls}><option value="">Sin subestado</option>{subestados.filter((s) => s.etapa_id === etapaReapertura).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>}<input value={motivoReapertura} onChange={(e) => setMotivoReapertura(e.target.value)} className={inputCls} placeholder="Motivo obligatorio de reapertura" /><div className="flex gap-2"><button onClick={enviarReapertura} disabled={cargCierre} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white">Reabrir oportunidad</button><button onClick={() => setMotivoReapertura('')} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Cancelar</button></div>{msgCierre && <p className="text-sm text-gray-700">{msgCierre}</p>}</div></div>}

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
