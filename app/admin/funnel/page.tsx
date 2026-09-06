'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import FormField from '@/components/admin/FormField';
import FormTextarea from '@/components/admin/FormTextarea';
import ErrorToast from '@/components/admin/ErrorToast';
import SuccessToast from '@/components/admin/SuccessToast';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

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
  accion_recomendada: string | null;
  activo: boolean;
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const etapaSeleccionada = searchParams.get('etapa');

  const [loading, setLoading] = useState(true);
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [subestados, setSubestados] = useState<Subestado[]>([]);
  const [reglas, setReglas] = useState<Regla[]>([]);

  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Edición de nombre/descripción de la etapa
  const [etapaEditando, setEtapaEditando] = useState(false);
  const [etapaDraft, setEtapaDraft] = useState({ nombre: '', descripcion: '' });

  // Edición de la regla de estancamiento de la etapa
  const [reglaEtapaEditando, setReglaEtapaEditando] = useState(false);
  const [reglaEtapaDraft, setReglaEtapaDraft] = useState({ lenta: '24', estancada: '48', accion: '' });

  // Edición de subetapas
  const [subEditando, setSubEditando] = useState<string | null>(null);
  const [subDraft, setSubDraft] = useState({ nombre: '', descripcion: '', maximo: '' });

  // Edición de regla por subetapa
  const [subReglaEditando, setSubReglaEditando] = useState<string | null>(null);
  const [subReglaDraft, setSubReglaDraft] = useState({ lenta: '24', estancada: '48', accion: '' });

  // Alta de nueva subetapa (formulario inline dentro de la ficha de la etapa)
  const [nuevaSubAbierta, setNuevaSubAbierta] = useState(false);
  const [nuevaSubDraft, setNuevaSubDraft] = useState({ nombre: '', descripcion: '', maximo: '24' });
  const [guardandoSub, setGuardandoSub] = useState(false);

  // MEJORA 1: diálogo de confirmación antes de activar/desactivar una etapa o subetapa.
  // Evita cambios accidentales de estado que afectan al historial operativo.
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    tipo: 'etapa' | 'subetapa';
    id: string;
    nombre: string;
    activar: boolean;
  }>({ open: false, tipo: 'etapa', id: '', nombre: '', activar: false });
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Abre el diálogo de confirmación con los datos del elemento que se quiere activar/desactivar.
  function solicitarConfirmacion(tipo: 'etapa' | 'subetapa', id: string, nombre: string, activar: boolean) {
    setConfirmDialog({ open: true, tipo, id, nombre, activar });
  }

  // Ejecuta el cambio de estado (activo) una vez confirmado por el usuario.
  async function ejecutarCambioActivo() {
    setConfirmLoading(true);
    try {
      if (confirmDialog.tipo === 'etapa') {
        await actualizarEtapa(confirmDialog.id, { activo: confirmDialog.activar });
      } else {
        await actualizarSubestado(confirmDialog.id, { activo: confirmDialog.activar });
      }
    } finally {
      setConfirmLoading(false);
      setConfirmDialog((prev) => ({ ...prev, open: false }));
    }
  }

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

  // BUG 1: swap de orden sin overflow. Antes se usaba `orden: -Date.now()`
  // (~-1.7 billones), que desborda el tipo INTEGER de PostgreSQL. Ahora se
  // usa un valor temporal pequeño y libre (maxOrden + 1000) que sí cabe.
  async function moverEtapa(index: number, direccion: 'up' | 'down') {
    const lista = etapasActivas;
    const destino = direccion === 'up' ? index - 1 : index + 1;
    if (destino < 0 || destino >= lista.length) return;

    const actual = lista[index];
    const otra = lista[destino];
    const temp = Math.max(0, ...etapas.map((e) => e.orden || 0)) + 1000;

    const p1 = await actualizarEtapa(actual.id, { orden: temp }, false);
    const p2 = p1 && (await actualizarEtapa(otra.id, { orden: actual.orden }, false));
    const p3 = p2 && (await actualizarEtapa(actual.id, { orden: otra.orden }, false));
    if (p3) {
      setSuccessMessage('Orden de etapa actualizado.');
      await cargar();
    }
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

  // BUG 5: mismo arreglo de overflow para el reordenamiento de subetapas.
  async function moverSubestado(row: Subestado, direccion: 'up' | 'down') {
    const delMismoGrupo = subestados
      .filter((s) => s.etapa_id === row.etapa_id)
      .sort((a, b) => a.orden - b.orden);
    const index = delMismoGrupo.findIndex((s) => s.id === row.id);
    const destino = direccion === 'up' ? index - 1 : index + 1;
    if (destino < 0 || destino >= delMismoGrupo.length) return;

    const actual = delMismoGrupo[index];
    const otro = delMismoGrupo[destino];
    const temp = Math.max(0, ...delMismoGrupo.map((s) => s.orden || 0)) + 1000;

    const p1 = await actualizarSubestado(actual.id, { orden: temp }, false);
    const p2 = p1 && (await actualizarSubestado(otro.id, { orden: actual.orden }, false));
    const p3 = p2 && (await actualizarSubestado(actual.id, { orden: otro.orden }, false));
    if (p3) {
      setSuccessMessage('Orden de subetapa actualizado.');
      await cargar();
    }
  }

  async function guardarRegla(
    etapaId: string,
    subestadoId: string | null,
    draft: { lenta: string; estancada: string; accion: string },
    existente: Regla | null
  ) {
    const lenta = Number(draft.lenta);
    const estancada = Number(draft.estancada);
    if (!Number.isFinite(lenta) || !Number.isFinite(estancada) || lenta <= 0 || estancada <= lenta) {
      setErrorMessage('La regla debe tener horas válidas y Estancada debe ser mayor que Lenta.');
      return;
    }
    const payload = {
      etapa_id: subestadoId ? null : etapaId,
      subestado_id: subestadoId,
      tiempo_maximo_horas: estancada,
      horas_lenta: lenta,
      horas_estancada: estancada,
      accion_recomendada: draft.accion,
      activo: true
    };
    const res = await fetch(
      existente
        ? `/api/admin/funnel/reglas-estancamiento/${existente.id}`
        : '/api/admin/funnel/reglas-estancamiento',
      {
        method: existente ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    const data = await parseJson(res);
    if (!res.ok || !data?.ok) {
      setErrorMessage(data?.error || 'No se pudo guardar la regla.');
      return;
    }
    setSuccessMessage('Regla guardada.');
    await cargar();
  }

  // BUG 4: alta de subetapa funcional (formulario inline). Antes el botón
  // hacía scroll a un formulario que estaba dentro de un bloque muerto.
  async function crearSubetapa(etapaId: string) {
    if (!nuevaSubDraft.nombre.trim()) {
      setErrorMessage('El nombre de la subetapa es obligatorio.');
      return;
    }
    setGuardandoSub(true);
    const res = await fetch('/api/admin/funnel/subestados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        etapa_id: etapaId,
        nombre: nuevaSubDraft.nombre.trim(),
        descripcion: nuevaSubDraft.descripcion.trim() || null,
        tiempo_maximo_horas: nuevaSubDraft.maximo ? Number(nuevaSubDraft.maximo) : null,
        activo: true
      })
    });
    const data = await parseJson(res);
    setGuardandoSub(false);
    if (!res.ok || !data?.ok) {
      setErrorMessage(data?.error || 'No se pudo crear la subetapa.');
      return;
    }
    setNuevaSubDraft({ nombre: '', descripcion: '', maximo: '24' });
    setNuevaSubAbierta(false);
    setSuccessMessage('Subetapa creada correctamente.');
    await cargar();
  }

  const etapasActivas = useMemo(
    () => etapas.filter((etapa) => etapa.activo).sort((a, b) => a.orden - b.orden),
    [etapas]
  );
  const etapasInactivas = useMemo(
    () => etapas.filter((etapa) => !etapa.activo).sort((a, b) => a.orden - b.orden),
    [etapas]
  );
  const subestadosActivos = subestados.filter((subestado) => subestado.activo);
  const reglasActivas = reglas.filter((regla) => regla.activo);
  // Buscar en TODAS las etapas (activas e inactivas) para que la ficha funcione
  // incluso cuando se navega a una etapa desactivada.
  const etapaActual = etapas.find((etapa) => etapa.id === etapaSeleccionada) || null;
  const subestadosEtapaActual = subestados
    .filter((s) => s.etapa_id === etapaSeleccionada)
    .sort((a, b) => a.orden - b.orden);
  const reglaEtapaActual =
    reglas.find((r) => r.etapa_id === etapaSeleccionada && !r.subestado_id && r.activo) || null;

  useEffect(() => {
    if (!etapaActual) return;
    setEtapaDraft({ nombre: etapaActual.nombre, descripcion: etapaActual.descripcion || '' });
    setReglaEtapaDraft({
      lenta: String(reglaEtapaActual?.horas_lenta ?? 24),
      estancada: String(reglaEtapaActual?.horas_estancada ?? reglaEtapaActual?.tiempo_maximo_horas ?? 48),
      accion: reglaEtapaActual?.accion_recomendada || ''
    });
    // Al cambiar de etapa cerramos el formulario de alta.
    setNuevaSubAbierta(false);
    setNuevaSubDraft({ nombre: '', descripcion: '', maximo: '24' });
  }, [
    etapaActual?.id,
    etapaActual?.nombre,
    etapaActual?.descripcion,
    reglaEtapaActual?.id,
    reglaEtapaActual?.horas_lenta,
    reglaEtapaActual?.horas_estancada
  ]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-buscoedu-blue">Configuración de Funnel</h1>
        <p className="text-sm text-buscoedu-muted">
          Administra las etapas, subetapas y reglas operativas del funnel activo.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-buscoedu-border bg-white p-4 text-sm text-buscoedu-muted">
          Cargando configuración del funnel...
        </div>
      ) : etapaActual ? (
        // ===================== VISTA DE DETALLE DE ETAPA =====================
        // BUG 3: en la ficha de la etapa NO se muestra la lista superior con
        // las flechas de reordenamiento; el orden se gestiona solo en la lista
        // general.
        <section
          id="administracion-etapa"
          className={`space-y-5 rounded-2xl border p-5 shadow-card ${
            etapaActual.activo
              ? 'border-blue-200 bg-white'
              : 'border-gray-300 bg-gray-50'
          }`}
        >
          {/* Banner de etapa desactivada */}
          {!etapaActual.activo && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <span>⚠️</span>
              <span>
                Esta etapa está <strong>desactivada</strong>. No aparece en el funnel activo pero sus
                datos se conservan para proteger el historial. Usa el botón{' '}
                <strong>Reactivar etapa</strong> para volver a incluirla.
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Administración de la etapa
              </p>
              <h2 className={`text-2xl font-bold ${etapaActual.activo ? 'text-buscoedu-text' : 'text-gray-400'}`}>
                {etapaActual.nombre}
                {!etapaActual.activo && (
                  <span className="ml-2 text-xs font-normal text-gray-400">(desactivada)</span>
                )}
              </h2>
            </div>
            <div className="flex gap-2">
              {/* Mostrar Reactivar si la etapa está desactivada, o Desactivar si está activa */}
              {etapaActual.activo ? (
                <button
                  type="button"
                  onClick={() => solicitarConfirmacion('etapa', etapaActual.id, etapaActual.nombre, false)}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                >
                  Desactivar etapa
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => solicitarConfirmacion('etapa', etapaActual.id, etapaActual.nombre, true)}
                  className="rounded-lg border border-green-400 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800 hover:bg-green-100"
                >
                  ✓ Reactivar etapa
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  router.push('/admin/funnel');
                }}
                className="rounded-lg border px-3 py-2 text-sm"
              >
                ← Volver
              </button>
            </div>
          </div>

          {/* 1. Nombre y descripción */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-buscoedu-text">1. Nombre y descripción</h3>
              {!etapaEditando && (
                <button
                  type="button"
                  onClick={() => setEtapaEditando(true)}
                  className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                >
                  Editar
                </button>
              )}
            </div>
            {etapaEditando ? (
              <div className="space-y-2">
                <input
                  value={etapaDraft.nombre}
                  onChange={(e) => setEtapaDraft({ ...etapaDraft, nombre: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2"
                  placeholder="Nombre de la etapa"
                />
                <textarea
                  value={etapaDraft.descripcion}
                  onChange={(e) => setEtapaDraft({ ...etapaDraft, descripcion: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Descripción"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await actualizarEtapa(etapaActual.id, etapaDraft);
                      setEtapaEditando(false);
                    }}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEtapaDraft({
                        nombre: etapaActual.nombre,
                        descripcion: etapaActual.descripcion || ''
                      });
                      setEtapaEditando(false);
                    }}
                    className="rounded-lg border px-3 py-2 text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="font-medium">{etapaActual.nombre}</p>
                <p className="text-sm text-gray-500">{etapaActual.descripcion || 'Sin descripción'}</p>
              </>
            )}
          </div>

          {/* 2. Regla de estancamiento de la etapa */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-amber-900">2. Regla de estancamiento de la etapa</h3>
                <p className="text-xs text-amber-800">Una única regla general para esta etapa.</p>
              </div>
              {!reglaEtapaEditando && (
                <button
                  type="button"
                  onClick={() => setReglaEtapaEditando(true)}
                  className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold"
                >
                  Editar
                </button>
              )}
            </div>
            {reglaEtapaEditando ? (
              <div className="space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <FormField
                    label="Lenta desde (horas)"
                    value={reglaEtapaDraft.lenta}
                    onChange={(e) => setReglaEtapaDraft({ ...reglaEtapaDraft, lenta: e.target.value })}
                    type="number"
                  />
                  <FormField
                    label="Estancada desde (horas)"
                    value={reglaEtapaDraft.estancada}
                    onChange={(e) => setReglaEtapaDraft({ ...reglaEtapaDraft, estancada: e.target.value })}
                    type="number"
                  />
                </div>
                <FormTextarea
                  label="Acción recomendada"
                  value={reglaEtapaDraft.accion}
                  onChange={(e) => setReglaEtapaDraft({ ...reglaEtapaDraft, accion: e.target.value })}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await guardarRegla(etapaActual.id, null, reglaEtapaDraft, reglaEtapaActual);
                      setReglaEtapaEditando(false);
                    }}
                    className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setReglaEtapaEditando(false)}
                    className="rounded-lg border px-3 py-2 text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-amber-900">
                Lenta: {reglaEtapaActual?.horas_lenta ?? '—'} h · Estancada:{' '}
                {reglaEtapaActual?.horas_estancada ?? '—'} h
              </p>
            )}
          </div>

          {/* 3. Subetapas */}
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-buscoedu-text">3. Subetapas</h3>
              <button
                type="button"
                onClick={() => setNuevaSubAbierta((v) => !v)}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
              >
                {nuevaSubAbierta ? 'Cerrar' : '+ Nueva subetapa'}
              </button>
            </div>

            {/* BUG 4: formulario inline de alta de subetapa */}
            {nuevaSubAbierta && (
              <div className="mb-4 space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
                <p className="text-xs font-semibold text-blue-900">Nueva subetapa</p>
                <input
                  value={nuevaSubDraft.nombre}
                  onChange={(e) => setNuevaSubDraft({ ...nuevaSubDraft, nombre: e.target.value })}
                  className="w-full rounded border px-2 py-1 text-sm"
                  placeholder="Nombre de la subetapa"
                />
                {/* BUG 6: campo de comentario / descripción */}
                <label className="block text-xs font-semibold text-gray-600">
                  Comentario / descripción
                  <textarea
                    value={nuevaSubDraft.descripcion}
                    onChange={(e) => setNuevaSubDraft({ ...nuevaSubDraft, descripcion: e.target.value })}
                    className="mt-1 w-full rounded border px-2 py-1 text-sm font-normal"
                    rows={2}
                    placeholder="Comentario o descripción de la subetapa"
                  />
                </label>
                <label className="block text-xs font-semibold text-gray-600">
                  Tiempo máximo (horas)
                  <input
                    value={nuevaSubDraft.maximo}
                    onChange={(e) => setNuevaSubDraft({ ...nuevaSubDraft, maximo: e.target.value })}
                    type="number"
                    className="mt-1 w-full rounded border px-2 py-1 text-sm font-normal"
                    placeholder="Horas"
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={guardandoSub}
                    onClick={() => crearSubetapa(etapaActual.id)}
                    className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    Crear subetapa
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNuevaSubAbierta(false);
                      setNuevaSubDraft({ nombre: '', descripcion: '', maximo: '24' });
                    }}
                    className="rounded border px-3 py-1.5 text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {subestadosEtapaActual.map((row, index) => {
                const regla = reglas.find((r) => r.subestado_id === row.id && r.activo) || null;
                return (
                  <div
                    key={row.id}
                    className={`rounded-xl border p-3 ${row.activo ? 'bg-white' : 'bg-gray-50 text-gray-400'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">
                          {row.orden}. {row.nombre}
                        </p>
                        {row.descripcion && <p className="text-xs text-gray-500">{row.descripcion}</p>}
                        <p className="text-xs">
                          Regla: lenta {regla?.horas_lenta ?? '—'} h · estancada{' '}
                          {regla?.horas_estancada ?? '—'} h
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moverSubestado(row, 'up')}
                          className="rounded border px-2 py-1 text-xs disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={index === subestadosEtapaActual.length - 1}
                          onClick={() => moverSubestado(row, 'down')}
                          className="rounded border px-2 py-1 text-xs disabled:opacity-30"
                        >
                          ↓
                        </button>
                        {row.activo ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSubEditando(row.id);
                              setSubDraft({
                                nombre: row.nombre,
                                descripcion: row.descripcion || '',
                                maximo: String(row.tiempo_maximo_horas ?? '')
                              });
                            }}
                            className="rounded border px-2 py-1 text-xs"
                          >
                            Editar
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => solicitarConfirmacion('subetapa', row.id, row.nombre, true)}
                            className="rounded border px-2 py-1 text-xs"
                          >
                            Activar
                          </button>
                        )}
                      </div>
                    </div>

                    {subEditando === row.id && (
                      <div className="mt-3 space-y-2 border-t pt-3">
                        <input
                          value={subDraft.nombre}
                          onChange={(e) => setSubDraft({ ...subDraft, nombre: e.target.value })}
                          className="w-full rounded border px-2 py-1 text-sm"
                          placeholder="Nombre de la subetapa"
                        />
                        {/* BUG 6: comentario / descripción visible y editable */}
                        <label className="block text-xs font-semibold text-gray-600">
                          Comentario / descripción
                          <textarea
                            value={subDraft.descripcion}
                            onChange={(e) => setSubDraft({ ...subDraft, descripcion: e.target.value })}
                            className="mt-1 w-full rounded border px-2 py-1 text-sm font-normal"
                            rows={2}
                            placeholder="Comentario o descripción de la subetapa"
                          />
                        </label>
                        <label className="block text-xs font-semibold text-gray-600">
                          Tiempo máximo (horas)
                          <input
                            value={subDraft.maximo}
                            onChange={(e) => setSubDraft({ ...subDraft, maximo: e.target.value })}
                            type="number"
                            className="mt-1 w-full rounded border px-2 py-1 text-sm font-normal"
                            placeholder="Horas"
                          />
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              await actualizarSubestado(row.id, {
                                nombre: subDraft.nombre,
                                descripcion: subDraft.descripcion,
                                tiempo_maximo_horas: subDraft.maximo ? Number(subDraft.maximo) : null
                              });
                              setSubEditando(null);
                            }}
                            className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => solicitarConfirmacion('subetapa', row.id, row.nombre, false)}
                            className="rounded border border-red-200 px-3 py-1.5 text-xs text-red-700"
                          >
                            Desactivar
                          </button>
                          <button
                            type="button"
                            onClick={() => setSubEditando(null)}
                            className="rounded border px-3 py-1.5 text-xs"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mt-3 border-t pt-3">
                      {subReglaEditando === row.id ? (
                        <div className="space-y-2">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <FormField
                              label="Lenta (horas)"
                              value={subReglaDraft.lenta}
                              onChange={(e) => setSubReglaDraft({ ...subReglaDraft, lenta: e.target.value })}
                              type="number"
                            />
                            <FormField
                              label="Estancada (horas)"
                              value={subReglaDraft.estancada}
                              onChange={(e) =>
                                setSubReglaDraft({ ...subReglaDraft, estancada: e.target.value })
                              }
                              type="number"
                            />
                          </div>
                          <FormTextarea
                            label="Acción recomendada"
                            value={subReglaDraft.accion}
                            onChange={(e) => setSubReglaDraft({ ...subReglaDraft, accion: e.target.value })}
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                await guardarRegla(etapaActual.id, row.id, subReglaDraft, regla);
                                setSubReglaEditando(null);
                              }}
                              className="rounded bg-amber-600 px-3 py-1.5 text-xs text-white"
                            >
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => setSubReglaEditando(null)}
                              className="rounded border px-3 py-1.5 text-xs"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSubReglaEditando(row.id);
                            setSubReglaDraft({
                              lenta: String(regla?.horas_lenta ?? 24),
                              estancada: String(regla?.horas_estancada ?? row.tiempo_maximo_horas ?? 48),
                              accion: regla?.accion_recomendada || ''
                            });
                          }}
                          className="text-xs font-semibold text-amber-700"
                        >
                          Editar regla de esta subetapa
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {subestadosEtapaActual.length === 0 && (
                <p className="text-xs text-gray-500">Aún no hay subetapas. Crea la primera con “+ Nueva subetapa”.</p>
              )}
            </div>
          </div>
        </section>
      ) : (
        // ===================== VISTA DE LISTA GENERAL =====================
        <>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            El orden de las etapas se gestiona aquí con las flechas ↑↓. Haz clic en una etapa para editar sus
            subetapas y reglas.
          </div>

          <div className="grid grid-cols-1 gap-3">
            {etapasActivas.map((etapa, index) => {
              const hijos = subestadosActivos
                .filter((s) => s.etapa_id === etapa.id)
                .sort((a, b) => a.orden - b.orden);
              const reglasEtapa = reglasActivas.filter(
                (r) => r.etapa_id === etapa.id || hijos.some((s) => s.id === r.subestado_id)
              );
              return (
                <article
                  id={`etapa-${etapa.id}`}
                  key={etapa.id}
                  onClick={() => {
                    router.push(`/admin/funnel?etapa=${etapa.id}`);
                  }}
                  className="cursor-pointer rounded-2xl border border-buscoedu-border bg-white p-5 shadow-card transition hover:border-blue-400 hover:shadow-lg"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Etapa {etapa.orden}
                      </p>
                      <h2 className="text-xl font-bold text-buscoedu-text">{etapa.nombre}</h2>
                      <p className="text-xs text-gray-500">
                        {etapa.descripcion || 'Configuración operativa de la etapa'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          void moverEtapa(index, 'up');
                        }}
                        className="rounded border px-2 py-1 text-xs disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={index === etapasActivas.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          void moverEtapa(index, 'down');
                        }}
                        className="rounded border px-2 py-1 text-xs disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <span
                        className="ml-2 h-4 w-4 rounded-full"
                        style={{ backgroundColor: etapa.color || '#94a3b8' }}
                        aria-label={`Color ${etapa.nombre}`}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3 text-sm text-gray-600">
                    <span>{hijos.length} subetapa(s)</span>
                    <span>
                      Regla: lenta {reglasEtapa.find((r) => !r.subestado_id)?.horas_lenta ?? '—'} h · estancada{' '}
                      {reglasEtapa.find((r) => !r.subestado_id)?.horas_estancada ?? '—'} h
                    </span>
                    <span className="text-blue-600">Abrir etapa →</span>
                  </div>
                </article>
              );
            })}
            {etapasActivas.length === 0 && (
              <p className="text-sm text-gray-500">No hay etapas activas.</p>
            )}
          </div>

          {/* BUG 2: sección de etapas desactivadas (solo en la lista general).
              Al hacer clic se navega a la ficha; desde ahí se puede reactivar.
              Sin flechas de orden ni botón de activación directa. */}
          <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <h2 className="text-sm font-semibold text-gray-500">Etapas desactivadas</h2>
            <p className="mt-1 text-xs text-gray-500">
              Se conservan para proteger el historial. Haz clic en una etapa para ver su ficha y reactivarla.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {etapasInactivas.map((etapa) => (
                <button
                  key={etapa.id}
                  type="button"
                  onClick={() => router.push(`/admin/funnel?etapa=${etapa.id}`)}
                  className="rounded-xl border border-gray-300 bg-gray-100 px-3 py-2 text-xs text-gray-400 hover:border-gray-400 hover:bg-gray-200 hover:text-gray-600"
                >
                  {etapa.nombre}
                  <span className="ml-1 text-gray-300">· Ver ficha →</span>
                </button>
              ))}
              {etapasInactivas.length === 0 && (
                <p className="text-xs text-gray-400">No hay etapas desactivadas.</p>
              )}
            </div>
          </section>
        </>
      )}

      {/* MEJORA 1: diálogo de confirmación para activar/desactivar etapas y subetapas */}
      <ConfirmDialog
        isOpen={confirmDialog.open}
        title={
          confirmDialog.activar
            ? `¿Reactivar ${confirmDialog.nombre}?`
            : `¿Desactivar ${confirmDialog.nombre}?`
        }
        description={
          confirmDialog.activar
            ? `Se reactivará ${
                confirmDialog.tipo === 'etapa' ? 'la etapa' : 'la subetapa'
              } y volverá a estar disponible en el embudo.`
            : `Se desactivará ${
                confirmDialog.tipo === 'etapa' ? 'la etapa' : 'la subetapa'
              }. No se elimina: se conserva el historial y podrás reactivarla más adelante.`
        }
        confirmLabel={confirmDialog.activar ? 'Sí, reactivar' : 'Sí, desactivar'}
        cancelLabel="Cancelar"
        isLoading={confirmLoading}
        onConfirm={ejecutarCambioActivo}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
      />

      {successMessage ? (
        <SuccessToast message={successMessage} onClose={() => setSuccessMessage('')} />
      ) : null}
      {errorMessage ? <ErrorToast message={errorMessage} onClose={() => setErrorMessage('')} /> : null}
    </section>
  );
}
