'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
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

  async function actualizarEtapa(id: string, patch: Partial<Etapa>) {
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
    await cargar();
    return true;
  }

  async function moverEtapa(index: number, direccion: 'up' | 'down') {
    const destino = direccion === 'up' ? index - 1 : index + 1;
    if (destino < 0 || destino >= etapas.length) return;

    const actual = etapas[index];
    const otra = etapas[destino];
    await actualizarEtapa(actual.id, { orden: otra.orden });
    await actualizarEtapa(otra.id, { orden: actual.orden });
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

  async function actualizarSubestado(id: string, patch: Partial<Subestado>) {
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
    await cargar();
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
    await actualizarSubestado(actual.id, { orden: otro.orden });
    await actualizarSubestado(otro.id, { orden: actual.orden });
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
    if (!Number.isFinite(tiempo) || tiempo <= 0) {
      setErrorMessage('El tiempo máximo debe ser mayor a 0.');
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

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Configuración de Funnel</h1>
        <p className="text-sm text-buscoedu-muted">
          Gestiona etapas, subestados y reglas de estancamiento. Acceso exclusivo para super_admin.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-buscoedu-border bg-white p-4 text-sm text-buscoedu-muted">
          Cargando configuración del funnel...
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            Precedencia: se aplica primero regla de subestado; si no existe, regla de etapa; si no hay regla activa, no se marca estancamiento.
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
            <div className="space-y-4 rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
              <h2 className="text-lg font-semibold text-buscoedu-text">A) Gestión de Etapas</h2>
              <form onSubmit={crearEtapa} className="space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                <FormField
                  label="Nombre"
                  value={etapaForm.nombre}
                  onChange={(e) => setEtapaForm((prev) => ({ ...prev, nombre: e.target.value }))}
                  requiredMark
                />
                <FormTextarea
                  label="Descripción"
                  value={etapaForm.descripcion}
                  onChange={(e) => setEtapaForm((prev) => ({ ...prev, descripcion: e.target.value }))}
                />
                <FormField
                  label="Color (hex)"
                  value={etapaForm.color}
                  onChange={(e) => setEtapaForm((prev) => ({ ...prev, color: e.target.value }))}
                />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <FormToggle
                    label="Final ganada"
                    checked={etapaForm.es_etapa_final_ganada}
                    onChange={(checked) => setEtapaForm((prev) => ({ ...prev, es_etapa_final_ganada: checked }))}
                  />
                  <FormToggle
                    label="Final perdida"
                    checked={etapaForm.es_etapa_final_perdida}
                    onChange={(checked) => setEtapaForm((prev) => ({ ...prev, es_etapa_final_perdida: checked }))}
                  />
                  <FormToggle
                    label="Activa"
                    checked={etapaForm.activo}
                    onChange={(checked) => setEtapaForm((prev) => ({ ...prev, activo: checked }))}
                  />
                </div>
                <button
                  type="submit"
                  disabled={guardando}
                  className="rounded-lg bg-buscoedu-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Crear etapa
                </button>
              </form>

              <div className="space-y-2">
                {etapas.map((etapa, index) => (
                  <div key={etapa.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-buscoedu-text">{etapa.nombre}</p>
                        <p className="text-xs text-gray-500">Orden {etapa.orden} · {etapa.descripcion || 'Sin descripción'}</p>
                        <p className="text-xs text-gray-500">{etapa.activo ? 'Activa' : 'Inactiva'}</p>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => moverEtapa(index, 'up')} className="rounded border px-2 py-1 text-xs">↑</button>
                        <button type="button" onClick={() => moverEtapa(index, 'down')} className="rounded border px-2 py-1 text-xs">↓</button>
                        <button
                          type="button"
                          onClick={() => actualizarEtapa(etapa.id, { activo: !etapa.activo })}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          {etapa.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-buscoedu-border bg-white p-4 shadow-card">
              <h2 className="text-lg font-semibold text-buscoedu-text">B) Gestión de Subestados</h2>
              <form onSubmit={crearSubestado} className="space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-buscoedu-text">Etapa padre</span>
                  <select
                    value={subestadoForm.etapa_id}
                    onChange={(e) => setSubestadoForm((prev) => ({ ...prev, etapa_id: e.target.value }))}
                    className="w-full rounded-md border border-buscoedu-border px-3 py-2"
                  >
                    <option value="">Seleccionar etapa</option>
                    {etapas.map((e) => (
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
                {etapas.map((etapa) => {
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
                              <p className="text-sm font-medium">{row.nombre}</p>
                              <p className="text-xs text-gray-500">Orden {row.orden} · {row.tiempo_maximo_horas ?? '—'}h · {row.activo ? 'Activo' : 'Inactivo'}</p>
                            </div>
                            <div className="flex gap-1">
                              <button type="button" onClick={() => moverSubestado(row, 'up')} className="rounded border px-2 py-1 text-xs">↑</button>
                              <button type="button" onClick={() => moverSubestado(row, 'down')} className="rounded border px-2 py-1 text-xs">↓</button>
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
            </div>
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
                  {etapas.map((e) => (
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
                label="Tiempo máximo (horas)"
                value={reglaForm.tiempo_maximo_horas}
                onChange={(e) => setReglaForm((prev) => ({ ...prev, tiempo_maximo_horas: e.target.value }))}
                type="number"
                requiredMark
              />

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
                reglas.map((r) => (
                  <div key={r.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-buscoedu-text">
                          {r.subestado_id
                            ? `Subestado: ${subestados.find((s) => s.id === r.subestado_id)?.nombre || r.subestado_id}`
                            : `Etapa: ${mapaEtapas[r.etapa_id || ''] || r.etapa_id}`}
                        </p>
                        <p className="text-xs text-gray-500">{r.tiempo_maximo_horas} horas · {r.activo ? 'Activa' : 'Inactiva'}</p>
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
          </div>
        </>
      )}

      {successMessage ? <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} /> : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
