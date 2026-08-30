import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validarCodigo(codigo: string) {
  return /^[a-z0-9_]+$/.test(codigo);
}

export async function GET() {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('roles')
    .select('id, codigo, nombre, descripcion, permisos, activo, creado_en, actualizado_en')
    .order('nombre', { ascending: true });

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

  const codigo = String(body?.codigo || '').trim().toLowerCase();
  const nombre = String(body?.nombre || '').trim();
  const descripcion = body?.descripcion ? String(body.descripcion).trim() : null;
  const permisos = body?.permisos && typeof body.permisos === 'object' ? body.permisos : {};
  const activo = body?.activo !== false;

  if (!codigo) return NextResponse.json({ ok: false, error: 'codigo_requerido' }, { status: 400 });
  if (!validarCodigo(codigo)) return NextResponse.json({ ok: false, error: 'codigo_invalido' }, { status: 400 });
  if (!nombre) return NextResponse.json({ ok: false, error: 'nombre_requerido' }, { status: 400 });

  const { supabase } = auth.ctx;

  const { data: dup, error: dupError } = await supabase.from('roles').select('id').eq('codigo', codigo).maybeSingle();
  if (dupError) return NextResponse.json({ ok: false, error: dupError.message }, { status: 500 });
  if (dup) return NextResponse.json({ ok: false, error: 'codigo_duplicado' }, { status: 409 });

  const { data, error } = await supabase
    .from('roles')
    .insert({ codigo, nombre, descripcion, permisos, activo })
    .select('id, codigo, nombre, descripcion, permisos, activo, creado_en, actualizado_en')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
