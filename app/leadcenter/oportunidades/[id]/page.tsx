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
    ,{ data: cierres }
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
      .select('id, etapa_nueva_id, motivo, canal, creado_en')
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
    ,supabase
      .from('oportunidades_cierres')
      .select('id, tipo_cierre, comentario, causa_perdida_id, etapa_anterior_id, subestado_anterior_id, canal, actor_tipo, creado_en, reabierto_en, motivo_reapertura')
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
  const programaOferta = nombreOferta.toLocaleLowerCase().includes(nombrePrograma.toLocaleLowerCase())
    ? nombreOferta
    : `${nombrePrograma} · ${nombreOferta}`;
  const temperatura = TEMPERATURA_META[temperaturaDesdePuntaje(o.puntaje)];

  const nombreEtapaPorId = (eid: string) => (etapas as any[])?.find((e) => e.id === eid)?.nombre || '—';
  const subestadoActual = ((subestados as any[]) || []).find((s: any) => s.id === o.subestado_id);
  const etapaActualOrden = ((etapas as any[]) || []).findIndex((e: any) => e.id === o.etapa_id);
  const etapaActualNombre = String((etapaActual as any)?.nombre || '').trim();
  const subestadoActualNombre = String(subestadoActual?.nombre || '').trim();
  const esPerdida = etapaActualNombre.toLowerCase() === 'cerrada' && subestadoActualNombre.toLowerCase() === 'perdida';

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
      : { label: 'Normal', cls: 'bg-blue-100 text-blue-700' };

  // El funnel se representa en dos niveles: cada etapa es un nodo superior y
  // debajo se muestran únicamente sus subetapas relacionadas, sin convertirlas
  // en pasos independientes ni inventar nombres que no existan en la BD.
  const subetapasPermitidas: Record<string, string[]> = {
    'nuevo': [],
    'en acceso': ['sin documentos', 'incompleto', 'verificado'],
    'transferida': ['universidad', 'buscoedu'],
    'en gestión': ['universidad', 'valorando', 'desaparecido'],
    'cerrada': ['ganada', 'perdida']
  };
  const etapasPermitidas = ['nuevo', 'en acceso', 'transferida', 'en gestión', 'cerrada'];
  const funnelStages = ((etapas as any[]) || [])
    .slice()
    .filter((etapa: any) => etapasPermitidas.includes(String(etapa.nombre || '').trim().toLowerCase()))
    .sort((a: any, b: any) => a.orden - b.orden)
    .map((etapa: any) => ({
      ...etapa,
      subestados: ((subestados as any[]) || [])
        .filter((sub: any) => {
          const permitidas = subetapasPermitidas[String(etapa.nombre || '').trim().toLowerCase()] || [];
          return sub.etapa_id === etapa.id
            && permitidas.includes(String(sub.nombre || '').trim().toLowerCase())
            && (sub.activo !== false || sub.id === o.subestado_id);
        })
        .sort((a: any, b: any) => a.orden - b.orden)
    }));
  const indiceActualFunnel = funnelStages.findIndex((stage: any) => stage.id === o.etapa_id);

  const comentarios = ((notas as any[]) || []).map((n) => ({
    id: n.id,
    contenido: n.contenido,
    creado_en: n.creado_en,
    autor_nombre: autores[n.autor_id] || 'Usuario interno'
  }));

  type Item = { ts: string; tipo: string; texto: string; icono: string; tono: string };
  const timeline: Item[] = [];
  (historial as any[])?.forEach((h) =>
    timeline.push({
      ts: h.creado_en,
      tipo: 'Etapa',
      texto: `Movida a "${nombreEtapaPorId(h.etapa_nueva_id)}"${h.motivo ? ` · ${h.motivo}` : ''}`,
      icono: '↔️',
      tono: 'bg-blue-100 text-blue-700'
    })
  );
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
  // El cierre se muestra como salida lateral, sin ocultar las etapas recorridas.
  (cierres as any[])?.forEach((cierre) => {
    timeline.push({
      ts: cierre.creado_en,
      tipo: cierre.tipo_cierre === 'ganada' ? 'Ganada' : 'Perdida',
      texto: `${cierre.tipo_cierre === 'ganada' ? 'Cierre Ganada' : 'Cierre Perdida'}${cierre.comentario ? ` · ${cierre.comentario}` : ''}`,
      icono: cierre.tipo_cierre === 'ganada' ? '🏆' : '⛔',
      tono: cierre.tipo_cierre === 'ganada' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
    });
    if (cierre.reabierto_en) timeline.push({ ts: cierre.reabierto_en, tipo: 'Reapertura', texto: `Oportunidad reabierta${cierre.motivo_reapertura ? ` · ${cierre.motivo_reapertura}` : ''}`, icono: '↩️', tono: 'bg-blue-100 text-blue-700' });
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
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{o.codigo || `OP-${String(o.id).slice(0, 8)}`}</p>
            <Link href={`/leadcenter/personas/${o.persona_id}`} className="text-xl font-bold text-gray-900 hover:text-blue-600 hover:underline">{nombrePersona}</Link>
            <p className="text-sm text-gray-600">{nombreUniversidad}</p>
            <p className="text-sm text-gray-500">{programaOferta}</p>
            <p className="text-xs text-gray-500">{(etapaActual as any)?.nombre || '—'} · {subestadoActual?.nombre || 'Sin subestado'}</p>
          </div>
          <div className="flex max-w-sm flex-col items-end gap-2 text-right">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${esPerdida ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{(etapaActual as any)?.nombre || '—'} · {subestadoActual?.nombre || 'Sin subestado'}</span>
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
        {/* Funnel jerárquico: etapa arriba, subetapa debajo y avance entre etapas. */}
        <div className="mt-5 overflow-x-auto border-t border-gray-100 pt-4" aria-label="Funnel de la oportunidad">
          <div className="flex min-w-[980px] items-start gap-2">
            {funnelStages.map((stage: any, index: number) => {
              const actual = index === indiceActualFunnel;
              const completada = indiceActualFunnel >= 0 && index < indiceActualFunnel;
              return (
                <div key={stage.id} className="relative flex min-w-44 flex-1 flex-col items-center text-center">
                  {index < funnelStages.length - 1 && <span aria-hidden="true" className="absolute left-1/2 right-[-0.5rem] top-3.5 h-0.5 bg-gray-200" />}
                  <span className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${actual && esPerdida ? 'bg-red-600 text-white ring-4 ring-red-100' : actual ? 'bg-gray-700 text-white ring-4 ring-gray-100' : 'bg-gray-200 text-gray-500'}`}>
                    {completada ? '✓' : index + 1}
                  </span>
                  <p className={`mt-2 text-sm font-semibold ${actual && esPerdida ? 'text-red-700' : 'text-gray-700'}`}>{stage.nombre}</p>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">Etapa</p>
                  {actual && <p className={`mt-0.5 text-[11px] font-semibold ${esPerdida ? 'text-red-600' : 'text-gray-600'}`}>Etapa actual</p>}
                  <div className="mt-3 w-full space-y-1.5 border-t border-gray-100 pt-2">
                    {stage.subestados.length > 0 ? stage.subestados.map((sub: any) => {
                      const subActual = sub.id === o.subestado_id;
                      return (
                        <div key={sub.id} className={`rounded-lg border px-2 py-1.5 text-center ${subActual && esPerdida ? 'border-red-300 bg-red-50 text-red-800' : subActual ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-blue-100 bg-blue-50/40 text-blue-700'}`}>
                          <p className="text-xs font-medium">{sub.nombre}</p>
                        </div>
                      );
                    }) : <p className="rounded-lg border border-dashed border-gray-200 px-2 py-1.5 text-xs text-gray-400">—</p>}
                  </div>
                </div>
              );
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
              <ol className="max-h-[34rem] space-y-3 overflow-y-auto pr-2">
                {timeline.slice(0, 60).map((it, i) => (
                  <li key={i} className="relative flex gap-3 pb-1">
                    {i < timeline.slice(0, 60).length - 1 && <span aria-hidden="true" className="absolute left-4 top-8 h-[calc(100%+0.25rem)] border-l-2 border-dotted border-gray-200" />}
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
            estaCerrada={String((etapaActual as any)?.nombre || '').toLowerCase() === 'cerrada'}
            etapas={(etapas as any[]) || []}
            subestados={((subestados as any[]) || []).filter((s: any) => s.activo !== false)}
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
