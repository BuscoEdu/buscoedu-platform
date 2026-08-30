import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/leadcenter/oportunidad/[id]/etapa  Body: { etapaNueva, subestadoNuevo?, motivo? } */
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

  const etapaNueva = String(body?.etapaNueva || '').trim();
  const subestadoNuevo = body?.subestadoNuevo ? String(body.subestadoNuevo).trim() : null;
  const motivo = body?.motivo ? String(body.motivo).trim() : null;

  if (!etapaNueva) {
    return NextResponse.json({ ok: false, error: 'etapa_requerida' }, { status: 400 });
  }

  try {
    const supabase = await getServerSupabase();

    const { data: etapa, error: etapaError } = await supabase
      .from('etapas_embudo')
      .select('id, activo')
      .eq('id', etapaNueva)
      .maybeSingle();

    if (etapaError) return NextResponse.json({ ok: false, error: etapaError.message }, { status: 500 });
    if (!etapa || etapa.activo === false) {
      return NextResponse.json({ ok: false, error: 'etapa_invalida' }, { status: 400 });
    }

    if (subestadoNuevo) {
      const { data: subestado, error: subestadoError } = await supabase
        .from('subestados_oportunidad')
        .select('id, etapa_id, activo')
        .eq('id', subestadoNuevo)
        .maybeSingle();

      if (subestadoError) {
        return NextResponse.json({ ok: false, error: subestadoError.message }, { status: 500 });
      }

      if (!subestado || subestado.activo === false || subestado.etapa_id !== etapaNueva) {
        return NextResponse.json(
          { ok: false, error: 'subestado_invalido_para_etapa' },
          { status: 400 }
        );
      }
    }

    const { data, error } = await supabase.rpc('fn_cambiar_etapa', {
      p_oportunidad_id: id,
      p_etapa_nueva: etapaNueva,
      p_subestado_nuevo: subestadoNuevo,
      p_motivo: motivo
    });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const ok = (data as any)?.ok;
    return NextResponse.json(data, { status: ok ? 200 : 403 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
