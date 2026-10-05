import { NextRequest, NextResponse } from 'next/server';
import { esErrorCanalFailClosed, estadoHttpErrorCanal } from '@/lib/agentes';
import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';
import { processInboundStudentMessage } from '@/src/lib/demowapp/mensaje-service';
import { participantesDelHilo } from '@/src/lib/demowapp/participantes-hilo';

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
    // El mensaje y la respuesta de NaIA crean filas de conversación. Se usa el
    // cliente de servidor después de verificar super_admin para no quedar
    // bloqueados por políticas RLS de solo lectura.
    const db = getServiceRoleClient();

    const participantes = await participantesDelHilo(db, oportunidadId);
    if (!participantes) {
      return NextResponse.json({ ok: false, error: 'hilo_no_encontrado' }, { status: 404 });
    }

    const result = await processInboundStudentMessage(db, {
      oportunidadId,
      personaId: participantes.personaId,
      aplicacionId: participantes.aplicacionId,
      texto,
      clientMessageId,
      origen: 'operador_simulacion'
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    // BA-029: canal whatsapp sin config no se disfraza de respuesta de NaIA.
    if (esErrorCanalFailClosed(e)) {
      return NextResponse.json(
        { ok: false, code: e.codigo, error: e.message },
        { status: estadoHttpErrorCanal(e.codigo) }
      );
    }
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
