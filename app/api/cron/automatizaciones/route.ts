import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/src/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST/GET /api/cron/automatizaciones
 *
 * Endpoint del cron de automatizaciones (motor de estancamiento). Protegido por
 * un secreto compartido: el llamador debe enviar `Authorization: Bearer <CRON_SECRET>`
 * o `?secret=<CRON_SECRET>`. Sin secreto configurado, el endpoint queda deshabilitado
 * (responde 503) para evitar ejecuciones no autenticadas.
 *
 * Ejecuta `fn_evaluar_estancamiento` con service role. La RPC es idempotente:
 * puede invocarse varias veces sin duplicar efectos.
 */
async function ejecutar(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'cron_deshabilitado', detalle: 'Falta configurar CRON_SECRET.' },
      { status: 503 }
    );
  }

  const auth = req.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const qsSecret = req.nextUrl.searchParams.get('secret') || '';
  if (bearer !== secret && qsSecret !== secret) {
    return NextResponse.json({ ok: false, error: 'no_autorizado' }, { status: 401 });
  }

  try {
    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.rpc('fn_evaluar_estancamiento', { p_limite: 200 });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, resultado: data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return ejecutar(req);
}

export async function GET(req: NextRequest) {
  return ejecutar(req);
}
