'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import FormField from '@/components/admin/FormField';
import FormTextarea from '@/components/admin/FormTextarea';
import FormToggle from '@/components/admin/FormToggle';
import ErrorToast from '@/components/admin/ErrorToast';
import SuccessToast from '@/components/admin/SuccessToast';

type Etapa = {
  id: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  color: string | null;
  es_etapa_final_ganada: boolean;
  es_etapa_final_perdida: boolean;
  activo: boolean;
};

type Subestado = {
  id: string;
  etapa_id: string;
  nombre: string;
  descripcion: string | null;
  orden: number;
  tiempo_maximo_horas: number | null;
  activo: boolean;
};

type Regla = {
  id: string;
  etapa_id: string | null;
  subestado_id: string | null;
  tiempo_maximo_horas: number;
  horas_lenta?: number | null;
  horas_estancada?: number | null;
  bloque_recurrente_horas?: number | null;
  descuento_lenta?: number | null;
  descuento_estancada_por_bloque?: number | null;
  limite_descuento_total?: number | null;
  accion_recomendada: string | null;
  reduce_score?: boolean;
  escalar_a_humano?: boolean;
  crear_tarea?: boolean;
  mover_a_nurturing?: boolean;
  activo: boolean;
};

const emptyEtapa = {
  nombre: '',
  descripcion: '',
  color: '#2563eb',
  es_etapa_final_ganada: false,
  es_etapa_final_perdida: false,
  activo: true
};

const emptySubestado = {
  etapa_id: '',
  nombre: '',
  descripcion: '',
  tiempo_maximo_horas: '24',
  activo: true
};

const emptyRegla = {
  nivel: 'subestado',
  etapa_id: '',
  subestado_id: '',
  tiempo_maximo_horas: '24',
  horas_lenta: '12',
  horas_estancada: '24',
  bloque_recurrente_horas: '24',
  descuento_lenta: '0',
  descuento_estancada_por_bloque: '0',
  limite_descuento_total: '0',
  accion_recomendada: '',
  reduce_score: false,
  escalar_a_humano: false,
  crear_tarea: true,
  mover_a_nurturing: false,
  activo: true
};

async function parseJson(res: Response) {
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return data;
}

