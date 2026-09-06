import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';
import { getServiceRoleClient } from '@/src/lib/supabase-server';

// CRUD administrativo de requisitos de cierre y causas de pérdida.
export async function GET() {
  const auth = await requireSuperAdminApi(); if ('response' in auth) return auth.response;
  const db = getServiceRoleClient();
  const [r, c] = await Promise.all([
    db.from('funnel_cierre_requisitos').select('*').order('tipo_cierre').order('orden'),
    db.from('funnel_causas_perdida').select('*').order('orden')
  ]);
  if (r.error || c.error) return NextResponse.json({ ok: false, error: r.error?.message || c.error?.message }, { status: 500 });
  return NextResponse.json({ ok: true, requisitos: r.data || [], causas: c.data || [] });
}

export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdminApi(); if ('response' in auth) return auth.response;
  const body = await req.json(); const db = getServiceRoleClient();
  const tabla = body?.tipo === 'causa' ? 'funnel_causas_perdida' : 'funnel_cierre_requisitos';
  const id = String(body?.id || ''); if (!id) return NextResponse.json({ ok: false, error: 'id_requerido' }, { status: 400 });
  const patch = body?.tipo === 'causa'
    ? { nombre: body.nombre, descripcion: body.descripcion || null, orden: Number(body.orden), requiere_detalle: body.requiere_detalle !== false, activo: body.activo !== false, actualizado_en: new Date().toISOString() }
    : { modo: body.modo, descripcion: body.descripcion || null, orden: Number(body.orden), activo: body.activo !== false, actualizado_en: new Date().toISOString() };
  const { data, error } = await db.from(tabla).update(patch).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
