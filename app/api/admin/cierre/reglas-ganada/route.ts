// =====================================================================
// API ADMIN · Reglas de cierre GANADA
// GET   -> devuelve la regla activa (mayor versión activa).
// PATCH -> actualiza la regla activa y sube la versión (trazabilidad).
// Solo super_admin.
// =====================================================================
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';
import { getServiceRoleClient } from '@/src/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Requisitos parametrizables: obligatorio | opcional | no_utilizado
const NIVELES = ['obligatorio', 'opcional', 'no_utilizado'];
const REQ_FIELDS = [
  'req_pago_confirmado', 'req_evidencia_pago', 'req_programa', 'req_universidad',
  'req_fecha_confirmacion', 'req_actor_valido', 'req_canal_origen', 'req_comentario'
];
const BOOL_FIELDS = [
  'activo', 'ia_puede_sugerir', 'ia_puede_ejecutar', 'requiere_aprobacion_humana',
  'pago_validado_antes_cierre', 'permite_reabrir'
];
const ARRAY_FIELDS = ['roles_autorizados', 'canales_habilitados'];

export async function GET() {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from('reglas_cierre_ganada')
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

  // Regla activa actual
  const { data: actual, error: errActual } = await supabase
    .from('reglas_cierre_ganada')
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
  for (const f of REQ_FIELDS) {
    if (body?.[f] !== undefined) {
      if (!NIVELES.includes(body[f])) {
        return NextResponse.json({ ok: false, error: `valor_invalido_${f}` }, { status: 400 });
      }
      patch[f] = body[f];
    }
  }
  for (const f of BOOL_FIELDS) if (body?.[f] !== undefined) patch[f] = body[f] === true;
  for (const f of ARRAY_FIELDS) if (Array.isArray(body?.[f])) patch[f] = body[f];

  const { data, error } = await supabase
    .from('reglas_cierre_ganada')
    .update(patch)
    .eq('id', actual.id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
