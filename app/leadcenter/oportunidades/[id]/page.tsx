import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';
import AccionesOportunidad from '@/components/leadcenter/AccionesOportunidad';
import PanelCopiloto from '@/components/leadcenter/PanelCopiloto';
import ComentariosNotaPanel from '@/components/leadcenter/ComentariosNotaPanel';
import OpportunityWappPanel from '@/components/leadcenter/OpportunityWappPanel';
import { calcularEstadoEstancamiento } from '@/src/lib/leadcenter/estancamiento';

export const dynamic = 'force-dynamic';

const TEMP_BADGE: Record<string, string> = {
  frio: 'bg-sky-100 text-sky-700',
  tibio: 'bg-amber-100 text-amber-700',
  caliente: 'bg-orange-100 text-orange-700',
  muy_caliente: 'bg-red-100 text-red-700'
};

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

  const nombreEtapaPorId = (eid: string) => (etapas as any[])?.find((e) => e.id === eid)?.nombre || '—';

  const estancamiento = calcularEstadoEstancamiento({
    reglas: (reglasEstancamiento as any[]) || [],
    etapa_id: o.etapa_id,
    subestado_id: o.subestado_id,
    actualizado_en: o.actualizado_en
  });

  const badgeEstancamiento =
    estancamiento.estado === 'estancado'
      ? { label: '🔴 Estancado', cls: 'bg-red-100 text-red-700' }
      : estancamiento.estado === 'proximo_a_vencer'
      ? { label: '🟡 Próximo a vencer', cls: 'bg-amber-100 text-amber-700' }
      : { label: '🟢 Normal', cls: 'bg-emerald-100 text-emerald-700' };

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
  timeline.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return (
    <div className="space-y-5">
      <Link href="/leadcenter/oportunidades" className="text-sm text-blue-600">
        ← Volver a oportunidades
      </Link>

      {/* Copiloto al inicio */}
      <PanelCopiloto oportunidadId={id} personaId={o.persona_id} />

      {/* Encabezado con campos prioritarios */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Persona</p>
            <h1 className="text-xl font-bold text-gray-900">{nombrePersona}</h1>
            <p className="text-sm text-gray-600">{nombreUniversidad}</p>
            <p className="text-sm text-gray-500">
              {nombrePrograma} · {nombreOferta}
            </p>
            <p className="text-xs text-gray-500">
              {(etapaActual as any)?.nombre || '—'} · {o.estado}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              TEMP_BADGE[o.temperatura] || 'bg-gray-100 text-gray-600'
            }`}
          >
            {(o.temperatura || '—').replace('_', ' ')}
          </span>
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
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-base font-semibold text-gray-900">Estado de estancamiento</h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${badgeEstancamiento.cls}`}>
            {badgeEstancamiento.label}
          </span>
          <span className="text-sm text-gray-600">{estancamiento.tiempo_legible} en la etapa/subestado actual</span>
          {estancamiento.tiempo_maximo_horas ? (
            <span className="text-xs text-gray-500">Umbral: {estancamiento.tiempo_maximo_horas} horas</span>
          ) : null}
        </div>
        {estancamiento.accion_recomendada && estancamiento.estado !== 'normal' && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
            Acción recomendada: {estancamiento.accion_recomendada}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-base font-semibold text-gray-900">Persona</h2>
            <Link
              href={`/leadcenter/personas/${o.persona_id}`}
              className="text-sm font-medium text-blue-600"
            >
              {nombrePersona} →
            </Link>
            <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-gray-600 sm:grid-cols-2">
              <span>Correo: {p.correo_principal || '—'}</span>
              <span>Celular: {p.celular_e164 || p.telefono_principal || '—'}</span>
              <span>Verificado: {p.telefono_verificado ? 'Sí' : 'No'}</span>
              <span>Estado: {p.estado_relacion || '—'}</span>
            </div>
          </div>

          <ComentariosNotaPanel
            oportunidadId={id}
            personaId={o.persona_id}
            notaInicial={o.notas_internas}
            comentariosIniciales={comentarios}
            puedeEditarNota={Boolean(sesion.esSuper || sesion.esAsesor)}
          />

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-base font-semibold text-gray-900">Historial</h2>
            {timeline.length === 0 ? (
              <p className="text-sm text-gray-500">Aún no hay actividad registrada.</p>
            ) : (
              <ol className="space-y-3">
                {timeline.slice(0, 60).map((it, i) => (
                  <li key={i} className="flex gap-3">
                    <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${it.tono}`}>
                      <span aria-hidden="true">{it.icono}</span>{it.tipo}
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
          <OpportunityWappPanel oportunidadId={id} />

          <AccionesOportunidad
            oportunidadId={id}
            personaId={o.persona_id}
            etapaActualId={o.etapa_id}
            etapas={(etapas as any[]) || []}
            subestados={((subestados as any[]) || []).filter((s: any) => s.activo !== false)}
          />

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-base font-semibold text-gray-900">Consentimientos</h2>
            {(consentimientos as any[])?.length ? (
              <ul className="space-y-1 text-sm text-gray-600">
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
    </div>
  );
}
