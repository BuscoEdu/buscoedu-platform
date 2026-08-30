import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('etapas_embudo')
    .select('id, nombre, descripcion, orden, color, es_etapa_final_ganada, es_etapa_final_perdida, activo')
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
  if (!nombre) {
    return NextResponse.json({ ok: false, error: 'nombre_requerido' }, { status: 400 });
  }

  const { supabase } = auth.ctx;

  const { data: ultima } = await supabase
    .from('etapas_embudo')
    .select('orden')
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = {
    nombre,
    descripcion: body?.descripcion?.trim() || null,
    orden: Number.isFinite(Number(body?.orden)) ? Number(body.orden) : (ultima?.orden || 0) + 1,
    color: body?.color?.trim() || null,
    es_etapa_final_ganada: !!body?.es_etapa_final_ganada,
    es_etapa_final_perdida: !!body?.es_etapa_final_perdida,
    activo: body?.activo !== false
  };

  const { data, error } = await supabase
    .from('etapas_embudo')
    .insert(payload)
    .select('id, nombre, descripcion, orden, color, es_etapa_final_ganada, es_etapa_final_perdida, activo')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
