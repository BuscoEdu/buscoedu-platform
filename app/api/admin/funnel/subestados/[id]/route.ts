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

  if (body?.etapa_id !== undefined) {
    const etapaId = body.etapa_id ? String(body.etapa_id).trim() : '';
    if (!etapaId) return NextResponse.json({ ok: false, error: 'etapa_requerida' }, { status: 400 });
    patch.etapa_id = etapaId;
  }

  if (typeof body?.descripcion === 'string' || body?.descripcion === null) patch.descripcion = body.descripcion?.trim() || null;
  if (body?.orden !== undefined) patch.orden = Number(body.orden);
  if (body?.tiempo_maximo_horas !== undefined) {
    patch.tiempo_maximo_horas =
      body.tiempo_maximo_horas === null || body.tiempo_maximo_horas === ''
        ? null
        : Number(body.tiempo_maximo_horas);
  }
  if (body?.activo !== undefined) patch.activo = !!body.activo;

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('subestados_oportunidad')
    .update(patch)
    .eq('id', id)
    .select('id, etapa_id, nombre, descripcion, orden, tiempo_maximo_horas, activo')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
