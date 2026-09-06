import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';
import AccionesOportunidad from '@/components/leadcenter/AccionesOportunidad';
import PanelCopiloto from '@/components/leadcenter/PanelCopiloto';
import ComentariosNotaPanel from '@/components/leadcenter/ComentariosNotaPanel';
import OpportunityWappPanel from '@/components/leadcenter/OpportunityWappPanel';
import { calcularEstadoEstancamiento } from '@/src/lib/leadcenter/estancamiento';
import { TEMPERATURA_META, temperaturaDesdePuntaje } from '@/src/lib/leadcenter/salud';

export const dynamic = 'force-dynamic';

function fecha(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

// MEJORA 8: agrupa cada evento del historial por cercanía temporal para que el
// timeline sea más legible (Hoy, Ayer, Esta semana, Este mes, Anteriores).
function grupoFecha(iso?: string | null): string {
  if (!iso) return 'Anteriores';
  const ahora = new Date();
  const d = new Date(iso);

  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const inicioAyer = new Date(inicioHoy);
  inicioAyer.setDate(inicioAyer.getDate() - 1);
  const inicioSemana = new Date(inicioHoy);
  inicioSemana.setDate(inicioSemana.getDate() - 6); // últimos 7 días
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);

  if (d >= inicioHoy) return 'Hoy';
  if (d >= inicioAyer) return 'Ayer';
  if (d >= inicioSemana) return 'Esta semana';
  if (d >= inicioMes) return 'Este mes';
  return 'Anteriores';
}

