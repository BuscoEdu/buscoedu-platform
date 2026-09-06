// =====================================================================
// API LEADCENTER · Reabrir oportunidad cerrada
// Llama a la RPC fn_reabrir_oportunidad. Conserva el cierre en la
// auditoría, exige motivo y una nueva etapa (subestado opcional).
// =====================================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/leadcenter/oportunidad/[id]/reabrir  Body: { etapaNueva, subestadoNuevo?, motivo, canal? } */
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
  const motivo = body?.motivo ? String(body.motivo).trim() : '';
  const canal = body?.canal ? String(body.canal).trim() : 'leadcenter';

  if (!etapaNueva) return NextResponse.json({ ok: false, error: 'etapa_requerida' }, { status: 400 });
  if (!motivo) return NextResponse.json({ ok: false, error: 'motivo_requerido' }, { status: 400 });

  try {
    const supabase = await getServerSupabase();

    // Valida que el subestado (si viene) pertenezca a la etapa destino.
    if (subestadoNuevo) {
      const { data: sub } = await supabase
        .from('subestados_oportunidad')
        .select('id, etapa_id, activo')
        .eq('id', subestadoNuevo)
        .maybeSingle();
      if (!sub || sub.activo === false || sub.etapa_id !== etapaNueva) {
        return NextResponse.json({ ok: false, error: 'subestado_invalido_para_etapa' }, { status: 400 });
      }
    }

    const { data, error } = await supabase.rpc('fn_reabrir_oportunidad', {
      p_oportunidad_id: id,
      p_etapa_nueva: etapaNueva,
      p_subestado_nuevo: subestadoNuevo,
      p_motivo: motivo,
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
