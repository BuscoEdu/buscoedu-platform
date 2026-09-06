import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';
import { getServiceRoleClient } from '@/src/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const supabase = getServiceRoleClient();
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
  const primeraSubetapa = String(body?.primera_subetapa || '').trim();
  if (!nombre) {
    return NextResponse.json({ ok: false, error: 'nombre_requerido' }, { status: 400 });
  }
  if (!primeraSubetapa) {
    return NextResponse.json({ ok: false, error: 'primera_subetapa_requerida' }, { status: 400 });
  }

  const supabase = getServiceRoleClient();

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

  const { data: subestado, error: subestadoError } = await supabase
    .from('subestados_oportunidad')
    .insert({
      etapa_id: data.id,
      nombre: primeraSubetapa,
      descripcion: null,
      orden: 1,
      tiempo_maximo_horas: 24,
      activo: true
    })
    .select('id, etapa_id, nombre, descripcion, orden, tiempo_maximo_horas, activo')
    .single();

  if (subestadoError) {
    // No dejamos una etapa huérfana si el alta obligatoria de su primera
    // subetapa falla.
    await supabase.from('etapas_embudo').delete().eq('id', data.id);
    return NextResponse.json({ ok: false, error: subestadoError.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, item: data, primera_subetapa: subestado });
}
