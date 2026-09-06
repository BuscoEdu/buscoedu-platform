// =====================================================================
// API ADMIN · Reglas de DESAPARECIDO
// GET   -> devuelve la regla activa.
// PATCH -> actualiza la regla activa y sube la versión.
// Solo super_admin. Recordatorio: "Desaparecido" es reversible y NO cierra
// automáticamente salvo que cierre_automatico_permitido sea true.
// =====================================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';
import { getServiceRoleClient } from '@/src/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BOOL_FIELDS = [
  'activo', 'crea_tarea_seguimiento', 'mueve_auto_a_desaparecido',
  'ia_puede_sugerir', 'cierre_automatico_permitido'
];
const INT_FIELDS = [
  'horas_sin_respuesta', 'numero_intentos', 'horas_entre_intentos', 'sugiere_perdida_tras_horas'
];
const ARRAY_FIELDS = ['canales_utilizados'];
const TEXT_FIELDS = ['mensaje_ultimo_contacto'];

export async function GET() {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('reglas_desaparecido')
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
    .from('reglas_desaparecido')
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
  for (const f of TEXT_FIELDS) if (body?.[f] !== undefined) patch[f] = body[f]?.trim() || null;

  const { data, error } = await supabase
    .from('reglas_desaparecido')
    .update(patch)
    .eq('id', actual.id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
