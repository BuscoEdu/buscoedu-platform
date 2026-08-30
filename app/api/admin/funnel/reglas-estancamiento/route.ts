import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validarNivel(etapaId: string | null, subestadoId: string | null) {
  const tieneEtapa = !!etapaId;
  const tieneSubestado = !!subestadoId;
  return (tieneEtapa && !tieneSubestado) || (!tieneEtapa && tieneSubestado);
}

export async function GET() {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('reglas_estancamiento')
    .select('id, etapa_id, subestado_id, tiempo_maximo_horas, accion_recomendada, reduce_score, escalar_a_humano, crear_tarea, mover_a_nurturing, activo, creado_en, actualizado_en')
    .order('creado_en', { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  const etapaId = body?.etapa_id ? String(body.etapa_id).trim() : null;
  const subestadoId = body?.subestado_id ? String(body.subestado_id).trim() : null;
  const tiempoMaximo = Number(body?.tiempo_maximo_horas);

  if (!Number.isFinite(tiempoMaximo) || tiempoMaximo <= 0) {
    return NextResponse.json({ ok: false, error: 'tiempo_maximo_invalido' }, { status: 400 });
  }

  if (!validarNivel(etapaId, subestadoId)) {
    return NextResponse.json({ ok: false, error: 'nivel_regla_invalido' }, { status: 400 });
  }

  const { supabase } = auth.ctx;

  if (subestadoId) {
    const { data: sub } = await supabase
      .from('subestados_oportunidad')
      .select('id')
      .eq('id', subestadoId)
      .maybeSingle();
    if (!sub) return NextResponse.json({ ok: false, error: 'subestado_invalido' }, { status: 400 });
  }

  if (etapaId) {
    const { data: et } = await supabase.from('etapas_embudo').select('id').eq('id', etapaId).maybeSingle();
    if (!et) return NextResponse.json({ ok: false, error: 'etapa_invalida' }, { status: 400 });
  }

  const payload = {
    etapa_id: etapaId,
    subestado_id: subestadoId,
    tiempo_maximo_horas: tiempoMaximo,
    accion_recomendada: body?.accion_recomendada?.trim() || null,
    reduce_score: !!body?.reduce_score,
    escalar_a_humano: !!body?.escalar_a_humano,
    crear_tarea: body?.crear_tarea !== false,
    mover_a_nurturing: !!body?.mover_a_nurturing,
    activo: body?.activo !== false
  };

  const { data, error } = await supabase
    .from('reglas_estancamiento')
    .insert(payload)
    .select('id, etapa_id, subestado_id, tiempo_maximo_horas, accion_recomendada, reduce_score, escalar_a_humano, crear_tarea, mover_a_nurturing, activo, creado_en, actualizado_en')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