export default async function FichaOportunidadPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getServerSupabase();
  const sesion = await getSesionLeadCenter();

  const { data: op, error } = await supabase.from('oportunidades').select('*').eq('id', id).single();

  if (error || !op) notFound();

  const o = op as any;

  const [
    { data: persona },
    { data: universidad },
    { data: programa },
    { data: oferta },
    { data: etapas },
    { data: subestados },
    { data: etapaActual },
    { data: reglasEstancamiento },
    { data: historial },
    { data: notas },
    { data: eventos },
    { data: tareas },
    { data: consentimientos },
    { data: propuestas },
    { data: transferencias }
  ] = await Promise.all([
    supabase.from('personas').select('*').eq('id', o.persona_id).single(),
    o.universidad_id
      ? supabase
          .from('universidades')
          .select('id, nombre_oficial, nombre_corto, sigla')
          .eq('id', o.universidad_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as any),
    o.programa_id
      ? supabase
          .from('programas_academicos')
          .select('id, nombre_oficial, nombre_corto')
          .eq('id', o.programa_id)
          .maybeSingle()
      : Promise.resolve({ data: null } as any),
    o.oferta_id
      ? supabase.from('ofertas_academicas').select('id, nombre_oferta').eq('id', o.oferta_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
    supabase.from('etapas_embudo').select('id, nombre, orden').order('orden'),
    supabase
      .from('subestados_oportunidad')
      .select('id, nombre, etapa_id, orden, activo')
      .order('orden'),
    supabase.from('etapas_embudo').select('nombre, color').eq('id', o.etapa_id).single(),
    supabase
      .from('reglas_estancamiento')
      .select('id, etapa_id, subestado_id, tiempo_maximo_horas, accion_recomendada, activo')
      .eq('activo', true),
    supabase
      .from('historial_etapas_oportunidad')
      .select('id, etapa_nueva_id, subestado_nuevo_id, motivo, canal, creado_en')
      .eq('oportunidad_id', id)
      .order('creado_en', { ascending: false })
      .limit(50),
    supabase
      .from('notas_crm')
      .select('id, contenido, es_privada, autor_id, creado_en')
      .eq('oportunidad_id', id)
      .order('creado_en', { ascending: false })
      .limit(50),
    supabase
      .from('eventos_negocio')
      .select('id, evento, metadatos, generado_por, creado_en')
      .eq('oportunidad_id', id)
      .order('creado_en', { ascending: false })
      .limit(50),
    supabase
      .from('tareas_crm')
      .select('id, titulo, estado, prioridad, tipo_tarea, fecha_vencimiento, creado_en')
      .eq('oportunidad_id', id)
      .order('creado_en', { ascending: false })
      .limit(50),
    supabase
      .from('consentimientos_persona')
      .select(
        'id, tipo_consentimiento_id, estado, autoriza_contacto, autoriza_whatsapp, autoriza_transferencia, fecha_otorgamiento'
      )
      .eq('persona_id', o.persona_id),
    supabase
      .from('propuestas_comerciales')
      .select('id, version_actual, estado, fecha_emision')
      .eq('oportunidad_id', id)
      .order('fecha_emision', { ascending: false }),
    supabase
      .from('transferencias_universidad')
      .select('id, estado, metodo_entrega, es_facturable, fecha_transferencia, creado_en')
      .eq('oportunidad_id', id)
      .order('creado_en', { ascending: false })
  ]);

  const autoresIds = Array.from(new Set(((notas as any[]) || []).map((n) => n.autor_id).filter(Boolean)));
  const autoresRes = autoresIds.length
    ? await supabase
        .from('usuarios_internos')
        .select('id, nombres, apellidos, correo')
        .in('id', autoresIds)
    : ({ data: [] } as any);

  const autores = Object.fromEntries(
    ((autoresRes.data as any[]) || []).map((u) => [
      u.id,
      [u.nombres, u.apellidos].filter(Boolean).join(' ') || u.correo || 'Usuario interno'
    ])
  );

  const p = (persona as any) || {};
  const nombrePersona = [p.nombres, p.apellidos].filter(Boolean).join(' ') || 'Persona';
  const nombreUniversidad =
    (universidad as any)?.nombre_corto ||
    (universidad as any)?.nombre_oficial ||
    (universidad as any)?.sigla ||
    'Universidad no definida';
  const nombrePrograma =
    (programa as any)?.nombre_corto || (programa as any)?.nombre_oficial || 'Programa no definido';
  const nombreOferta = (oferta as any)?.nombre_oferta || 'Oferta no definida';
  // Evita duplicar el nombre cuando la oferta ya contiene al programa.
  // Se normaliza (minúsculas + sin espacios extremos) y si la oferta es igual,
  // empieza por o incluye al programa, se muestra solo el nombre de la oferta.
  const ofNorm = nombreOferta.toLowerCase().trim();
  const progNorm = nombrePrograma.toLowerCase().trim();
  const programaOferta =
    ofNorm === progNorm || ofNorm.startsWith(progNorm) || ofNorm.includes(progNorm)
      ? nombreOferta
      : `${nombrePrograma} · ${nombreOferta}`;
  const temperatura = TEMPERATURA_META[temperaturaDesdePuntaje(o.puntaje)];

  const nombreEtapaPorId = (eid: string) => (etapas as any[])?.find((e) => e.id === eid)?.nombre || '—';
  const nombreSubestadoPorId = (sid?: string | null) =>
    sid ? ((subestados as any[]) || []).find((s: any) => s.id === sid)?.nombre || null : null;
  const subestadoActual = ((subestados as any[]) || []).find((s: any) => s.id === o.subestado_id);
  const etapaActualOrden = ((etapas as any[]) || []).findIndex((e: any) => e.id === o.etapa_id);

  const estancamiento = calcularEstadoEstancamiento({
    reglas: (reglasEstancamiento as any[]) || [],
    etapa_id: o.etapa_id,
    subestado_id: o.subestado_id,
    actualizado_en: o.fecha_entrada_subestado || o.actualizado_en
  });

  const badgeEstancamiento =
    estancamiento.estado === 'estancada'
      ? { label: '🔴 Estancada', cls: 'bg-red-100 text-red-700' }
      : estancamiento.estado === 'lenta'
      ? { label: '🟡 Lenta', cls: 'bg-amber-100 text-amber-700' }
      : { label: '🟢 Normal', cls: 'bg-emerald-100 text-emerald-700' };

  // La ruta refleja la definición del embudo: una estación por subetapa. Solo
  // muestra una etapa como estación cuando esa etapa aún no tiene subetapas.
  const funnelStops = ((etapas as any[]) || []).flatMap((etapa: any) => {
    const hijos = ((subestados as any[]) || []).filter((sub: any) => sub.activo !== false && sub.etapa_id === etapa.id);
    return hijos.length
      ? hijos.map((sub: any) => ({ id: `subestado-${sub.id}`, tipo: 'subestado', etapaId: etapa.id, subestadoId: sub.id, nombre: sub.nombre }))
      : [{ id: `etapa-${etapa.id}`, tipo: 'etapa', etapaId: etapa.id, subestadoId: null, nombre: etapa.nombre }];
  });
  const indiceActualFunnel = funnelStops.findIndex((stop: any) =>
    o.subestado_id ? stop.subestadoId === o.subestado_id : stop.tipo === 'etapa' && stop.etapaId === o.etapa_id
  );

  const comentarios = ((notas as any[]) || []).map((n) => ({
    id: n.id,
    contenido: n.contenido,
    creado_en: n.creado_en,
    autor_nombre: autores[n.autor_id] || 'Usuario interno'
  }));

  type Item = { ts: string; tipo: string; texto: string; icono: string; tono: string };
  const timeline: Item[] = [];
  // MEJORA 6 (cierre configurable): el historial de etapas se representa de forma
  // jerárquica en dos niveles — Nivel 1 Etapa, Nivel 2 Subetapa — y el cierre se
  // dibuja como una "salida lateral" que cuelga de la subetapa, conservando los
  // pasos previos. También distinguimos el origen del movimiento (manual, IA o
  // automático) a partir del canal registrado.
  (historial as any[])?.forEach((h) => {
    const etapaNombre = nombreEtapaPorId(h.etapa_nueva_id);
    const subNombre = nombreSubestadoPorId(h.subestado_nuevo_id);
    const motivo: string = h.motivo || '';
    // Detecta si este movimiento corresponde a un cierre (Ganada/Perdida) o a una
    // reapertura, a partir del texto que las RPC dejan en `motivo`.
    const esCierre = /cierre:/i.test(motivo);
    const esReapertura = /reapertura|reabri/i.test(motivo);
    // Origen del cambio: el canal "ia"/"naia"/"automatico" indica acción no humana.
    const canal = String(h.canal || '').toLowerCase();
    const origen = /ia|naia/.test(canal)
      ? '🤖 IA'
      : /auto/.test(canal)
      ? '⚙️ Automático'
      : '👤 Manual';

    // Construcción del árbol jerárquico legible (se muestra con whitespace-pre-line).
    const lineas: string[] = [`${etapaNombre}`];
    if (subNombre) lineas.push(`└── ${subNombre}`);
    if (esCierre) {
      // El motivo trae algo como "Cierre: Perdida · Causa: Precio · <comentario>".
      const partes = motivo.split('·').map((s) => s.trim()).filter(Boolean);
      const indent = subNombre ? '    ' : '';
      partes.forEach((parte, idx) => {
        lineas.push(`${indent}${'    '.repeat(idx)}└── ${parte}`);
      });
    } else if (motivo) {
      const indent = subNombre ? '    ' : '';
      lineas.push(`${indent}└── ${motivo}`);
    }

    timeline.push({
      ts: h.creado_en,
      tipo: esCierre ? 'Cierre' : esReapertura ? 'Reapertura' : 'Etapa',
      texto: `${lineas.join('\n')}\n${origen}`,
      icono: esCierre ? '🏁' : esReapertura ? '🔓' : '↔️',
      tono: esCierre
        ? (/ganada/i.test(motivo) ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')
        : esReapertura
        ? 'bg-amber-100 text-amber-700'
        : 'bg-blue-100 text-blue-700'
    });
  });
  comentarios.forEach((n) =>
    timeline.push({ ts: n.creado_en, tipo: 'Comentario', texto: `${n.autor_nombre}: ${n.contenido}`, icono: '💬', tono: 'bg-violet-100 text-violet-700' })
  );
  (tareas as any[])?.forEach((t) =>
    timeline.push({
      ts: t.creado_en,
      tipo: 'Tarea',
      texto: `${t.titulo} · ${t.estado}${t.fecha_vencimiento ? ` · vence ${fecha(t.fecha_vencimiento)}` : ''}`,
      icono: '✅',
      tono: 'bg-emerald-100 text-emerald-700'
    })
  );
  (eventos as any[])?.forEach((evento) => {
    const metadata = evento.metadatos || {};
    const push = String(evento.evento || '').startsWith('demowapp_push_');
    const captura = String(evento.evento || '').includes('captura');
    const texto = metadata.resumen_legible || (push
      ? `Mensaje automático ${String(evento.evento).replace('demowapp_push_', '')}.`
      : captura
      ? 'Información de interés actualizada por NaIA.'
      : 'Actividad automática de NaIA registrada.');
    timeline.push({
      ts: evento.creado_en,
      tipo: push ? 'WhatsApp' : 'NaIA',
      texto,
      icono: push ? '📱' : '🤖',
      tono: push ? 'bg-green-100 text-green-700' : 'bg-cyan-100 text-cyan-700'
    });
  });
  timeline.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return (
    <div className="space-y-5">
      <Link href="/leadcenter/oportunidades" className="text-sm text-blue-600">
        ← Volver a oportunidades
      </Link>

      {/* Dashboard operativo: resume datos de una sola oportunidad sin duplicar la ficha de persona. */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Persona</p>
            <Link href={`/leadcenter/personas/${o.persona_id}`} className="text-xl font-bold text-gray-900 hover:text-blue-600 hover:underline">{nombrePersona}</Link>
            <p className="text-sm text-gray-600">{nombreUniversidad}</p>
            <p className="text-sm text-gray-500">{programaOferta}</p>
            <p className="text-xs text-gray-500">{(etapaActual as any)?.nombre || '—'} · {subestadoActual?.nombre || 'Sin subestado'}</p>
          </div>
          <div className="flex max-w-sm flex-col items-end gap-2 text-right">
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">{(etapaActual as any)?.nombre || '—'} · {subestadoActual?.nombre || 'Sin subestado'}</span>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${temperatura.clase}`}>{temperatura.etiqueta} · {o.puntaje ?? 0}/110</span>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${badgeEstancamiento.cls}`}>{badgeEstancamiento.label} · {estancamiento.tiempo_legible}</span>
            {estancamiento.accion_recomendada ? <p className="max-w-sm text-xs text-gray-500">Siguiente acción: {estancamiento.accion_recomendada}</p> : null}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-gray-400">Puntaje</p>
            <p className="font-semibold text-gray-900">{o.puntaje ?? 0}</p>
          </div>
          <div>
            <p className="text-gray-400">Modelo</p>
            <p className="font-semibold text-gray-900">{o.modelo_negocio_snapshot || '—'}</p>
          </div>
          <div>
            <p className="text-gray-400">Próx. acción</p>
            <p className="font-semibold text-gray-900">{fecha(o.fecha_proxima_accion)}</p>
          </div>
          <div>
            <p className="text-gray-400">Actualizada</p>
            <p className="font-semibold text-gray-900">{fecha(o.actualizado_en)}</p>
          </div>
        </div>
        <div className="mt-5 overflow-x-auto border-t border-gray-100 pt-4" aria-label="Ruta del funnel">
          <div className="flex min-w-[760px] items-start justify-between gap-2">
            {funnelStops.map((stop: any, index: number) => {
              const actual = index === indiceActualFunnel;
              const completada = indiceActualFunnel > index;
              return <div key={stop.id} className="relative flex min-w-24 flex-1 flex-col items-center text-center"><span className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${actual ? 'bg-blue-600 text-white ring-4 ring-blue-100' : completada ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'}`}>{completada ? '✓' : index + 1}</span>{index < funnelStops.length - 1 && <span aria-hidden="true" className={`absolute left-1/2 top-3.5 h-0.5 w-full ${completada ? 'bg-emerald-400' : 'bg-gray-200'}`} />}<p className={`mt-2 text-xs font-medium ${actual ? 'text-blue-700' : 'text-gray-600'}`}>{stop.nombre}</p><p className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-400">{stop.tipo === 'etapa' ? 'Etapa' : 'Subetapa'}</p>{actual && <p className="mt-0.5 text-[11px] text-blue-600">Actual</p>}</div>;
            })}
          </div>
        </div>
      </div>

      <PanelCopiloto oportunidadId={id} personaId={o.persona_id} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-base font-semibold text-gray-900">Historial</h2>
            {timeline.length === 0 ? (
              <p className="text-sm text-gray-500">Aún no hay actividad registrada.</p>
            ) : (
              <div className="max-h-[34rem] space-y-4 overflow-y-auto pr-2">
                {/* MEJORA 8: el historial se agrupa por cercanía temporal.
                    Recorremos los grupos en orden y solo mostramos los que
                    tienen eventos, respetando el orden descendente ya calculado. */}
                {(['Hoy', 'Ayer', 'Esta semana', 'Este mes', 'Anteriores'] as const).map((grupo) => {
                  const items = timeline.slice(0, 60).filter((it) => grupoFecha(it.ts) === grupo);
                  if (items.length === 0) return null;
                  return (
                    <div key={grupo}>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{grupo}</p>
                      <ol className="space-y-3">
                        {items.map((it, i) => (
                          <li key={`${grupo}-${i}`} className="relative flex gap-3 pb-1">
                            {i < items.length - 1 && <span aria-hidden="true" className="absolute left-4 top-8 h-[calc(100%+0.25rem)] border-l-2 border-dotted border-gray-200" />}
                            <span className={`relative z-10 mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${it.tono}`} title={it.tipo}>
                              <span aria-hidden="true">{it.icono}</span><span className="sr-only">{it.tipo}</span>
                            </span>
                            <div className="min-w-0">
                              <p className="whitespace-pre-line text-sm text-gray-700">{it.texto}</p>
                              <p className="text-xs text-gray-400">{fecha(it.ts)}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <OpportunityWappPanel
            oportunidadId={id}
            celular={p.celular_e164 || p.telefono_principal || null}
            correo={p.correo_principal || null}
          />

          <AccionesOportunidad
            oportunidadId={id}
            personaId={o.persona_id}
            etapaActualId={o.etapa_id}
            etapas={(etapas as any[]) || []}
            subestados={((subestados as any[]) || []).filter((s: any) => s.activo !== false)}
            estadoOportunidad={o.estado || 'activa'}
            cierreTipo={o.cierre_tipo || null}
          />

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-base font-semibold text-gray-900">Consentimientos</h2>
            <p className="mb-3 text-xs text-gray-500">{(consentimientos as any[])?.filter((c) => c.estado === 'otorgado').length || 0} otorgados · {(consentimientos as any[])?.filter((c) => c.estado !== 'otorgado').length || 0} pendientes u otros estados</p>
            {(consentimientos as any[])?.length ? (
              <ul className="max-h-52 space-y-1 overflow-y-auto pr-1 text-sm text-gray-600">
                {(consentimientos as any[]).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span>
                      {c.autoriza_transferencia
                        ? 'Transferencia a universidad'
                        : c.autoriza_whatsapp
                        ? 'Contacto por WhatsApp'
                        : c.autoriza_contacto
                        ? 'Contacto'
                        : 'Tratamiento de datos'}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        c.estado === 'otorgado'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {c.estado}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">Sin consentimientos registrados.</p>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-base font-semibold text-gray-900">Propuestas</h2>
            {(propuestas as any[])?.length ? (
              <ul className="space-y-1 text-sm text-gray-600">
                {(propuestas as any[]).map((pr) => (
                  <li key={pr.id}>
                    v{pr.version_actual} · {pr.estado} · {fecha(pr.fecha_emision)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">Sin propuestas.</p>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-base font-semibold text-gray-900">Transferencias</h2>
            {(transferencias as any[])?.length ? (
              <ul className="space-y-1 text-sm text-gray-600">
                {(transferencias as any[]).map((t) => (
                  <li key={t.id}>
                    {t.estado} · {t.metodo_entrega || '—'}
                    {t.es_facturable ? ' · facturable' : ''}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">Sin transferencias.</p>
            )}
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-base font-semibold text-gray-900">Tareas de la oportunidad</h2><p className="text-sm text-gray-500">Pendientes, futuras e histórico de seguimiento en una única fuente de verdad.</p></div>
          <Link href="/leadcenter/tareas" className="text-sm font-semibold text-blue-600">Abrir centro de tareas →</Link>
        </div>
        {(tareas as any[])?.length ? <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{(tareas as any[]).slice(0, 9).map((t) => <article key={t.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3"><p className="font-medium text-gray-900">{t.titulo || 'Tarea'}</p><p className="mt-1 text-xs text-gray-600">{t.estado} · {t.prioridad || 'sin prioridad'} · {fecha(t.fecha_vencimiento)}</p></article>)}</div> : <p className="mt-3 text-sm text-gray-500">Aún no hay tareas asociadas.</p>}
      </section>

      <ComentariosNotaPanel
        oportunidadId={id}
        personaId={o.persona_id}
        notaInicial={o.notas_internas}
        comentariosIniciales={comentarios}
        puedeEditarNota={Boolean(sesion.esSuper || sesion.esAsesor)}
      />
    </div>
  );
}
