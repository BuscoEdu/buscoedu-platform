import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { verifyDemoWappToken } from '@/src/lib/demowapp/token-service';
import { processInboundStudentMessage } from '@/src/lib/demowapp/mensaje-service';
import { processDuePushes } from '@/src/lib/demowapp/push-service';
import { getLatestConversationByOpportunity } from '@/src/lib/demowapp/conversacion-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validarSesionPublica(req: NextRequest, token: string) {
  const valid = verifyDemoWappToken(token);
  if (!valid.ok) return valid;
  const nonceCookie = req.cookies.get('demowapp_session')?.value;
  if (!nonceCookie || nonceCookie !== valid.payload.nonce) {
    return { ok: false as const, error: 'sesion_navegador_invalida' };
  }
  return valid;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = validarSesionPublica(_req, token);
  if (valid.ok === false) {
    return NextResponse.json({ ok: false, error: valid.error }, { status: 401 });
  }

  try {
    const db = getServiceRoleClient();
    await processDuePushes(db, 20, { oportunidadId: valid.payload.oportunidadId });

    const payload = valid.payload;

    const { data: app } = await db
      .from('aplicaciones')
      .select('id, oportunidad_id, persona_id, oferta_id, estado, fecha_aplicacion')
      .eq('id', payload.aplicacionId)
      .eq('oportunidad_id', payload.oportunidadId)
      .eq('persona_id', payload.personaId)
      .maybeSingle();

    if (!app) {
      return NextResponse.json({ ok: false, error: 'sesion_no_valida' }, { status: 403 });
    }

    const [personaRes, ofertaRes, conv] = await Promise.all([
      db
        .from('personas')
        .select('id, nombres, apellidos, celular_e164, correo_principal')
        .eq('id', payload.personaId)
        .maybeSingle(),
      db.from('ofertas_academicas').select('id, nombre').eq('id', app.oferta_id).maybeSingle(),
      getLatestConversationByOpportunity(db, payload.oportunidadId)
    ]);

    let mensajes: any[] = [];
    if (conv?.id) {
      const msgRes = await db
        .from('mensajes_conversacion')
        .select('id, remitente_tipo, contenido, enviado_en, creado_en, metadatos')
        .eq('conversacion_id', conv.id)
        .order('creado_en', { ascending: true });
      mensajes = msgRes.data || [];
    }

    return NextResponse.json({
      ok: true,
      session: {
        tokenValido: true,
        oportunidadId: payload.oportunidadId,
        aplicacionId: payload.aplicacionId,
        personaId: payload.personaId,
        nombre: [personaRes.data?.nombres, personaRes.data?.apellidos].filter(Boolean).join(' ') || 'Estudiante',
        oferta: ofertaRes.data?.nombre || 'Oferta',
        conversacionId: conv?.id || null,
        mensajes
      }
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = validarSesionPublica(req, token);
  if (valid.ok === false) {
    return NextResponse.json({ ok: false, error: valid.error }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  const texto = String(body?.texto || '').trim();
  const clientMessageId = String(body?.clientMessageId || '').trim();
  if (!texto) return NextResponse.json({ ok: false, error: 'texto_requerido' }, { status: 400 });
  if (clientMessageId.length < 8) {
    return NextResponse.json({ ok: false, error: 'client_message_id_invalido' }, { status: 400 });
  }

  try {
    const db = getServiceRoleClient();
    const payload = valid.payload;

    const result = await processInboundStudentMessage(db, {
      oportunidadId: payload.oportunidadId,
      personaId: payload.personaId,
      aplicacionId: payload.aplicacionId,
      texto,
      clientMessageId,
      origen: 'estudiante_modal',
      visitanteId: payload.visitanteId,
      celularVerificado: payload.celularVerificado
    });

    return NextResponse.json({ ok: true, result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
