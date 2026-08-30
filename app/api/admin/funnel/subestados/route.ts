import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('subestados_oportunidad')
    .select('id, etapa_id, nombre, descripcion, orden, tiempo_maximo_horas, activo')
    .order('etapa_id', { ascending: true })
    .order('orden', { ascending: true });

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

  const nombre = String(body?.nombre || '').trim();
  const etapaId = String(body?.etapa_id || '').trim();

  if (!nombre) return NextResponse.json({ ok: false, error: 'nombre_requerido' }, { status: 400 });
  if (!etapaId) return NextResponse.json({ ok: false, error: 'etapa_requerida' }, { status: 400 });

  const { supabase } = auth.ctx;

  const { data: etapa } = await supabase.from('etapas_embudo').select('id').eq('id', etapaId).maybeSingle();
  if (!etapa) return NextResponse.json({ ok: false, error: 'etapa_invalida' }, { status: 400 });

  const { data: ultimo } = await supabase
    .from('subestados_oportunidad')
    .select('orden')
    .eq('etapa_id', etapaId)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = {
    etapa_id: etapaId,
    nombre,
    descripcion: body?.descripcion?.trim() || null,
    orden: Number.isFinite(Number(body?.orden)) ? Number(body.orden) : (ultimo?.orden || 0) + 1,
    tiempo_maximo_horas: body?.tiempo_maximo_horas === null || body?.tiempo_maximo_horas === undefined || body?.tiempo_maximo_horas === ''
      ? null
      : Number(body.tiempo_maximo_horas),
    activo: body?.activo !== false
  };

  const { data, error } = await supabase
    .from('subestados_oportunidad')
    .insert(payload)
    .select('id, etapa_id, nombre, descripcion, orden, tiempo_maximo_horas, activo')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
