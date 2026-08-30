import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validarNivel(etapaId: string | null, subestadoId: string | null) {
  const tieneEtapa = !!etapaId;
  const tieneSubestado = !!subestadoId;
  return (tieneEtapa && !tieneSubestado) || (!tieneEtapa && tieneSubestado);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const { id } = await params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  const { supabase } = auth.ctx;
  const { data: actual, error: actualError } = await supabase
    .from('reglas_estancamiento')
    .select('id, etapa_id, subestado_id')
    .eq('id', id)
    .maybeSingle();

  if (actualError || !actual) {
    return NextResponse.json({ ok: false, error: 'regla_no_encontrada' }, { status: 404 });
  }

  const etapaId = body?.etapa_id !== undefined ? (body.etapa_id ? String(body.etapa_id).trim() : null) : actual.etapa_id;
  const subestadoId = body?.subestado_id !== undefined ? (body.subestado_id ? String(body.subestado_id).trim() : null) : actual.subestado_id;

  if (!validarNivel(etapaId, subestadoId)) {
    return NextResponse.json({ ok: false, error: 'nivel_regla_invalido' }, { status: 400 });
  }

  const patch: Record<string, any> = {
    etapa_id: etapaId,
    subestado_id: subestadoId,
    actualizado_en: new Date().toISOString()
  };

  if (body?.tiempo_maximo_horas !== undefined) {
    const tiempo = Number(body.tiempo_maximo_horas);
    if (!Number.isFinite(tiempo) || tiempo <= 0) {
      return NextResponse.json({ ok: false, error: 'tiempo_maximo_invalido' }, { status: 400 });
    }
    patch.tiempo_maximo_horas = tiempo;
  }

  if (typeof body?.accion_recomendada === 'string' || body?.accion_recomendada === null) patch.accion_recomendada = body.accion_recomendada?.trim() || null;
  if (body?.reduce_score !== undefined) patch.reduce_score = !!body.reduce_score;
  if (body?.escalar_a_humano !== undefined) patch.escalar_a_humano = !!body.escalar_a_humano;
  if (body?.crear_tarea !== undefined) patch.crear_tarea = !!body.crear_tarea;
  if (body?.mover_a_nurturing !== undefined) patch.mover_a_nurturing = !!body.mover_a_nurturing;
  if (body?.activo !== undefined) patch.activo = !!body.activo;

  const { data, error } = await supabase
    .from('reglas_estancamiento')
    .update(patch)
    .eq('id', id)
    .select('id, etapa_id, subestado_id, tiempo_maximo_horas, accion_recomendada, reduce_score, escalar_a_humano, crear_tarea, mover_a_nurturing, activo, creado_en, actualizado_en')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, item: data });
}
