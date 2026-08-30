import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';
import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { isValidEmail } from '@/src/lib/admin/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const { id } = await params;
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('usuarios_internos')
    .select('id, auth_user_id, rol_id, nombres, apellidos, correo, telefono, cargo, activo, ultimo_acceso_en, creado_en, actualizado_en, roles(id, codigo, nombre, descripcion, activo)')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: 'no_encontrado' }, { status: 404 });

  return NextResponse.json({ ok: true, item: data });
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

  const nombres = String(body?.nombres || '').trim();
  const apellidos = String(body?.apellidos || '').trim();
  const correo = String(body?.correo || '').trim().toLowerCase();
  const telefono = body?.telefono ? String(body.telefono).trim() : null;
  const cargo = body?.cargo ? String(body.cargo).trim() : null;
  const rolId = body?.rol_id ? String(body.rol_id).trim() : '';
  const activo = body?.activo !== false;

  if (!nombres) return NextResponse.json({ ok: false, error: 'nombres_requeridos' }, { status: 400 });
  if (!apellidos) return NextResponse.json({ ok: false, error: 'apellidos_requeridos' }, { status: 400 });
  if (!correo) return NextResponse.json({ ok: false, error: 'correo_requerido' }, { status: 400 });
  if (!isValidEmail(correo)) return NextResponse.json({ ok: false, error: 'correo_invalido' }, { status: 400 });
  if (!rolId) return NextResponse.json({ ok: false, error: 'rol_requerido' }, { status: 400 });

  const { supabase } = auth.ctx;

  const { data: existing, error: existingError } = await supabase
    .from('usuarios_internos')
    .select('id, correo, auth_user_id')
    .eq('id', id)
    .maybeSingle();

  if (existingError) return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ ok: false, error: 'no_encontrado' }, { status: 404 });

  const { data: rol, error: rolError } = await supabase
    .from('roles')
    .select('id, activo')
    .eq('id', rolId)
    .eq('activo', true)
    .maybeSingle();
  if (rolError || !rol) return NextResponse.json({ ok: false, error: 'rol_invalido' }, { status: 400 });

  const { data: dupCorreo, error: dupError } = await supabase
    .from('usuarios_internos')
    .select('id')
    .eq('correo', correo)
    .neq('id', id)
    .maybeSingle();

  if (dupError) return NextResponse.json({ ok: false, error: dupError.message }, { status: 500 });
  if (dupCorreo) return NextResponse.json({ ok: false, error: 'correo_duplicado' }, { status: 409 });

  if (existing.auth_user_id && existing.correo !== correo) {
    try {
      const service = getServiceRoleClient();
      const { error: authUpdateError } = await service.auth.admin.updateUserById(existing.auth_user_id, {
        email: correo
      });
      if (authUpdateError) {
        return NextResponse.json({ ok: false, error: `auth_update_error: ${authUpdateError.message}` }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ ok: false, error: 'auth_update_error' }, { status: 500 });
    }
  }

  const { data, error } = await supabase
    .from('usuarios_internos')
    .update({
      nombres,
      apellidos,
      correo,
      telefono,
      cargo,
      rol_id: rolId,
      activo,
      actualizado_en: new Date().toISOString()
    })
    .eq('id', id)
    .select('id, auth_user_id, rol_id, nombres, apellidos, correo, telefono, cargo, activo, ultimo_acceso_en, creado_en, actualizado_en, roles(id, codigo, nombre, descripcion, activo)')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, item: data });
}
