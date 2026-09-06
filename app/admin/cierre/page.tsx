'use client';

// =====================================================================
// PANEL ADMIN · Reglas de cierre de oportunidades
// Cuatro secciones configurables por super_admin:
//   1) Reglas de Ganada (requisitos obligatorio/opcional/no_utilizado + gobierno)
//   2) Reglas de Perdida (causa/comentario obligatorios + gobierno)
//   3) Causas de pérdida (CRUD: crear/editar/activar/reordenar)
//   4) Reglas de Desaparecido (reversible, no cierra solo)
// Todo se guarda vía las APIs /api/admin/cierre/*. Nunca se borra físico.
// =====================================================================

import { useEffect, useState } from 'react';
import FormToggle from '@/components/admin/FormToggle';
import SuccessToast from '@/components/admin/SuccessToast';
import ErrorToast from '@/components/admin/ErrorToast';
import LoadingSpinner from '@/components/admin/LoadingSpinner';

const NIVELES = [
  { valor: 'obligatorio', etiqueta: 'Obligatorio' },
  { valor: 'opcional', etiqueta: 'Opcional' },
  { valor: 'no_utilizado', etiqueta: 'No utilizado' }
];

const REQUISITOS_GANADA: { campo: string; etiqueta: string }[] = [
  { campo: 'req_pago_confirmado', etiqueta: 'Pago de inscripción confirmado' },
  { campo: 'req_evidencia_pago', etiqueta: 'Evidencia / comprobante de pago' },
  { campo: 'req_programa', etiqueta: 'Programa' },
  { campo: 'req_universidad', etiqueta: 'Universidad' },
  { campo: 'req_fecha_confirmacion', etiqueta: 'Fecha de confirmación' },
  { campo: 'req_actor_valido', etiqueta: 'Actor que validó' },
  { campo: 'req_canal_origen', etiqueta: 'Canal de origen (web/WhatsApp)' },
  { campo: 'req_comentario', etiqueta: 'Comentario' }
];

