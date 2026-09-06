// =====================================================================
// API ADMIN · Causa de pérdida individual (PATCH)
// Actualiza campos de una causa: nombre, detalle, orden, activo (soft
// delete), requiere_comentario y qué actores la pueden usar.
// Solo super_admin. No existe DELETE físico.
// =====================================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';
import { getServiceRoleClient } from '@/src/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLS =
  'id, nombre, detalle, orden, activo, requiere_comentario, permite_asesor, permite_universidad, permite_ia, creado_en, actualizado_en';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const { id: rawId } = await params;
  const id = String(rawId || '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'id_requerido' }, { status: 400 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  // Solo se actualizan los campos presentes en el body.
  const patch: Record<string, any> = { actualizado_en: new Date().toISOString() };
  if (body?.nombre !== undefined) patch.nombre = String(body.nombre).trim();
  if (body?.detalle !== undefined) patch.detalle = body.detalle?.trim() || null;
  if (body?.orden !== undefined && Number.isFinite(Number(body.orden))) patch.orden = Number(body.orden);
  if (body?.activo !== undefined) patch.activo = body.activo === true;
  if (body?.requiere_comentario !== undefined) patch.requiere_comentario = body.requiere_comentario === true;
  if (body?.permite_asesor !== undefined) patch.permite_asesor = body.permite_asesor === true;
  if (body?.permite_universidad !== undefined) patch.permite_universidad = body.permite_universidad === true;
  if (body?.permite_ia !== undefined) patch.permite_ia = body.permite_ia === true;

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from('causas_perdida').update(patch).eq('id', id).select(COLS).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
