import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validarCodigo(codigo: string) {
  return /^[a-z0-9_]+$/.test(codigo);
}

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

  const { supabase } = auth.ctx;

  const { data: current, error: currentError } = await supabase
    .from('roles')
    .select('id, codigo')
    .eq('id', id)
    .maybeSingle();

  if (currentError) return NextResponse.json({ ok: false, error: currentError.message }, { status: 500 });
  if (!current) return NextResponse.json({ ok: false, error: 'no_encontrado' }, { status: 404 });

  const patch: Record<string, any> = { actualizado_en: new Date().toISOString() };

  if (body.codigo !== undefined) {
    const codigo = String(body.codigo || '').trim().toLowerCase();
    if (!codigo) return NextResponse.json({ ok: false, error: 'codigo_requerido' }, { status: 400 });
    if (!validarCodigo(codigo)) return NextResponse.json({ ok: false, error: 'codigo_invalido' }, { status: 400 });

    const { data: dup, error: dupError } = await supabase
      .from('roles')
      .select('id')
      .eq('codigo', codigo)
      .neq('id', id)
      .maybeSingle();

    if (dupError) return NextResponse.json({ ok: false, error: dupError.message }, { status: 500 });
    if (dup) return NextResponse.json({ ok: false, error: 'codigo_duplicado' }, { status: 409 });

    patch.codigo = codigo;
  }

  if (body.nombre !== undefined) {
    const nombre = String(body.nombre || '').trim();
    if (!nombre) return NextResponse.json({ ok: false, error: 'nombre_requerido' }, { status: 400 });
    patch.nombre = nombre;
  }

  if (body.descripcion !== undefined) {
    patch.descripcion = body.descripcion ? String(body.descripcion).trim() : null;
  }

  if (body.permisos !== undefined) {
    if (!body.permisos || typeof body.permisos !== 'object') {
      return NextResponse.json({ ok: false, error: 'permisos_invalido' }, { status: 400 });
    }
    patch.permisos = body.permisos;
  }

  if (body.activo !== undefined) {
    patch.activo = !!body.activo;
  }

  const { data, error } = await supabase
    .from('roles')
    .update(patch)
    .eq('id', id)
    .select('id, codigo, nombre, descripcion, permisos, activo, creado_en, actualizado_en')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