export default function AdminFunnelPage() {
  const searchParams = useSearchParams();
  const etapaSeleccionada = searchParams.get('etapa');
  const [loading, setLoading] = useState(true);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [subestados, setSubestados] = useState<Subestado[]>([]);
  const [reglas, setReglas] = useState<Regla[]>([]);

  const [etapaForm, setEtapaForm] = useState(emptyEtapa);
  const [subestadoForm, setSubestadoForm] = useState(emptySubestado);
  const [reglaForm, setReglaForm] = useState(emptyRegla);

  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [edicion, setEdicion] = useState<{ tipo: 'etapa' | 'subestado'; id: string } | null>(null);

  const mapaEtapas = useMemo(() => Object.fromEntries(etapas.map((e) => [e.id, e.nombre])), [etapas]);

  const subestadosEtapaRegla = useMemo(
    () => subestados.filter((s) => s.etapa_id === reglaForm.etapa_id && s.activo),
    [reglaForm.etapa_id, subestados]
  );

  async function cargar() {
    setLoading(true);
    setErrorMessage('');

    const [rEtapas, rSubestados, rReglas] = await Promise.all([
      fetch('/api/admin/funnel/etapas', { cache: 'no-store' }),
      fetch('/api/admin/funnel/subestados', { cache: 'no-store' }),
      fetch('/api/admin/funnel/reglas-estancamiento', { cache: 'no-store' })
    ]);

    const [dEtapas, dSubestados, dReglas] = await Promise.all([
      parseJson(rEtapas),
      parseJson(rSubestados),
      parseJson(rReglas)
    ]);

    if (!rEtapas.ok || !rSubestados.ok || !rReglas.ok || !dEtapas?.ok || !dSubestados?.ok || !dReglas?.ok) {
      setErrorMessage(
        dEtapas?.error || dSubestados?.error || dReglas?.error || 'No fue posible cargar configuración del funnel.'
      );
      setLoading(false);
      return;
    }

    setEtapas(dEtapas.items || []);
    setSubestados(dSubestados.items || []);
    setReglas(dReglas.items || []);
    setLoading(false);
  }

  useEffect(() => {
    void cargar();
  }, []);

  async function crearEtapa(e: FormEvent) {
    e.preventDefault();
    if (!etapaForm.nombre.trim()) {
      setErrorMessage('El nombre de la etapa es obligatorio.');
      return;
    }
    setGuardando(true);
    const res = await fetch('/api/admin/funnel/etapas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(etapaForm)
    });
    const data = await parseJson(res);
    setGuardando(false);

    if (!res.ok || !data?.ok) {
      setErrorMessage(data?.error || 'No se pudo crear la etapa.');
      return;
    }

    setEtapaForm(emptyEtapa);
    setSuccessMessage('Etapa creada correctamente.');
    await cargar();
  }

  async function actualizarEtapa(id: string, patch: Partial<Etapa>, recargar = true) {
    const res = await fetch(`/api/admin/funnel/etapas/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    const data = await parseJson(res);
    if (!res.ok || !data?.ok) {
      setErrorMessage(data?.error || 'No se pudo actualizar la etapa.');
      return false;
    }
    setSuccessMessage('Etapa actualizada.');
    if (recargar) await cargar();
    return true;
  }

  async function moverEtapa(index: number, direccion: 'up' | 'down') {
    const destino = direccion === 'up' ? index - 1 : index + 1;
    if (destino < 0 || destino >= etapas.length) return;

    const actual = etapas[index];
    const otra = etapas[destino];
    const primero = await actualizarEtapa(actual.id, { orden: -Date.now() }, false);
    const segundo = primero && await actualizarEtapa(otra.id, { orden: actual.orden }, false);
    const tercero = segundo && await actualizarEtapa(actual.id, { orden: otra.orden }, false);
    if (tercero) { setSuccessMessage('Orden de etapa actualizado.'); await cargar(); }
  }

  async function crearSubestado(e: FormEvent) {
    e.preventDefault();
    if (!subestadoForm.nombre.trim() || !subestadoForm.etapa_id) {
      setErrorMessage('Debes elegir etapa y nombre del subestado.');
      return;
    }

    setGuardando(true);
    const res = await fetch('/api/admin/funnel/subestados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...subestadoForm,
        tiempo_maximo_horas: subestadoForm.tiempo_maximo_horas ? Number(subestadoForm.tiempo_maximo_horas) : null
      })
    });
    const data = await parseJson(res);
    setGuardando(false);

    if (!res.ok || !data?.ok) {
      setErrorMessage(data?.error || 'No se pudo crear el subestado.');
      return;
    }

    setSubestadoForm(emptySubestado);
    setSuccessMessage('Subestado creado correctamente.');
    await cargar();
  }

  async function actualizarSubestado(id: string, patch: Partial<Subestado>, recargar = true) {
    const res = await fetch(`/api/admin/funnel/subestados/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    const data = await parseJson(res);
    if (!res.ok || !data?.ok) {
      setErrorMessage(data?.error || 'No se pudo actualizar el subestado.');
      return false;
    }
    setSuccessMessage('Subestado actualizado.');
    if (recargar) await cargar();
    return true;
  }

  async function moverSubestado(row: Subestado, direccion: 'up' | 'down') {
    const delMismoGrupo = subestados
      .filter((s) => s.etapa_id === row.etapa_id)
      .sort((a, b) => a.orden - b.orden);
    const index = delMismoGrupo.findIndex((s) => s.id === row.id);
    const destino = direccion === 'up' ? index - 1 : index + 1;
    if (destino < 0 || destino >= delMismoGrupo.length) return;

    const actual = delMismoGrupo[index];
    const otro = delMismoGrupo[destino];
    const primero = await actualizarSubestado(actual.id, { orden: -Date.now() }, false);
    const segundo = primero && await actualizarSubestado(otro.id, { orden: actual.orden }, false);
    const tercero = segundo && await actualizarSubestado(actual.id, { orden: otro.orden }, false);
    if (tercero) { setSuccessMessage('Orden de subetapa actualizado.'); await cargar(); }
  }

  async function crearRegla(e: FormEvent) {
    e.preventDefault();

    if (reglaForm.nivel === 'etapa' && !reglaForm.etapa_id) {
      setErrorMessage('Selecciona una etapa para crear la regla.');
      return;
    }
    if (reglaForm.nivel === 'subestado' && !reglaForm.subestado_id) {
      setErrorMessage('Selecciona un subestado para crear la regla.');
      return;
    }

    const tiempo = Number(reglaForm.tiempo_maximo_horas);
    const lenta = Number(reglaForm.horas_lenta);
    const estancada = Number(reglaForm.horas_estancada);
    if (!Number.isFinite(tiempo) || !Number.isFinite(lenta) || !Number.isFinite(estancada) || lenta <= 0 || estancada <= lenta) {
      setErrorMessage('Define umbrales válidos: Lenta debe ser menor que Estancada.');
      return;
    }

    setGuardando(true);
    const res = await fetch('/api/admin/funnel/reglas-estancamiento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        etapa_id: reglaForm.nivel === 'etapa' ? reglaForm.etapa_id : null,
        subestado_id: reglaForm.nivel === 'subestado' ? reglaForm.subestado_id : null,
        tiempo_maximo_horas: tiempo,
        horas_lenta: lenta,
        horas_estancada: estancada,
        bloque_recurrente_horas: Number(reglaForm.bloque_recurrente_horas || 0),
        descuento_lenta: Number(reglaForm.descuento_lenta || 0),
        descuento_estancada_por_bloque: Number(reglaForm.descuento_estancada_por_bloque || 0),
        limite_descuento_total: Number(reglaForm.limite_descuento_total || 0),
        accion_recomendada: reglaForm.accion_recomendada,
        reduce_score: reglaForm.reduce_score,
        escalar_a_humano: reglaForm.escalar_a_humano,
        crear_tarea: reglaForm.crear_tarea,
        mover_a_nurturing: reglaForm.mover_a_nurturing,
        activo: reglaForm.activo
      })
    });
    const data = await parseJson(res);
    setGuardando(false);

    if (!res.ok || !data?.ok) {
      setErrorMessage(data?.error || 'No se pudo crear la regla de estancamiento.');
      return;
    }

    setReglaForm(emptyRegla);
    setSuccessMessage('Regla de estancamiento creada.');
    await cargar();
  }

  async function toggleRegla(id: string, activo: boolean) {
    const res = await fetch(`/api/admin/funnel/reglas-estancamiento/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: !activo })
    });
    const data = await parseJson(res);
    if (!res.ok || !data?.ok) {
      setErrorMessage(data?.error || 'No se pudo actualizar la regla.');
      return;
    }
    setSuccessMessage('Regla actualizada.');
    await cargar();
  }

  async function actualizarRegla(id: string, patch: Partial<Regla>) {
    const res = await fetch(`/api/admin/funnel/reglas-estancamiento/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    const data = await parseJson(res);
    if (!res.ok || !data?.ok) {
      setErrorMessage(data?.error || 'No se pudo actualizar la regla.');
      return;
    }
    setSuccessMessage('Regla actualizada.');
    await cargar();
  }

  const etapasActivas = etapas.filter((etapa) => etapa.activo).sort((a, b) => a.orden - b.orden);
  const subestadosActivos = subestados.filter((subestado) => subestado.activo);
  const reglasActivas = reglas.filter((regla) => regla.activo);
  const etapaActual = etapasActivas.find((etapa) => etapa.id === etapaSeleccionada) || null;
  const subestadosEtapaActual = subestados.filter((s) => s.etapa_id === etapaSeleccionada).sort((a, b) => a.orden - b.orden);
  const reglaEtapaActual = reglas.find((r) => r.etapa_id === etapaSeleccionada && !r.subestado_id && r.activo) || null;
  const [etapaEditando, setEtapaEditando] = useState(false);
  const [etapaDraft, setEtapaDraft] = useState({ nombre: '', descripcion: '' });
  const [reglaEtapaEditando, setReglaEtapaEditando] = useState(false);
  const [reglaEtapaDraft, setReglaEtapaDraft] = useState({ lenta: '24', estancada: '48', accion: '' });
  const [subEditando, setSubEditando] = useState<string | null>(null);
  const [subDraft, setSubDraft] = useState({ nombre: '', descripcion: '', maximo: '' });
  const [subReglaEditando, setSubReglaEditando] = useState<string | null>(null);
  const [subReglaDraft, setSubReglaDraft] = useState({ lenta: '24', estancada: '48', accion: '' });

  useEffect(() => {
    if (!etapaActual) return;
    setEtapaDraft({ nombre: etapaActual.nombre, descripcion: etapaActual.descripcion || '' });
    setReglaEtapaDraft({ lenta: String(reglaEtapaActual?.horas_lenta ?? 24), estancada: String(reglaEtapaActual?.horas_estancada ?? reglaEtapaActual?.tiempo_maximo_horas ?? 48), accion: reglaEtapaActual?.accion_recomendada || '' });
  }, [etapaActual?.id, etapaActual?.nombre, etapaActual?.descripcion, reglaEtapaActual?.id, reglaEtapaActual?.horas_lenta, reglaEtapaActual?.horas_estancada]);

  async function guardarRegla(etapaId: string, subestadoId: string | null, draft: { lenta: string; estancada: string; accion: string }, existente: Regla | null) {
    const lenta = Number(draft.lenta); const estancada = Number(draft.estancada);
    if (!Number.isFinite(lenta) || !Number.isFinite(estancada) || lenta <= 0 || estancada <= lenta) { setErrorMessage('La regla debe tener horas válidas y Estancada debe ser mayor que Lenta.'); return; }
    const payload = { etapa_id: subestadoId ? null : etapaId, subestado_id: subestadoId, tiempo_maximo_horas: estancada, horas_lenta: lenta, horas_estancada: estancada, accion_recomendada: draft.accion, activo: true };
    const res = await fetch(existente ? `/api/admin/funnel/reglas-estancamiento/${existente.id}` : '/api/admin/funnel/reglas-estancamiento', { method: existente ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await parseJson(res);
    if (!res.ok || !data?.ok) { setErrorMessage(data?.error || 'No se pudo guardar la regla.'); return; }
    setSuccessMessage('Regla guardada.'); await cargar();
  }

  function abrirNuevaSubetapa(etapaId: string) {
    setSubestadoForm({ ...emptySubestado, etapa_id: etapaId });
    document.getElementById('administracion-avanzada')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function abrirNuevaRegla(etapaId: string, subestadoId?: string) {
    setReglaForm({ ...emptyRegla, etapa_id: etapaId, subestado_id: subestadoId || '' });
    document.getElementById('administracion-avanzada')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Configuración de Funnel</h1>
        <p className="text-sm text-buscoedu-muted">Administra las subetapas y reglas operativas del funnel activo. Las etapas históricas inactivas no se muestran.</p>
        <a href="/admin/funnel/cierres" className="mt-3 inline-flex rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">Configurar cierres Ganada / Perdida →</a>
      </div>

      {loading ? (
        <div className="rounded-xl border border-buscoedu-border bg-white p-4 text-sm text-buscoedu-muted">
          Cargando configuración del funnel...
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">Las etapas se mantienen protegidas para conservar el historial. Solo se muestran etapas activas; dentro de cada ficha puedes editar subetapas y reglas.</div>

          <div className="grid grid-cols-1 gap-3">
            {etapasActivas.filter((etapa) => !etapaSeleccionada || etapa.id === etapaSeleccionada).map((etapa) => {
              const hijos = subestadosActivos.filter((s) => s.etapa_id === etapa.id).sort((a, b) => a.orden - b.orden);
              const reglasEtapa = reglasActivas.filter((r) => r.etapa_id === etapa.id || hijos.some((s) => s.id === r.subestado_id));
              return (
                <article id={`etapa-${etapa.id}`} key={etapa.id} onClick={() => { if (!etapaSeleccionada) window.location.href = `/admin/funnel?etapa=${etapa.id}`; }} className={`rounded-2xl border bg-white p-5 shadow-card ${etapaSeleccionada === etapa.id ? 'border-blue-500 ring-2 ring-blue-100' : 'border-buscoedu-border'} ${!etapaSeleccionada ? 'cursor-pointer transition hover:border-blue-400 hover:shadow-lg' : ''}`}>
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Etapa {etapa.orden}</p><h2 className="text-xl font-bold text-buscoedu-text">{etapa.nombre}</h2><p className="text-xs text-gray-500">{etapa.descripcion || 'Configuración operativa de la etapa'}</p></div>
                    <div className="flex items-center gap-1"><button type="button" disabled={etapasActivas.findIndex((e) => e.id === etapa.id) === 0} onClick={(e) => { e.stopPropagation(); void moverEtapa(etapasActivas.findIndex((x) => x.id === etapa.id), 'up'); }} className="rounded border px-2 py-1 text-xs disabled:opacity-30">↑</button><button type="button" disabled={etapasActivas.findIndex((e) => e.id === etapa.id) === etapasActivas.length - 1} onClick={(e) => { e.stopPropagation(); void moverEtapa(etapasActivas.findIndex((x) => x.id === etapa.id), 'down'); }} className="rounded border px-2 py-1 text-xs disabled:opacity-30">↓</button><span className="ml-2 h-4 w-4 rounded-full" style={{ backgroundColor: etapa.color || '#94a3b8' }} aria-label={`Color ${etapa.nombre}`} /></div>
                  </div>
                  {false && etapaSeleccionada ? <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-buscoedu-text">Subetapas</h3>
                    {hijos.map((row) => (
                      <div key={row.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                        {edicion?.tipo === 'subestado' && edicion.id === row.id ? <div className="space-y-2"><input defaultValue={row.nombre} id={`nombre-subestado-${row.id}`} className="w-full rounded border px-2 py-1 text-sm" /><input defaultValue={row.descripcion || ''} id={`descripcion-subestado-${row.id}`} className="w-full rounded border px-2 py-1 text-xs" placeholder="Descripción" /><input defaultValue={row.tiempo_maximo_horas ?? ''} id={`horas-subestado-${row.id}`} type="number" className="w-full rounded border px-2 py-1 text-xs" placeholder="Horas máximas" /><div className="flex gap-2"><button type="button" onClick={() => { const nombre = (document.getElementById(`nombre-subestado-${row.id}`) as HTMLInputElement)?.value; const descripcion = (document.getElementById(`descripcion-subestado-${row.id}`) as HTMLInputElement)?.value; const tiempo_maximo_horas = Number((document.getElementById(`horas-subestado-${row.id}`) as HTMLInputElement)?.value || 0); void actualizarSubestado(row.id, { nombre, descripcion, tiempo_maximo_horas }); setEdicion(null); }} className="rounded-lg bg-buscoedu-blue px-3 py-1 text-xs font-semibold text-white">Guardar</button><button type="button" onClick={() => setEdicion(null)} className="rounded-lg border px-3 py-1 text-xs">Cancelar</button></div></div> : <div className="flex items-center justify-between gap-2"><div><p className="text-sm font-semibold text-buscoedu-text">{row.orden}. {row.nombre}</p><p className="text-xs text-gray-500">Lenta/estancamiento se configura en sus reglas · máximo histórico: {row.tiempo_maximo_horas ?? '—'} h</p></div><button type="button" onClick={() => setEdicion({ tipo: 'subestado', id: row.id })} className="rounded-lg border px-3 py-1 text-xs font-semibold">Editar</button></div>}
                      </div>
                    ))}
                    {hijos.length === 0 && <p className="text-xs text-gray-500">No hay subetapas activas.</p>}
                    {subestados.filter((s) => s.etapa_id === etapa.id && !s.activo).length > 0 && <div className="border-t border-gray-200 pt-3"><p className="mb-2 text-xs font-semibold text-gray-400">Subetapas desactivadas</p><div className="flex flex-wrap gap-2">{subestados.filter((s) => s.etapa_id === etapa.id && !s.activo).sort((a, b) => a.orden - b.orden).map((row) => <button key={row.id} type="button" onClick={() => actualizarSubestado(row.id, { activo: true })} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-400 hover:text-blue-700">{row.nombre} · Activar</button>)}</div></div>}
                  <div className="mt-5 space-y-3 border-t border-gray-100 pt-4"><h3 className="text-sm font-semibold text-buscoedu-text">Reglas de estancamiento</h3>{reglasEtapa.length ? reglasEtapa.map((r) => <div key={r.id} className="rounded-xl border border-amber-100 bg-amber-50 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-amber-900">{r.subestado_id ? hijos.find((s) => s.id === r.subestado_id)?.nombre || 'Subetapa' : 'Regla de etapa'}</p><p className="text-xs text-amber-800">Lenta: {r.horas_lenta ?? Math.floor(r.tiempo_maximo_horas / 2)} h · Estancada: {r.horas_estancada ?? r.tiempo_maximo_horas} h</p>{r.accion_recomendada && <p className="mt-1 text-xs text-amber-900">{r.accion_recomendada}</p>}</div><button type="button" onClick={() => toggleRegla(r.id, r.activo)} className="rounded-lg border border-amber-200 bg-white px-2 py-1 text-xs">Desactivar</button></div></div>) : <p className="text-xs text-gray-500">No hay reglas activas configuradas para esta etapa.</p>}</div>
                  <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => abrirNuevaSubetapa(etapa.id)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">+ Nueva subetapa</button><button type="button" onClick={() => abrirNuevaRegla(etapa.id)} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">+ Nueva regla</button></div>
                  </div> : <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3 text-sm text-gray-600"><span>Regla: lenta {reglasEtapa.find((r) => !r.subestado_id)?.horas_lenta ?? '—'} h · estancada {reglasEtapa.find((r) => !r.subestado_id)?.horas_estancada ?? '—'} h</span><span className="text-blue-600">Seleccionar etapa →</span></div>}
                </article>
              );
            })}
          </div>

          {false && <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <h2 className="text-sm font-semibold text-gray-500">Etapas desactivadas</h2>
            <p className="mt-1 text-xs text-gray-500">Se conservan únicamente para proteger el historial. Puedes abrirlas y volver a activarlas.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {etapas.filter((etapa) => !etapa.activo).sort((a, b) => a.orden - b.orden).map((etapa) => (
                <button key={etapa.id} type="button" onClick={() => actualizarEtapa(etapa.id, { activo: true })} className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-700">
                  {etapa.orden}. {etapa.nombre} · Activar
                </button>
              ))}
              {!etapas.some((etapa) => !etapa.activo) && <p className="text-xs text-gray-400">No hay etapas desactivadas.</p>}
            </div>
          </section>}

          {etapaActual ? <section id="administracion-etapa" className="space-y-5 rounded-2xl border border-blue-200 bg-white p-5 shadow-card">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Administración única de la etapa</p><h2 className="text-2xl font-bold text-buscoedu-text">{etapaActual.nombre}</h2></div><div className="flex gap-2"><button type="button" onClick={() => actualizarEtapa(etapaActual.id, { activo: false })} className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700">Desactivar etapa</button><button type="button" onClick={() => { window.location.href = '/admin/funnel'; }} className="rounded-lg border px-3 py-2 text-sm">← Volver</button></div></div>
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-buscoedu-text">1. Nombre y descripción</h3>{!etapaEditando && <button type="button" onClick={() => setEtapaEditando(true)} className="rounded-lg border px-3 py-1.5 text-xs font-semibold">Editar</button>}</div>
              {etapaEditando ? <div className="space-y-2"><input value={etapaDraft.nombre} onChange={(e) => setEtapaDraft({ ...etapaDraft, nombre: e.target.value })} className="w-full rounded-lg border px-3 py-2" /><textarea value={etapaDraft.descripcion} onChange={(e) => setEtapaDraft({ ...etapaDraft, descripcion: e.target.value })} className="w-full rounded-lg border px-3 py-2 text-sm" rows={2} /><div className="flex gap-2"><button type="button" onClick={async () => { await actualizarEtapa(etapaActual.id, etapaDraft); setEtapaEditando(false); }} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Guardar</button><button type="button" onClick={() => { setEtapaDraft({ nombre: etapaActual.nombre, descripcion: etapaActual.descripcion || '' }); setEtapaEditando(false); }} className="rounded-lg border px-3 py-2 text-xs">Cancelar</button></div></div> : <><p className="font-medium">{etapaActual.nombre}</p><p className="text-sm text-gray-500">{etapaActual.descripcion || 'Sin descripción'}</p></>}
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold text-amber-900">2. Regla de estancamiento de la etapa</h3><p className="text-xs text-amber-800">Una única regla general para esta etapa.</p></div>{!reglaEtapaEditando && <button type="button" onClick={() => setReglaEtapaEditando(true)} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold">Editar</button>}</div>{reglaEtapaEditando ? <div className="space-y-2"><div className="grid gap-2 sm:grid-cols-2"><FormField label="Lenta desde (horas)" value={reglaEtapaDraft.lenta} onChange={(e) => setReglaEtapaDraft({ ...reglaEtapaDraft, lenta: e.target.value })} type="number" /><FormField label="Estancada desde (horas)" value={reglaEtapaDraft.estancada} onChange={(e) => setReglaEtapaDraft({ ...reglaEtapaDraft, estancada: e.target.value })} type="number" /></div><FormTextarea label="Acción recomendada" value={reglaEtapaDraft.accion} onChange={(e) => setReglaEtapaDraft({ ...reglaEtapaDraft, accion: e.target.value })} /><div className="flex gap-2"><button type="button" onClick={async () => { await guardarRegla(etapaActual.id, null, reglaEtapaDraft, reglaEtapaActual); setReglaEtapaEditando(false); }} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white">Guardar</button><button type="button" onClick={() => setReglaEtapaEditando(false)} className="rounded-lg border px-3 py-2 text-xs">Cancelar</button></div></div> : <p className="text-sm text-amber-900">Lenta: {reglaEtapaActual?.horas_lenta ?? '—'} h · Estancada: {reglaEtapaActual?.horas_estancada ?? '—'} h</p>}</div>
            <div className="rounded-xl border border-gray-200 p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-buscoedu-text">3. Subetapas</h3><button type="button" onClick={() => abrirNuevaSubetapa(etapaActual.id)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">+ Nueva subetapa</button></div><div className="space-y-3">{subestadosEtapaActual.map((row, index) => { const regla = reglas.find((r) => r.subestado_id === row.id && r.activo) || null; return <div key={row.id} className={`rounded-xl border p-3 ${row.activo ? 'bg-white' : 'bg-gray-50 text-gray-400'}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{row.orden}. {row.nombre}</p><p className="text-xs">Regla: lenta {regla?.horas_lenta ?? '—'} h · estancada {regla?.horas_estancada ?? '—'} h</p></div><div className="flex gap-1"><button type="button" disabled={index === 0} onClick={() => moverSubestado(row, 'up')} className="rounded border px-2 py-1 text-xs disabled:opacity-30">↑</button><button type="button" disabled={index === subestadosEtapaActual.length - 1} onClick={() => moverSubestado(row, 'down')} className="rounded border px-2 py-1 text-xs disabled:opacity-30">↓</button>{row.activo ? <button type="button" onClick={() => { setSubEditando(row.id); setSubDraft({ nombre: row.nombre, descripcion: row.descripcion || '', maximo: String(row.tiempo_maximo_horas ?? '') }); }} className="rounded border px-2 py-1 text-xs">Editar</button> : <button type="button" onClick={() => actualizarSubestado(row.id, { activo: true })} className="rounded border px-2 py-1 text-xs">Activar</button>}</div></div>{subEditando === row.id && <div className="mt-3 space-y-2 border-t pt-3"><input value={subDraft.nombre} onChange={(e) => setSubDraft({ ...subDraft, nombre: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" /><textarea value={subDraft.descripcion} onChange={(e) => setSubDraft({ ...subDraft, descripcion: e.target.value })} className="w-full rounded border px-2 py-1 text-sm" rows={2} /><div className="flex gap-2"><button type="button" onClick={async () => { await actualizarSubestado(row.id, { nombre: subDraft.nombre, descripcion: subDraft.descripcion, tiempo_maximo_horas: Number(subDraft.maximo) || null }); setSubEditando(null); }} className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white">Guardar</button><button type="button" onClick={() => setSubEditando(null)} className="rounded border px-3 py-1.5 text-xs">Cancelar</button></div></div>}<div className="mt-3 border-t pt-3">{subReglaEditando === row.id ? <div className="space-y-2"><div className="grid gap-2 sm:grid-cols-2"><FormField label="Lenta (horas)" value={subReglaDraft.lenta} onChange={(e) => setSubReglaDraft({ ...subReglaDraft, lenta: e.target.value })} type="number" /><FormField label="Estancada (horas)" value={subReglaDraft.estancada} onChange={(e) => setSubReglaDraft({ ...subReglaDraft, estancada: e.target.value })} type="number" /></div><FormTextarea label="Acción recomendada" value={subReglaDraft.accion} onChange={(e) => setSubReglaDraft({ ...subReglaDraft, accion: e.target.value })} /><div className="flex gap-2"><button type="button" onClick={async () => { await guardarRegla(etapaActual.id, row.id, subReglaDraft, regla); setSubReglaEditando(null); }} className="rounded bg-amber-600 px-3 py-1.5 text-xs text-white">Guardar</button><button type="button" onClick={() => setSubReglaEditando(null)} className="rounded border px-3 py-1.5 text-xs">Cancelar</button></div></div> : <button type="button" onClick={() => { setSubReglaEditando(row.id); setSubReglaDraft({ lenta: String(regla?.horas_lenta ?? 24), estancada: String(regla?.horas_estancada ?? row.tiempo_maximo_horas ?? 48), accion: regla?.accion_recomendada || '' }); }} className="text-xs font-semibold text-amber-700">Editar regla de esta subetapa</button>}</div></div>; })}</div></div>
          </section> : null}
          {false && <>
              <form onSubmit={crearSubestado} className="space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-buscoedu-text">Etapa padre</span>
                  <select
                    value={subestadoForm.etapa_id}
                    onChange={(e) => setSubestadoForm((prev) => ({ ...prev, etapa_id: e.target.value }))}
                    className="w-full rounded-md border border-buscoedu-border px-3 py-2"
                  >
                    <option value="">Seleccionar etapa</option>
                    {etapasActivas.map((e) => (
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                </label>
                <FormField
                  label="Nombre"
                  value={subestadoForm.nombre}
                  onChange={(e) => setSubestadoForm((prev) => ({ ...prev, nombre: e.target.value }))}
                  requiredMark
                />
                <FormTextarea
                  label="Descripción"
                  value={subestadoForm.descripcion}
                  onChange={(e) => setSubestadoForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                />
                <FormField
                  label="Tiempo máximo (horas)"
                  value={subestadoForm.tiempo_maximo_horas}
                  onChange={(e) => setSubestadoForm((prev) => ({ ...prev, tiempo_maximo_horas: e.target.value }))}
                  type="number"
                />
                <FormToggle
                  label="Activo"
                  checked={subestadoForm.activo}
                  onChange={(checked) => setSubestadoForm((prev) => ({ ...prev, activo: checked }))}
                />
                <button
                  type="submit"
                  disabled={guardando}
                  className="rounded-lg bg-buscoedu-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Crear subestado
                </button>
              </form>

              <div className="space-y-3">
                {etapas.filter((etapa) => etapa.id === etapaSeleccionada).map((etapa) => {
                  const rows = subestados
                    .filter((s) => s.etapa_id === etapa.id)
                    .sort((a, b) => a.orden - b.orden);
                  if (rows.length === 0) return null;

                  return (
                    <div key={etapa.id} className="rounded-lg border border-gray-200 p-3">
                      <p className="mb-2 text-sm font-semibold text-buscoedu-text">{etapa.nombre}</p>
                      <div className="space-y-2">
                        {rows.map((row) => (
                          <div key={row.id} className="flex items-start justify-between gap-2 rounded border border-gray-100 p-2">
                            <div>
                              {edicion?.tipo === 'subestado' && edicion.id === row.id ? <div className="space-y-2"><input defaultValue={row.nombre} id={`nombre-subestado-${row.id}`} className="w-full rounded border px-2 py-1 text-sm" /><input defaultValue={row.descripcion || ''} id={`descripcion-subestado-${row.id}`} className="w-full rounded border px-2 py-1 text-xs" placeholder="Descripción" /></div> : <p className="text-sm font-medium">{row.nombre}</p>}
                              <p className="text-xs text-gray-500">Orden {row.orden} · {row.tiempo_maximo_horas ?? '—'}h · {row.activo ? 'Activo' : 'Inactivo'}</p>
                            </div>
                            <div className="flex gap-1">
                              <button type="button" onClick={() => moverSubestado(row, 'up')} className="rounded border px-2 py-1 text-xs">↑</button>
                              <button type="button" onClick={() => moverSubestado(row, 'down')} className="rounded border px-2 py-1 text-xs">↓</button>
                              {edicion?.tipo === 'subestado' && edicion.id === row.id ? <button type="button" onClick={() => { const nombre = (document.getElementById(`nombre-subestado-${row.id}`) as HTMLInputElement)?.value; const descripcion = (document.getElementById(`descripcion-subestado-${row.id}`) as HTMLInputElement)?.value; void actualizarSubestado(row.id, { nombre, descripcion }); setEdicion(null); }} className="rounded border px-2 py-1 text-xs">Guardar</button> : <button type="button" onClick={() => setEdicion({ tipo: 'subestado', id: row.id })} className="rounded border px-2 py-1 text-xs">Editar</button>}
                              <button
                                type="button"
                                onClick={() => actualizarSubestado(row.id, { activo: !row.activo })}
                                className="rounded border px-2 py-1 text-xs"
                              >
                                {row.activo ? 'Desactivar' : 'Activar'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
          <div className="space-y-4 rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
            <h2 className="text-lg font-semibold text-buscoedu-text">C) Reglas de Estancamiento</h2>

            <form onSubmit={crearRegla} className="space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
              <label className="block text-sm">
                <span className="mb-1 block text-buscoedu-text">Nivel de regla</span>
                <select
                  value={reglaForm.nivel}
                  onChange={(e) => setReglaForm((prev) => ({ ...prev, nivel: e.target.value as 'etapa' | 'subestado' }))}
                  className="w-full rounded-md border border-buscoedu-border px-3 py-2"
                >
                  <option value="etapa">Etapa</option>
                  <option value="subestado">Subestado</option>
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-buscoedu-text">Etapa</span>
                <select
                  value={reglaForm.etapa_id}
                  onChange={(e) => setReglaForm((prev) => ({ ...prev, etapa_id: e.target.value, subestado_id: '' }))}
                  className="w-full rounded-md border border-buscoedu-border px-3 py-2"
                >
                  <option value="">Seleccionar etapa</option>
                  {etapas.filter((e) => e.id === etapaSeleccionada).map((e) => (
                    <option key={e.id} value={e.id}>{e.nombre}</option>
                  ))}
                </select>
              </label>

              {reglaForm.nivel === 'subestado' && (
                <label className="block text-sm">
                  <span className="mb-1 block text-buscoedu-text">Subestado</span>
                  <select
                    value={reglaForm.subestado_id}
                    onChange={(e) => setReglaForm((prev) => ({ ...prev, subestado_id: e.target.value }))}
                    className="w-full rounded-md border border-buscoedu-border px-3 py-2"
                  >
                    <option value="">Seleccionar subestado</option>
                    {subestadosEtapaRegla.map((s) => (
                      <option key={s.id} value={s.id}>{s.nombre}</option>
                    ))}
                  </select>
                </label>
              )}

              <FormField
                label="Compatibilidad: tiempo máximo histórico (horas)"
                value={reglaForm.tiempo_maximo_horas}
                onChange={(e) => setReglaForm((prev) => ({ ...prev, tiempo_maximo_horas: e.target.value }))}
                type="number"
                requiredMark
              />

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <FormField label="Lenta desde (horas)" value={reglaForm.horas_lenta} onChange={(e) => setReglaForm((prev) => ({ ...prev, horas_lenta: e.target.value }))} type="number" requiredMark />
                <FormField label="Estancada desde (horas)" value={reglaForm.horas_estancada} onChange={(e) => setReglaForm((prev) => ({ ...prev, horas_estancada: e.target.value }))} type="number" requiredMark />
                <FormField label="Bloque recurrente (horas)" value={reglaForm.bloque_recurrente_horas} onChange={(e) => setReglaForm((prev) => ({ ...prev, bloque_recurrente_horas: e.target.value }))} type="number" />
                <FormField label="Descuento al quedar lenta" value={reglaForm.descuento_lenta} onChange={(e) => setReglaForm((prev) => ({ ...prev, descuento_lenta: e.target.value }))} type="number" />
                <FormField label="Descuento por bloque estancada" value={reglaForm.descuento_estancada_por_bloque} onChange={(e) => setReglaForm((prev) => ({ ...prev, descuento_estancada_por_bloque: e.target.value }))} type="number" />
                <FormField label="Límite descuento total" value={reglaForm.limite_descuento_total} onChange={(e) => setReglaForm((prev) => ({ ...prev, limite_descuento_total: e.target.value }))} type="number" />
              </div>

              <FormTextarea
                label="Acción recomendada (descriptiva)"
                value={reglaForm.accion_recomendada}
                onChange={(e) => setReglaForm((prev) => ({ ...prev, accion_recomendada: e.target.value }))}
              />

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <FormToggle label="Reducir score" checked={reglaForm.reduce_score} onChange={(checked) => setReglaForm((prev) => ({ ...prev, reduce_score: checked }))} />
                <FormToggle label="Escalar a humano" checked={reglaForm.escalar_a_humano} onChange={(checked) => setReglaForm((prev) => ({ ...prev, escalar_a_humano: checked }))} />
                <FormToggle label="Crear tarea" checked={reglaForm.crear_tarea} onChange={(checked) => setReglaForm((prev) => ({ ...prev, crear_tarea: checked }))} />
                <FormToggle label="Mover a nurturing" checked={reglaForm.mover_a_nurturing} onChange={(checked) => setReglaForm((prev) => ({ ...prev, mover_a_nurturing: checked }))} />
                <FormToggle label="Activa" checked={reglaForm.activo} onChange={(checked) => setReglaForm((prev) => ({ ...prev, activo: checked }))} />
              </div>

              <button
                type="submit"
                disabled={guardando}
                className="rounded-lg bg-buscoedu-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Crear regla
              </button>
            </form>

            <div className="space-y-2">
              {reglas.length === 0 ? (
                <p className="text-sm text-gray-500">No hay reglas configuradas.</p>
              ) : (
                  reglas.filter((r) => r.etapa_id === etapaSeleccionada || (r.subestado_id && subestados.some((s) => s.id === r.subestado_id && s.etapa_id === etapaSeleccionada))).map((r) => (
                  <div key={r.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-buscoedu-text">
                          {r.subestado_id
                            ? `Subestado: ${subestados.find((s) => s.id === r.subestado_id)?.nombre || r.subestado_id}`
                            : `Etapa: ${mapaEtapas[r.etapa_id || ''] || r.etapa_id}`}
                        </p>
                        <p className="text-xs text-gray-500">Lenta: {r.horas_lenta ?? Math.floor(r.tiempo_maximo_horas / 2)}h · Estancada: {r.horas_estancada ?? r.tiempo_maximo_horas}h · {r.activo ? 'Activa' : 'Inactiva'}</p>
                        {(r.descuento_lenta || r.descuento_estancada_por_bloque) ? <p className="text-xs text-gray-500">Salud: −{r.descuento_lenta || 0} al quedar lenta; −{r.descuento_estancada_por_bloque || 0} por bloque.</p> : null}
                        {r.accion_recomendada && <p className="mt-1 text-xs text-gray-600">{r.accion_recomendada}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleRegla(r.id, r.activo)}
                        className="rounded border px-2 py-1 text-xs"
                      >
                        {r.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
              </div></>}
        </>
      )}

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
