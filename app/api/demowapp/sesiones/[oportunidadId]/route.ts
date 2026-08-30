import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';
import { DEMOWAPP_CANAL, getLatestConversationByOpportunity } from '@/src/lib/demowapp/conversacion-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ oportunidadId: string }> }) {
  const sesion = await getSesionLeadCenter();
  if (!sesion.autenticado || !sesion.esSuper) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const { oportunidadId } = await params;
  if (!UUID_RE.test(oportunidadId)) {
    return NextResponse.json({ ok: false, error: 'oportunidad_invalida' }, { status: 400 });
  }

  try {
    const db = await getServerSupabase();

    const { data: app, error: appError } = await db
      .from('aplicaciones')
      .select('id, oportunidad_id, persona_id, oferta_id, estado, fecha_aplicacion, creado_en')
      .eq('oportunidad_id', oportunidadId)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (appError || !app) {
      return NextResponse.json({ ok: false, error: 'aplicacion_no_encontrada' }, { status: 404 });
    }

    const [{ data: oportunidad }, { data: persona }, { data: oferta }, { data: notas }, { data: tareas }] =
      await Promise.all([
        db
          .from('oportunidades')
          .select('id, estado, temperatura, etapa_id, subestado_id, puntaje, asesor_actual_id, actualizado_en')
          .eq('id', oportunidadId)
          .single(),
        db
          .from('personas')
          .select('id, nombres, apellidos, celular_e164, telefono_principal, correo_principal')
          .eq('id', app.persona_id)
          .single(),
        db.from('ofertas_academicas').select('id, nombre').eq('id', app.oferta_id).maybeSingle(),
        db
          .from('notas_crm')
          .select('id, contenido, creado_en')
          .eq('oportunidad_id', oportunidadId)
          .order('creado_en', { ascending: false })
          .limit(10),
        db
          .from('tareas_crm')
          .select('id, titulo, estado, prioridad, creado_en')
          .eq('oportunidad_id', oportunidadId)
          .order('creado_en', { ascending: false })
          .limit(10)
      ]);

    const conversacion = await getLatestConversationByOpportunity(db, oportunidadId);
    let mensajes: any[] = [];

    if (conversacion?.id) {
      const res = await db
        .from('mensajes_conversacion')
        .select('*')
        .eq('conversacion_id', conversacion.id)
        .order('creado_en', { ascending: true })
        .limit(200);
      mensajes = res.data || [];
    }

    const [etapaRes, subestadoRes] = await Promise.all([
      oportunidad?.etapa_id
        ? db.from('etapas_embudo').select('id, nombre').eq('id', oportunidad.etapa_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      oportunidad?.subestado_id
        ? db.from('subestados_oportunidad').select('id, nombre').eq('id', oportunidad.subestado_id).maybeSingle()
        : Promise.resolve({ data: null } as any)
    ]);

    return NextResponse.json({
      ok: true,
      detalle: {
        aplicacion: app,
        oportunidad,
        oferta,
        persona,
        conversacion: conversacion || null,
        mensajes,
        contexto: {
          etapa: etapaRes.data?.nombre || '—',
          subestado: subestadoRes.data?.nombre || '—',
          temperatura: oportunidad?.temperatura || '—',
          puntaje: oportunidad?.puntaje ?? null,
          estadoOportunidad: oportunidad?.estado || '—',
          canal: DEMOWAPP_CANAL,
          notas: notas || [],
          tareas: tareas || []
        }
      }
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
