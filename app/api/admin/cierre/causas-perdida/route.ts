// =====================================================================
// API ADMIN · Causas de pérdida (CRUD)
// GET   -> lista todas las causas (activas e inactivas) ordenadas.
// POST  -> crea una nueva causa.
// Solo super_admin. Nunca se borra físicamente: para "eliminar" se usa
// PATCH con activo=false (ver [id]/route.ts).
// =====================================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';
import { getServiceRoleClient } from '@/src/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLS =
  'id, nombre, detalle, orden, activo, requiere_comentario, permite_asesor, permite_universidad, permite_ia, creado_en, actualizado_en';

export async function GET() {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('causas_perdida')
    .select(COLS)
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
  if (!nombre) return NextResponse.json({ ok: false, error: 'nombre_requerido' }, { status: 400 });

  const supabase = getServiceRoleClient();

  // Calcula el siguiente orden si no viene explícito.
  const { data: ultimo } = await supabase
    .from('causas_perdida')
    .select('orden')
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = {
    nombre,
    detalle: body?.detalle?.trim() || null,
    orden: Number.isFinite(Number(body?.orden)) ? Number(body.orden) : (ultimo?.orden || 0) + 10,
    activo: body?.activo !== false,
    requiere_comentario: body?.requiere_comentario !== false,
    permite_asesor: body?.permite_asesor !== false,
    permite_universidad: body?.permite_universidad !== false,
    permite_ia: body?.permite_ia === true
  };

  const { data, error } = await supabase.from('causas_perdida').insert(payload).select(COLS).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