async function parseJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export default function AdminCierrePage() {
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [okMsg, setOkMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const [ganada, setGanada] = useState<any>(null);
  const [perdida, setPerdida] = useState<any>(null);
  const [desaparecido, setDesaparecido] = useState<any>(null);
  const [causas, setCausas] = useState<any[]>([]);

  // Formulario de nueva causa
  const [nuevaCausa, setNuevaCausa] = useState({ nombre: '', detalle: '', requiere_comentario: true });

  async function cargarTodo() {
    setCargando(true);
    try {
      const [g, p, d, c] = await Promise.all([
        fetch('/api/admin/cierre/reglas-ganada').then(parseJson),
        fetch('/api/admin/cierre/reglas-perdida').then(parseJson),
        fetch('/api/admin/cierre/reglas-desaparecido').then(parseJson),
        fetch('/api/admin/cierre/causas-perdida').then(parseJson)
      ]);
      if (g?.ok) setGanada(g.item);
      if (p?.ok) setPerdida(p.item);
      if (d?.ok) setDesaparecido(d.item);
      if (c?.ok) setCausas(c.items || []);
    } catch (e: any) {
      setErrMsg('No se pudo cargar la configuración: ' + (e?.message || 'error'));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  // ---- Guardado de reglas Ganada ----
  async function guardarGanada() {
    setGuardando(true);
    setErrMsg('');
    try {
      const res = await fetch('/api/admin/cierre/reglas-ganada', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ganada)
      });
      const data = await parseJson(res);
      if (!res.ok || !data?.ok) {
        setErrMsg('No se pudieron guardar las reglas de Ganada: ' + (data?.error || res.status));
        return;
      }
      setGanada(data.item);
      setOkMsg('Reglas de Ganada guardadas (versión ' + data.item.version + ').');
    } finally {
      setGuardando(false);
    }
  }

  // ---- Guardado de reglas Perdida ----
  async function guardarPerdida() {
    setGuardando(true);
    setErrMsg('');
    try {
      const res = await fetch('/api/admin/cierre/reglas-perdida', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(perdida)
      });
      const data = await parseJson(res);
      if (!res.ok || !data?.ok) {
        setErrMsg('No se pudieron guardar las reglas de Perdida: ' + (data?.error || res.status));
        return;
      }
      setPerdida(data.item);
      setOkMsg('Reglas de Perdida guardadas (versión ' + data.item.version + ').');
    } finally {
      setGuardando(false);
    }
  }

  // ---- Guardado de reglas Desaparecido ----
  async function guardarDesaparecido() {
    setGuardando(true);
    setErrMsg('');
    try {
      const res = await fetch('/api/admin/cierre/reglas-desaparecido', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(desaparecido)
      });
      const data = await parseJson(res);
      if (!res.ok || !data?.ok) {
        setErrMsg('No se pudieron guardar las reglas de Desaparecido: ' + (data?.error || res.status));
        return;
      }
      setDesaparecido(data.item);
      setOkMsg('Reglas de Desaparecido guardadas (versión ' + data.item.version + ').');
    } finally {
      setGuardando(false);
    }
  }

  // ---- Causas: crear ----
  async function crearCausa() {
    if (!nuevaCausa.nombre.trim()) {
      setErrMsg('La causa necesita un nombre.');
      return;
    }
    setGuardando(true);
    setErrMsg('');
    try {
      const res = await fetch('/api/admin/cierre/causas-perdida', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevaCausa)
      });
      const data = await parseJson(res);
      if (!res.ok || !data?.ok) {
        setErrMsg('No se pudo crear la causa: ' + (data?.error || res.status));
        return;
      }
      setCausas((prev) => [...prev, data.item].sort((a, b) => a.orden - b.orden));
      setNuevaCausa({ nombre: '', detalle: '', requiere_comentario: true });
      setOkMsg('Causa creada.');
    } finally {
      setGuardando(false);
    }
  }

  // ---- Causas: actualizar (soft delete, toggles, orden) ----
  async function actualizarCausa(id: string, patch: Record<string, any>) {
    setGuardando(true);
    setErrMsg('');
    try {
      const res = await fetch('/api/admin/cierre/causas-perdida/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      });
      const data = await parseJson(res);
      if (!res.ok || !data?.ok) {
        setErrMsg('No se pudo actualizar la causa: ' + (data?.error || res.status));
        return;
      }
      setCausas((prev) => prev.map((c) => (c.id === id ? data.item : c)).sort((a, b) => a.orden - b.orden));
      setOkMsg('Causa actualizada.');
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return (
      <div className="flex items-center justify-center p-10">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 md:p-6">
      <header>
        <h1 className="text-xl font-bold text-buscoedu-blue">Reglas de cierre de oportunidades</h1>
        <p className="mt-1 text-sm text-buscoedu-muted">
          Configura los requisitos y el gobierno del cierre Ganada / Perdida y de la etapa Desaparecido.
          Los cambios crean una nueva versión de la configuración y aplican hacia adelante (no reescriben el historial).
        </p>
      </header>

      {/* ============================ GANADA ============================ */}
      {ganada && (
        <section className="rounded-xl border border-buscoedu-border bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-bold text-emerald-700">1 · Reglas de Ganada</h2>
          <p className="mb-4 text-xs text-buscoedu-muted">
            Versión actual: {ganada.version}. Marca cada requisito como obligatorio, opcional o no utilizado.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {REQUISITOS_GANADA.map((r) => (
              <label key={r.campo} className="flex items-center justify-between gap-3 rounded-lg border border-buscoedu-border px-3 py-2">
                <span className="text-sm text-buscoedu-text">{r.etiqueta}</span>
                <select
                  value={ganada[r.campo]}
                  onChange={(e) => setGanada({ ...ganada, [r.campo]: e.target.value })}
                  className="rounded-md border border-buscoedu-border px-2 py-1 text-sm"
                >
                  {NIVELES.map((n) => (
                    <option key={n.valor} value={n.valor}>
                      {n.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <FormToggle label="La IA puede sugerir cierre" checked={!!ganada.ia_puede_sugerir} onChange={(v) => setGanada({ ...ganada, ia_puede_sugerir: v })} />
            <FormToggle label="La IA puede ejecutar el cierre" checked={!!ganada.ia_puede_ejecutar} onChange={(v) => setGanada({ ...ganada, ia_puede_ejecutar: v })} />
            <FormToggle label="Requiere aprobación humana" checked={!!ganada.requiere_aprobacion_humana} onChange={(v) => setGanada({ ...ganada, requiere_aprobacion_humana: v })} />
            <FormToggle label="Pago validado antes de cerrar" checked={!!ganada.pago_validado_antes_cierre} onChange={(v) => setGanada({ ...ganada, pago_validado_antes_cierre: v })} />
            <FormToggle label="Permite reabrir" checked={!!ganada.permite_reabrir} onChange={(v) => setGanada({ ...ganada, permite_reabrir: v })} />
          </div>

          <div className="mt-4 flex justify-end">
            <button onClick={guardarGanada} disabled={guardando} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              Guardar reglas de Ganada
            </button>
          </div>
        </section>
      )}

      {/* ============================ PERDIDA ============================ */}
      {perdida && (
        <section className="rounded-xl border border-buscoedu-border bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-bold text-red-700">2 · Reglas de Perdida</h2>
          <p className="mb-4 text-xs text-buscoedu-muted">Versión actual: {perdida.version}.</p>

          <div className="grid gap-2 sm:grid-cols-2">
            <FormToggle label="Causa obligatoria" checked={!!perdida.causa_obligatoria} onChange={(v) => setPerdida({ ...perdida, causa_obligatoria: v })} />
            <FormToggle label="Comentario obligatorio" checked={!!perdida.comentario_obligatorio} onChange={(v) => setPerdida({ ...perdida, comentario_obligatorio: v })} />
            <FormToggle label="La IA puede marcar perdida" checked={!!perdida.ia_puede_marcar} onChange={(v) => setPerdida({ ...perdida, ia_puede_marcar: v })} />
            <FormToggle label="Requiere aprobación humana" checked={!!perdida.requiere_aprobacion_humana} onChange={(v) => setPerdida({ ...perdida, requiere_aprobacion_humana: v })} />
            <FormToggle label="Permite reabrir" checked={!!perdida.permite_reabrir} onChange={(v) => setPerdida({ ...perdida, permite_reabrir: v })} />
          </div>

          <label className="mt-3 block">
            <span className="text-sm text-buscoedu-text">Tiempo mínimo antes de cierre automático (horas)</span>
            <input
              type="number"
              min={0}
              value={perdida.tiempo_minimo_horas ?? 0}
              onChange={(e) => setPerdida({ ...perdida, tiempo_minimo_horas: Number(e.target.value) })}
              className="mt-1 w-40 rounded-md border border-buscoedu-border px-2 py-1 text-sm"
            />
          </label>

          <div className="mt-4 flex justify-end">
            <button onClick={guardarPerdida} disabled={guardando} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              Guardar reglas de Perdida
            </button>
          </div>
        </section>
      )}

      {/* ============================ CAUSAS ============================ */}
      <section className="rounded-xl border border-buscoedu-border bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-lg font-bold text-buscoedu-blue">3 · Causas de pérdida</h2>
        <p className="mb-4 text-xs text-buscoedu-muted">
          Crea, edita, activa/desactiva y reordena las causas. Desactivar (no borrar) conserva el historial.
        </p>

        <div className="space-y-2">
          {causas.map((c) => (
            <div key={c.id} className={`rounded-lg border px-3 py-2 ${c.activo ? 'border-buscoedu-border bg-white' : 'border-dashed border-gray-300 bg-gray-50'}`}>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="number"
                  value={c.orden}
                  onChange={(e) => setCausas((prev) => prev.map((x) => (x.id === c.id ? { ...x, orden: Number(e.target.value) } : x)))}
                  onBlur={(e) => actualizarCausa(c.id, { orden: Number(e.target.value) })}
                  className="w-16 rounded-md border border-buscoedu-border px-2 py-1 text-sm"
                  title="Orden"
                />
                <input
                  value={c.nombre}
                  onChange={(e) => setCausas((prev) => prev.map((x) => (x.id === c.id ? { ...x, nombre: e.target.value } : x)))}
                  onBlur={(e) => actualizarCausa(c.id, { nombre: e.target.value })}
                  className="flex-1 min-w-[140px] rounded-md border border-buscoedu-border px-2 py-1 text-sm font-medium"
                />
                <label className="flex items-center gap-1 text-xs text-buscoedu-muted">
                  <input
                    type="checkbox"
                    checked={!!c.requiere_comentario}
                    onChange={(e) => actualizarCausa(c.id, { requiere_comentario: e.target.checked })}
                  />
                  Exige comentario
                </label>
                <label className="flex items-center gap-1 text-xs text-buscoedu-muted">
                  <input type="checkbox" checked={!!c.permite_asesor} onChange={(e) => actualizarCausa(c.id, { permite_asesor: e.target.checked })} />
                  Asesores
                </label>
                <label className="flex items-center gap-1 text-xs text-buscoedu-muted">
                  <input type="checkbox" checked={!!c.permite_universidad} onChange={(e) => actualizarCausa(c.id, { permite_universidad: e.target.checked })} />
                  Universidades
                </label>
                <label className="flex items-center gap-1 text-xs text-buscoedu-muted">
                  <input type="checkbox" checked={!!c.permite_ia} onChange={(e) => actualizarCausa(c.id, { permite_ia: e.target.checked })} />
                  IA
                </label>
                <button
                  onClick={() => actualizarCausa(c.id, { activo: !c.activo })}
                  className={`rounded-md px-2 py-1 text-xs font-semibold ${c.activo ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
                >
                  {c.activo ? 'Desactivar' : 'Reactivar'}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Nueva causa */}
        <div className="mt-4 rounded-lg border border-dashed border-buscoedu-border p-3">
          <p className="mb-2 text-sm font-semibold text-buscoedu-text">Nueva causa</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              placeholder="Nombre de la causa"
              value={nuevaCausa.nombre}
              onChange={(e) => setNuevaCausa({ ...nuevaCausa, nombre: e.target.value })}
              className="flex-1 min-w-[160px] rounded-md border border-buscoedu-border px-2 py-1 text-sm"
            />
            <input
              placeholder="Detalle (opcional)"
              value={nuevaCausa.detalle}
              onChange={(e) => setNuevaCausa({ ...nuevaCausa, detalle: e.target.value })}
              className="flex-1 min-w-[160px] rounded-md border border-buscoedu-border px-2 py-1 text-sm"
            />
            <label className="flex items-center gap-1 text-xs text-buscoedu-muted">
              <input type="checkbox" checked={nuevaCausa.requiere_comentario} onChange={(e) => setNuevaCausa({ ...nuevaCausa, requiere_comentario: e.target.checked })} />
              Exige comentario
            </label>
            <button onClick={crearCausa} disabled={guardando} className="rounded-lg bg-buscoedu-blue px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
              Agregar
            </button>
          </div>
        </div>
      </section>

      {/* ============================ DESAPARECIDO ============================ */}
      {desaparecido && (
        <section className="rounded-xl border border-buscoedu-border bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-lg font-bold text-amber-700">4 · Reglas de Desaparecido</h2>
          <p className="mb-4 text-xs text-buscoedu-muted">
            Versión actual: {desaparecido.version}. Recuerda: Desaparecido es reversible y NO cierra la oportunidad automáticamente.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm text-buscoedu-text">Horas sin respuesta</span>
              <input type="number" min={0} value={desaparecido.horas_sin_respuesta} onChange={(e) => setDesaparecido({ ...desaparecido, horas_sin_respuesta: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-buscoedu-border px-2 py-1 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm text-buscoedu-text">Número de intentos</span>
              <input type="number" min={0} value={desaparecido.numero_intentos} onChange={(e) => setDesaparecido({ ...desaparecido, numero_intentos: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-buscoedu-border px-2 py-1 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm text-buscoedu-text">Horas entre intentos</span>
              <input type="number" min={0} value={desaparecido.horas_entre_intentos} onChange={(e) => setDesaparecido({ ...desaparecido, horas_entre_intentos: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-buscoedu-border px-2 py-1 text-sm" />
            </label>
            <label className="block">
              <span className="text-sm text-buscoedu-text">Sugerir perdida tras (horas, 0 = nunca)</span>
              <input type="number" min={0} value={desaparecido.sugiere_perdida_tras_horas} onChange={(e) => setDesaparecido({ ...desaparecido, sugiere_perdida_tras_horas: Number(e.target.value) })} className="mt-1 w-full rounded-md border border-buscoedu-border px-2 py-1 text-sm" />
            </label>
          </div>

          <label className="mt-3 block">
            <span className="text-sm text-buscoedu-text">Mensaje de último contacto</span>
            <textarea value={desaparecido.mensaje_ultimo_contacto || ''} onChange={(e) => setDesaparecido({ ...desaparecido, mensaje_ultimo_contacto: e.target.value })} rows={2} className="mt-1 w-full rounded-md border border-buscoedu-border px-2 py-1 text-sm" />
          </label>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <FormToggle label="Crea tarea de seguimiento" checked={!!desaparecido.crea_tarea_seguimiento} onChange={(v) => setDesaparecido({ ...desaparecido, crea_tarea_seguimiento: v })} />
            <FormToggle label="Mueve automáticamente a Desaparecido" checked={!!desaparecido.mueve_auto_a_desaparecido} onChange={(v) => setDesaparecido({ ...desaparecido, mueve_auto_a_desaparecido: v })} />
            <FormToggle label="La IA puede sugerir" checked={!!desaparecido.ia_puede_sugerir} onChange={(v) => setDesaparecido({ ...desaparecido, ia_puede_sugerir: v })} />
            <FormToggle label="Permitir cierre automático (¡úsalo con cuidado!)" checked={!!desaparecido.cierre_automatico_permitido} onChange={(v) => setDesaparecido({ ...desaparecido, cierre_automatico_permitido: v })} />
          </div>

          <div className="mt-4 flex justify-end">
            <button onClick={guardarDesaparecido} disabled={guardando} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
              Guardar reglas de Desaparecido
            </button>
          </div>
        </section>
      )}

      {okMsg && <SuccessToast message={okMsg} onClose={() => setOkMsg('')} />}
      {errMsg && <ErrorToast message={errMsg} onClose={() => setErrMsg('')} />}
    </div>
  );
}
