import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/src/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/leadcenter/oportunidad/[id]/etapa  Body: { etapaNueva, subestadoNuevo?, motivo? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }
  const { etapaNueva, subestadoNuevo, motivo } = body || {};
  if (!etapaNueva) {
    return NextResponse.json({ ok: false, error: 'etapa_requerida' }, { status: 400 });
  }
  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.rpc('fn_cambiar_etapa', {
      p_oportunidad_id: id,
      p_etapa_nueva: etapaNueva,
      p_subestado_nuevo: subestadoNuevo || null,
      p_motivo: motivo || null
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: (data as any)?.ok ? 200 : 403 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
