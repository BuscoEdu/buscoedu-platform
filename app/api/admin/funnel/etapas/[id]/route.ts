import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  const patch: Record<string, any> = {};
  if (typeof body?.nombre === 'string') {
    const nombre = body.nombre.trim();
    if (!nombre) return NextResponse.json({ ok: false, error: 'nombre_requerido' }, { status: 400 });
    patch.nombre = nombre;
  }
  if (typeof body?.descripcion === 'string' || body?.descripcion === null) patch.descripcion = body.descripcion?.trim() || null;
  if (body?.orden !== undefined) patch.orden = Number(body.orden);
  if (typeof body?.color === 'string' || body?.color === null) patch.color = body.color?.trim() || null;
  if (body?.es_etapa_final_ganada !== undefined) patch.es_etapa_final_ganada = !!body.es_etapa_final_ganada;
  if (body?.es_etapa_final_perdida !== undefined) patch.es_etapa_final_perdida = !!body.es_etapa_final_perdida;
  if (body?.activo !== undefined) patch.activo = !!body.activo;

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('etapas_embudo')
    .update(patch)
    .eq('id', id)
    .select('id, nombre, descripcion, orden, color, es_etapa_final_ganada, es_etapa_final_perdida, activo')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
