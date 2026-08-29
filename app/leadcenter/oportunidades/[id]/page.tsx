import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServerSupabase } from '@/src/lib/supabase-server';
import AccionesOportunidad from '@/components/leadcenter/AccionesOportunidad';
import PanelCopiloto from '@/components/leadcenter/PanelCopiloto';

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

  const { data: op, error } = await supabase
    .from('oportunidades')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !op) notFound();

  const o = op as any;

  const [
    { data: persona },
    { data: etapas },
    { data: subestados },
    { data: etapaActual },
    { data: historial },
    { data: notas },
    { data: tareas },
    { data: consentimientos },
    { data: propuestas },
    { data: transferencias }
  ] = await Promise.all([
    supabase.from('personas').select('*').eq('id', o.persona_id).single(),
    supabase.from('etapas_embudo').select('id, nombre, orden').order('orden'),
    supabase.from('subestados_oportunidad').select('id, nombre, etapa_id, orden').order('orden'),
    supabase.from('etapas_embudo').select('nombre, color').eq('id', o.etapa_id).single(),
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
      .from('tareas_crm')
      .select('id, titulo, estado, prioridad, tipo_tarea, fecha_vencimiento, creado_en')
      .eq('oportunidad_id', id)
      .order('creado_en', { ascending: false })
      .limit(50),
    supabase
      .from('consentimientos_persona')
      .select('id, tipo_consentimiento_id, estado, autoriza_contacto, autoriza_whatsapp, autoriza_transferencia, fecha_otorgamiento')
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

  const p = (persona as any) || {};
  const nombrePersona = [p.nombres, p.apellidos].filter(Boolean).join(' ') || 'Persona';
  const nombreEtapaPorId = (eid: string) =>
    (etapas as any[])?.find((e) => e.id === eid)?.nombre || '—';

  // Timeline combinada (historial + notas + tareas).
  type Item = { ts: string; tipo: string; texto: string };
  const timeline: Item[] = [];
  (historial as any[])?.forEach((h) =>
    timeline.push({
      ts: h.creado_en,
      tipo: 'Etapa',
      texto: `Movida a "${nombreEtapaPorId(h.etapa_nueva_id)}"${h.motivo ? ` · ${h.motivo}` : ''}`
    })
  );
  (notas as any[])?.forEach((n) =>
    timeline.push({ ts: n.creado_en, tipo: 'Nota', texto: n.contenido })
  );
  (tareas as any[])?.forEach((t) =>
    timeline.push({
      ts: t.creado_en,
      tipo: 'Tarea',
      texto: `${t.titulo} · ${t.estado}${t.fecha_vencimiento ? ` · vence ${fecha(t.fecha_vencimiento)}` : ''}`
    })
  );
  timeline.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

  return (
    <div className="space-y-5">
      <Link href="/leadcenter/oportunidades" className="text-sm text-blue-600">
        ← Volver a oportunidades
      </Link>

      {/* Encabezado */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{o.nombre || 'Oportunidad'}</h1>
            <p className="mt-0.5 text-sm text-gray-500">
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

      {/* Persona */}
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

      {/* Consentimientos */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-base font-semibold text-gray-900">Consentimientos</h2>
        {(consentimientos as any[])?.length ? (
          <ul className="space-y-1 text-sm text-gray-600">
            {(consentimientos as any[]).map((c) => (
              <li key={c.id} className="flex items-center justify-between">
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

      {/* Propuestas y transferencias */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      {/* Copiloto */}
      <PanelCopiloto oportunidadId={id} personaId={o.persona_id} />

      {/* Acciones */}
      <AccionesOportunidad
        oportunidadId={id}
        personaId={o.persona_id}
        etapaActualId={o.etapa_id}
        etapas={(etapas as any[]) || []}
        subestados={(subestados as any[]) || []}
      />

      {/* Timeline */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-base font-semibold text-gray-900">Historial</h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay actividad registrada.</p>
        ) : (
          <ol className="space-y-3">
            {timeline.slice(0, 60).map((it, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                  {it.tipo}
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
  );
}
