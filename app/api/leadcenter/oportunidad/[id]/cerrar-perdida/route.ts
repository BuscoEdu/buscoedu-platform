// =====================================================================
// API LEADCENTER · Cerrar oportunidad como PERDIDA
// Llama a la RPC fn_cerrar_perdida. Exige causa (si la regla lo pide) y
// comentario/explicación. Devuelve faltantes si algo obligatorio falta.
// =====================================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/leadcenter/oportunidad/[id]/cerrar-perdida  Body: { causaId, comentario?, canal? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getSesionLeadCenter();
  if (!sesion.autenticado || (!sesion.esAsesor && !sesion.esSuper)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  const causaId = body?.causaId ? String(body.causaId).trim() : null;
  const comentario = body?.comentario ? String(body.comentario).trim() : null;
  const canal = body?.canal ? String(body.canal).trim() : 'leadcenter';

  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.rpc('fn_cerrar_perdida', {
      p_oportunidad_id: id,
      p_causa_id: causaId,
      p_comentario: comentario,
      p_canal: canal
    });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const ok = (data as any)?.ok;
    const status = ok ? 200 : (data as any)?.error === 'no_autorizado' ? 403 : 422;
    return NextResponse.json(data, { status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
