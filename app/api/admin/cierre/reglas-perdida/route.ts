// =====================================================================
// API ADMIN · Reglas de cierre PERDIDA
// GET   -> devuelve la regla activa.
// PATCH -> actualiza la regla activa y sube la versión.
// Solo super_admin.
// =====================================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';
import { getServiceRoleClient } from '@/src/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BOOL_FIELDS = [
  'activo', 'comentario_obligatorio', 'causa_obligatoria', 'ia_puede_marcar',
  'requiere_aprobacion_humana', 'permite_reabrir'
];
const INT_FIELDS = ['tiempo_minimo_horas'];
const ARRAY_FIELDS = ['roles_autorizados', 'canales_habilitados'];

export async function GET() {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('reglas_cierre_perdida')
    .select('*')
    .eq('activo', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  const supabase = getServiceRoleClient();

  const { data: actual, error: errActual } = await supabase
    .from('reglas_cierre_perdida')
    .select('*')
    .eq('activo', true)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errActual) return NextResponse.json({ ok: false, error: errActual.message }, { status: 500 });
  if (!actual) return NextResponse.json({ ok: false, error: 'sin_regla_activa' }, { status: 404 });

  const patch: Record<string, any> = {
    version: (actual.version || 1) + 1,
    actualizado_en: new Date().toISOString()
  };
  for (const f of BOOL_FIELDS) if (body?.[f] !== undefined) patch[f] = body[f] === true;
  for (const f of INT_FIELDS) if (body?.[f] !== undefined && Number.isFinite(Number(body[f]))) patch[f] = Number(body[f]);
  for (const f of ARRAY_FIELDS) if (Array.isArray(body?.[f])) patch[f] = body[f];

  const { data, error } = await supabase
    .from('reglas_cierre_perdida')
    .update(patch)
    .eq('id', actual.id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
