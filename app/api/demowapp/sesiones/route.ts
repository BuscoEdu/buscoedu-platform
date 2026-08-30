import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';
import { DEMOWAPP_CANAL } from '@/src/lib/demowapp/conversacion-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function nombreCompleto(persona: any) {
  return [persona?.nombres, persona?.apellidos].filter(Boolean).join(' ') || 'Sin nombre';
}

export async function GET(_req: NextRequest) {
  const sesion = await getSesionLeadCenter();
  if (!sesion.autenticado || !sesion.esSuper) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  try {
    const db = await getServerSupabase();

    const { data: aplicaciones, error: appError } = await db
      .from('aplicaciones')
      .select('id, oportunidad_id, persona_id, oferta_id, estado, fecha_aplicacion, creado_en')
      .order('creado_en', { ascending: false })
      .limit(300);

    if (appError) {
      return NextResponse.json({ ok: false, error: appError.message }, { status: 500 });
    }

    const oportunidadIds = Array.from(new Set((aplicaciones || []).map((a: any) => a.oportunidad_id).filter(Boolean)));
    const personaIds = Array.from(new Set((aplicaciones || []).map((a: any) => a.persona_id).filter(Boolean)));
    const ofertaIds = Array.from(new Set((aplicaciones || []).map((a: any) => a.oferta_id).filter(Boolean)));

    const [oportunidadesRes, personasRes, ofertasRes, convRes, etapasRes, subestadosRes] = await Promise.all([
      db
        .from('oportunidades')
        .select('id, estado, temperatura, etapa_id, subestado_id, puntaje, actualizado_en')
        .in('id', oportunidadIds),
      db
        .from('personas')
        .select('id, nombres, apellidos, celular_e164, telefono_principal, correo_principal')
        .in('id', personaIds),
      db.from('ofertas_academicas').select('id, nombre').in('id', ofertaIds),
      db
        .from('conversaciones')
        .select('id, oportunidad_id, estado, ultima_actividad_en')
        .eq('canal', DEMOWAPP_CANAL)
        .in('oportunidad_id', oportunidadIds),
      db.from('etapas_embudo').select('id, nombre'),
      db.from('subestados_oportunidad').select('id, nombre')
    ]);

    const oportunidades = Object.fromEntries((oportunidadesRes.data || []).map((o: any) => [o.id, o]));
    const personas = Object.fromEntries((personasRes.data || []).map((p: any) => [p.id, p]));
    const ofertas = Object.fromEntries((ofertasRes.data || []).map((o: any) => [o.id, o]));
    const conversaciones = Object.fromEntries((convRes.data || []).map((c: any) => [c.oportunidad_id, c]));
    const etapas = Object.fromEntries((etapasRes.data || []).map((e: any) => [e.id, e.nombre]));
    const subestados = Object.fromEntries((subestadosRes.data || []).map((s: any) => [s.id, s.nombre]));

    const items = (aplicaciones || []).map((a: any) => {
      const oportunidad = oportunidades[a.oportunidad_id] || {};
      const persona = personas[a.persona_id] || {};
      const oferta = ofertas[a.oferta_id] || {};
      const conv = conversaciones[a.oportunidad_id] || null;
      return {
        aplicacionId: a.id,
        oportunidadId: a.oportunidad_id,
        personaId: a.persona_id,
        nombre: nombreCompleto(persona),
        celular: persona.celular_e164 || persona.telefono_principal || '—',
        correo: persona.correo_principal || '—',
        oferta: oferta.nombre || 'Oferta',
        estadoAplicacion: a.estado,
        etapa: etapas[oportunidad.etapa_id] || '—',
        subestado: subestados[oportunidad.subestado_id] || '—',
        temperatura: oportunidad.temperatura || '—',
        fechaAplicacion: a.fecha_aplicacion || a.creado_en,
        conversacionExiste: Boolean(conv),
        conversacionEstado: conv?.estado || null,
        ultimaActividad: conv?.ultima_actividad_en || oportunidad.actualizado_en || a.creado_en
      };
    });

    items.sort((x, y) => new Date(y.ultimaActividad || 0).getTime() - new Date(x.ultimaActividad || 0).getTime());

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
