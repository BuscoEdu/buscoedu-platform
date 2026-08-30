import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';
import { processInboundStudentMessage } from '@/src/lib/demowapp/mensaje-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, { params }: { params: Promise<{ oportunidadId: string }> }) {
  const sesion = await getSesionLeadCenter();
  if (!sesion.autenticado || !sesion.esSuper) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const { oportunidadId } = await params;
  if (!UUID_RE.test(oportunidadId)) {
    return NextResponse.json({ ok: false, error: 'oportunidad_invalida' }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  const texto = String(body?.texto || '').trim();
  const clientMessageId = String(body?.clientMessageId || '').trim();

  if (!texto) {
    return NextResponse.json({ ok: false, error: 'texto_requerido' }, { status: 400 });
  }

  if (!clientMessageId || clientMessageId.length < 8) {
    return NextResponse.json({ ok: false, error: 'client_message_id_invalido' }, { status: 400 });
  }

  try {
    // La autorización ya se validó arriba con la sesión super_admin. Las tablas
    // de conversaciones y mensajes no exponen políticas RLS de INSERT para el
    // cliente autenticado, por lo que la persistencia se hace desde servidor
    // con service role, sin exponer esa clave al navegador.
    const db = getServiceRoleClient();

    const { data: app, error: appError } = await db
      .from('aplicaciones')
      .select('id, persona_id')
      .eq('oportunidad_id', oportunidadId)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (appError || !app) {
      return NextResponse.json({ ok: false, error: 'aplicacion_no_encontrada' }, { status: 404 });
    }

    const result = await processInboundStudentMessage(db, {
      oportunidadId,
      personaId: app.persona_id,
      aplicacionId: app.id,
      texto,
      clientMessageId,
      origen: 'operador_simulacion'
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
