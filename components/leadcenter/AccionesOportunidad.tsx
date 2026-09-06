'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Etapa {
  id: string;
  nombre: string;
}
interface Subestado {
  id: string;
  nombre: string;
  etapa_id: string;
}

interface Causa {
  id: string;
  nombre: string;
  detalle: string | null;
  requiere_comentario: boolean;
}

/**
 * Acciones del CRM sobre una oportunidad: cambiar etapa, registrar contacto y
 * CERRAR (Ganada/Perdida) o REABRIR. Todas invocan API routes que a su vez
 * llaman RPCs autorizadas por RLS (puede_ver_oportunidad). No hay escritura
 * directa a tablas desde el cliente. El formulario de cierre se dibuja según
 * las reglas activas (config traída de /api/leadcenter/cierre/config).
 */
export default function AccionesOportunidad({
  oportunidadId,
  personaId,
  etapaActualId,
  etapas,
  subestados,
  estadoOportunidad = 'activa',
  cierreTipo = null
}: {
  oportunidadId: string;
  personaId: string;
  etapaActualId: string;
  etapas: Etapa[];
  subestados: Subestado[];
  estadoOportunidad?: string;
  cierreTipo?: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<'etapa' | 'contacto' | 'cierre'>('contacto');

  // ¿La oportunidad ya está cerrada? (para mostrar Reabrir en vez de Cerrar)
  const estaCerrada = estadoOportunidad === 'ganada' || estadoOportunidad === 'perdida';

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

  // --- Cierre (Ganada / Perdida) ---
  const [config, setConfig] = useState<any>(null);           // reglas activas + causas
  const [tipoCierre, setTipoCierre] = useState<'ganada' | 'perdida'>('ganada');
  const [causas, setCausas] = useState<Causa[]>([]);
  // Datos del cierre Ganada
  const [gPagoConfirmado, setGPagoConfirmado] = useState(false);
  const [gEvidencia, setGEvidencia] = useState('');
  const [gFechaConfirmacion, setGFechaConfirmacion] = useState('');
  const [gActor, setGActor] = useState('');
  const [gCanalOrigen, setGCanalOrigen] = useState('');
  const [gComentario, setGComentario] = useState('');
  // Datos del cierre Perdida
  const [pCausaId, setPCausaId] = useState('');
  const [pComentario, setPComentario] = useState('');
  // Confirmación / feedback
  const [confirmando, setConfirmando] = useState(false);
  const [cargCierre, setCargCierre] = useState(false);
  const [msgCierre, setMsgCierre] = useState('');
  const [faltantes, setFaltantes] = useState<string[]>([]);
  // Reapertura
  const [reabrirEtapa, setReabrirEtapa] = useState(etapaActualId);
  const [reabrirSub, setReabrirSub] = useState('');
  const [reabrirMotivo, setReabrirMotivo] = useState('');
  const [cargReabrir, setCargReabrir] = useState(false);
  const [msgReabrir, setMsgReabrir] = useState('');

  // Carga la configuración de cierre la primera vez que se abre la pestaña.
  useEffect(() => {
    if (tab !== 'cierre' || config) return;
    (async () => {
      try {
        const r = await fetch('/api/leadcenter/cierre/config');
        const d = await r.json();
        if (d.ok) {
          setConfig(d);
          setCausas(d.causas || []);
        }
      } catch {
        /* silencioso: el formulario se mostrará con valores por defecto */
      }
    })();
  }, [tab, config]);

  const reglaG = config?.reglaGanada || null;
  const reglaP = config?.reglaPerdida || null;
  const causaSel = causas.find((c) => c.id === pCausaId) || null;
  const subDeEtapa = subestados.filter((s) => s.etapa_id === etapaNueva);
  const subReabrir = subestados.filter((s) => s.etapa_id === reabrirEtapa);

  // ¿Un requisito de Ganada es obligatorio según la regla activa?
  const esOblig = (campo: string) => reglaG?.[campo] === 'obligatorio';
  const esUsado = (campo: string) => reglaG?.[campo] !== 'no_utilizado';

  // Traduce el código de error de la RPC a un mensaje claro en español.
  function traducirError(err: string): string {
    const mapa: Record<string, string> = {
      no_autorizado: 'No tienes permiso sobre esta oportunidad.',
      sin_reglas_ganada: 'No hay reglas de Ganada configuradas.',
      sin_reglas_perdida: 'No hay reglas de Perdida configuradas.',
      etapa_cerrada_no_configurada: 'Falta configurar la etapa "Cerrada". Avisa a un administrador.',
      causa_invalida: 'La causa seleccionada no es válida.',
      requiere_aprobacion_humana: 'Este cierre requiere la aprobación de una persona.',
      requisitos_incompletos: 'Faltan datos obligatorios para cerrar.',
      motivo_requerido: 'Debes indicar el motivo de reapertura.',
      etapa_requerida: 'Debes elegir la etapa de reapertura.',
      reapertura_no_permitida_ganada: 'Las reglas no permiten reabrir una oportunidad ganada.',
      reapertura_no_permitida_perdida: 'Las reglas no permiten reabrir una oportunidad perdida.'
    };
    return mapa[err] || 'No se pudo completar la acción.';
  }

  // Ejecuta el cierre (tras confirmación).
  async function ejecutarCierre() {
    setCargCierre(true);
    setMsgCierre('');
    setFaltantes([]);
    try {
      let r: Response;
      if (tipoCierre === 'ganada') {
        const datos: Record<string, any> = {
          pago_confirmado: gPagoConfirmado,
          evidencia_pago: gEvidencia || null,
          fecha_confirmacion: gFechaConfirmacion ? new Date(gFechaConfirmacion).toISOString() : null,
          actor_valido: gActor || null,
          canal_origen: gCanalOrigen || null,
          comentario: gComentario || null
        };
        r = await fetch(`/api/leadcenter/oportunidad/${oportunidadId}/cerrar-ganada`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ datos, canal: 'leadcenter' })
        });
      } else {
        r = await fetch(`/api/leadcenter/oportunidad/${oportunidadId}/cerrar-perdida`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ causaId: pCausaId || null, comentario: pComentario || null, canal: 'leadcenter' })
        });
      }
      const d = await r.json();
      if (d.ok) {
        setMsgCierre(tipoCierre === 'ganada' ? '✅ Oportunidad cerrada como GANADA.' : '✅ Oportunidad cerrada como PERDIDA.');
        setConfirmando(false);
        router.refresh();
      } else {
        if (Array.isArray(d.faltantes) && d.faltantes.length) setFaltantes(d.faltantes);
        setMsgCierre('❌ ' + traducirError(d.error || ''));
        setConfirmando(false);
      }
    } catch {
      setMsgCierre('❌ Error de red al cerrar.');
      setConfirmando(false);
    } finally {
      setCargCierre(false);
    }
  }

  // Valida en cliente (previo a confirmar) qué obligatorios faltan.
  function validarAntesDeConfirmar(): string[] {
    const f: string[] = [];
    if (tipoCierre === 'ganada') {
      if (esOblig('req_pago_confirmado') && !gPagoConfirmado) f.push('Pago de inscripción confirmado');
      if (esOblig('req_evidencia_pago') && !gEvidencia.trim()) f.push('Evidencia / comprobante de pago');
      if (esOblig('req_fecha_confirmacion') && !gFechaConfirmacion) f.push('Fecha de confirmación');
      if (esOblig('req_actor_valido') && !gActor.trim()) f.push('Actor que validó');
      if (esOblig('req_canal_origen') && !gCanalOrigen.trim()) f.push('Canal de origen');
      if (esOblig('req_comentario') && !gComentario.trim()) f.push('Comentario');
    } else {
      if ((reglaP?.causa_obligatoria ?? true) && !pCausaId) f.push('Causa de pérdida');
      const exigeComentario = (reglaP?.comentario_obligatorio ?? true) || (causaSel?.requiere_comentario ?? false);
      if (exigeComentario && !pComentario.trim()) f.push('Explicación / comentario');
    }
    return f;
  }

  function intentarCerrar() {
    setMsgCierre('');
    const f = validarAntesDeConfirmar();
    if (f.length) {
      setFaltantes(f);
      setMsgCierre('Faltan datos obligatorios para cerrar.');
      return;
    }
    setFaltantes([]);
    setConfirmando(true);
  }

  // Reabrir oportunidad cerrada.
  async function ejecutarReapertura() {
    if (!reabrirMotivo.trim()) {
      setMsgReabrir('Debes indicar el motivo de reapertura.');
      return;
    }
    setCargReabrir(true);
    setMsgReabrir('');
    try {
      const r = await fetch(`/api/leadcenter/oportunidad/${oportunidadId}/reabrir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          etapaNueva: reabrirEtapa,
          subestadoNuevo: reabrirSub || null,
          motivo: reabrirMotivo,
          canal: 'leadcenter'
        })
      });
      const d = await r.json();
      if (d.ok) {
        setMsgReabrir('✅ Oportunidad reabierta.');
        setReabrirMotivo('');
        router.refresh();
      } else {
        setMsgReabrir('❌ ' + traducirError(d.error || ''));
      }
    } catch {
      setMsgReabrir('❌ Error de red al reabrir.');
    } finally {
      setCargReabrir(false);
    }
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
        <button
          onClick={() => setTab('cierre')}
          className={`rounded-xl px-3 py-1.5 text-sm font-medium ${
            tab === 'cierre'
              ? 'bg-slate-700 text-white'
              : estaCerrada
                ? 'text-emerald-700 hover:bg-emerald-50'
                : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {estaCerrada ? 'Reabrir oportunidad' : 'Cerrar oportunidad'}
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

      {/* ==================== CIERRE / REAPERTURA ==================== */}
      {tab === 'cierre' && (
        <div className="space-y-3">
          {/* Si ya está cerrada -> flujo de REAPERTURA */}
          {estaCerrada ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                Esta oportunidad está <strong>cerrada como {cierreTipo === 'ganada' ? 'GANADA' : 'PERDIDA'}</strong>.
                Al reabrir, el cierre queda registrado en la auditoría y el historial permanece intacto.
              </div>
              <label className="block text-sm">
                <span className="mb-1 block text-gray-600">Nueva etapa</span>
                <select
                  value={reabrirEtapa}
                  onChange={(e) => {
                    setReabrirEtapa(e.target.value);
                    setReabrirSub('');
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
              {subReabrir.length > 0 && (
                <label className="block text-sm">
                  <span className="mb-1 block text-gray-600">Subestado</span>
                  <select value={reabrirSub} onChange={(e) => setReabrirSub(e.target.value)} className={inputCls}>
                    <option value="">Sin subestado</option>
                    {subReabrir.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block text-sm">
                <span className="mb-1 block text-gray-600">Motivo de reapertura *</span>
                <textarea
                  value={reabrirMotivo}
                  onChange={(e) => setReabrirMotivo(e.target.value)}
                  rows={2}
                  className={inputCls}
                  placeholder="¿Por qué se reabre esta oportunidad?"
                />
              </label>
              <button
                onClick={ejecutarReapertura}
                disabled={cargReabrir}
                className="w-full rounded-xl bg-emerald-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {cargReabrir ? 'Reabriendo...' : 'Reabrir oportunidad'}
              </button>
              {msgReabrir && <p className="text-sm text-gray-700">{msgReabrir}</p>}
            </div>
          ) : (
            /* Flujo de CIERRE (Ganada / Perdida) */
            <div className="space-y-3">
              {/* Selector Ganada / Perdida */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setTipoCierre('ganada');
                    setFaltantes([]);
                    setMsgCierre('');
                  }}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
                    tipoCierre === 'ganada' ? 'bg-emerald-600 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  Ganada
                </button>
                <button
                  onClick={() => {
                    setTipoCierre('perdida');
                    setFaltantes([]);
                    setMsgCierre('');
                  }}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold ${
                    tipoCierre === 'perdida' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'
                  }`}
                >
                  Perdida
                </button>
              </div>

              {/* Formulario dinámico GANADA */}
              {tipoCierre === 'ganada' && (
                <div className="space-y-3">
                  {esUsado('req_pago_confirmado') && (
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={gPagoConfirmado} onChange={(e) => setGPagoConfirmado(e.target.checked)} />
                      Pago de inscripción confirmado {esOblig('req_pago_confirmado') && <span className="text-red-500">*</span>}
                    </label>
                  )}
                  {esUsado('req_evidencia_pago') && (
                    <label className="block text-sm">
                      <span className="mb-1 block text-gray-600">
                        Evidencia / comprobante (URL o referencia) {esOblig('req_evidencia_pago') && <span className="text-red-500">*</span>}
                      </span>
                      <input value={gEvidencia} onChange={(e) => setGEvidencia(e.target.value)} className={inputCls} />
                    </label>
                  )}
                  {esUsado('req_fecha_confirmacion') && (
                    <label className="block text-sm">
                      <span className="mb-1 block text-gray-600">
                        Fecha de confirmación {esOblig('req_fecha_confirmacion') && <span className="text-red-500">*</span>}
                      </span>
                      <input type="datetime-local" value={gFechaConfirmacion} onChange={(e) => setGFechaConfirmacion(e.target.value)} className={inputCls} />
                    </label>
                  )}
                  {esUsado('req_actor_valido') && (
                    <label className="block text-sm">
                      <span className="mb-1 block text-gray-600">
                        Actor que validó {esOblig('req_actor_valido') && <span className="text-red-500">*</span>}
                      </span>
                      <input value={gActor} onChange={(e) => setGActor(e.target.value)} className={inputCls} placeholder="Nombre de quien validó la conversión" />
                    </label>
                  )}
                  {esUsado('req_canal_origen') && (
                    <label className="block text-sm">
                      <span className="mb-1 block text-gray-600">
                        Canal de origen {esOblig('req_canal_origen') && <span className="text-red-500">*</span>}
                      </span>
                      <select value={gCanalOrigen} onChange={(e) => setGCanalOrigen(e.target.value)} className={inputCls}>
                        <option value="">Selecciona...</option>
                        <option value="web">Web</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="llamada">Llamada</option>
                        <option value="presencial">Presencial</option>
                        <option value="otro">Otro</option>
                      </select>
                    </label>
                  )}
                  {esUsado('req_comentario') && (
                    <label className="block text-sm">
                      <span className="mb-1 block text-gray-600">
                        Comentario {esOblig('req_comentario') && <span className="text-red-500">*</span>}
                      </span>
                      <textarea value={gComentario} onChange={(e) => setGComentario(e.target.value)} rows={2} className={inputCls} />
                    </label>
                  )}
                  <p className="text-xs text-gray-500">
                    Ganada = conversión real validada (no un simple interesado). El programa y la universidad se toman de la ficha si ya están definidos.
                  </p>
                </div>
              )}

              {/* Formulario dinámico PERDIDA */}
              {tipoCierre === 'perdida' && (
                <div className="space-y-3">
                  <label className="block text-sm">
                    <span className="mb-1 block text-gray-600">
                      Causa de pérdida {(reglaP?.causa_obligatoria ?? true) && <span className="text-red-500">*</span>}
                    </span>
                    <select value={pCausaId} onChange={(e) => setPCausaId(e.target.value)} className={inputCls}>
                      <option value="">Selecciona una causa...</option>
                      {causas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                    {causaSel?.detalle && <span className="mt-1 block text-xs text-gray-500">{causaSel.detalle}</span>}
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-gray-600">
                      Explicación / comentario{' '}
                      {((reglaP?.comentario_obligatorio ?? true) || causaSel?.requiere_comentario) && <span className="text-red-500">*</span>}
                    </span>
                    <textarea value={pComentario} onChange={(e) => setPComentario(e.target.value)} rows={3} className={inputCls} placeholder="Explica brevemente por qué se pierde la oportunidad" />
                  </label>
                </div>
              )}

              {/* Lista de faltantes (bloqueo) */}
              {faltantes.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <p className="font-semibold">Faltan datos obligatorios:</p>
                  <ul className="ml-4 list-disc">
                    {faltantes.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Botones Guardar cierre / Cancelar + confirmación */}
              {!confirmando ? (
                <button
                  onClick={intentarCerrar}
                  disabled={cargCierre}
                  className={`w-full rounded-xl py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                    tipoCierre === 'ganada' ? 'bg-emerald-600' : 'bg-red-600'
                  }`}
                >
                  Guardar cierre
                </button>
              ) : (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <p className="mb-2 text-sm text-gray-700">
                    ¿Confirmas cerrar esta oportunidad como <strong>{tipoCierre === 'ganada' ? 'GANADA' : 'PERDIDA'}</strong>? Esta acción queda registrada en la auditoría.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={ejecutarCierre}
                      disabled={cargCierre}
                      className={`flex-1 rounded-xl py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                        tipoCierre === 'ganada' ? 'bg-emerald-600' : 'bg-red-600'
                      }`}
                    >
                      {cargCierre ? 'Cerrando...' : 'Confirmar cierre'}
                    </button>
                    <button
                      onClick={() => setConfirmando(false)}
                      disabled={cargCierre}
                      className="flex-1 rounded-xl border border-gray-300 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              {msgCierre && <p className="text-sm text-gray-700">{msgCierre}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
