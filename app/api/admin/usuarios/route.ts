import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';
import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { isValidEmail } from '@/src/lib/admin/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function randomPassword(length = 24) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  try {
    const service = getServiceRoleClient();
    const { data, error } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) return null;
    const user = (data.users || []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    return user?.id || null;
  } catch {
    return null;
  }
}

export async function GET() {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('usuarios_internos')
    .select('id, auth_user_id, rol_id, nombres, apellidos, correo, telefono, cargo, activo, ultimo_acceso_en, creado_en, actualizado_en, roles(id, codigo, nombre, descripcion, activo)')
    .order('creado_en', { ascending: false });

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

  const { data: rol, error: rolError } = await supabase
    .from('roles')
    .select('id, codigo, nombre, activo')
    .eq('id', rolId)
    .eq('activo', true)
    .maybeSingle();
  if (rolError || !rol) return NextResponse.json({ ok: false, error: 'rol_invalido' }, { status: 400 });

  const { data: dupCorreo, error: dupError } = await supabase
    .from('usuarios_internos')
    .select('id')
    .eq('correo', correo)
    .maybeSingle();

  if (dupError) return NextResponse.json({ ok: false, error: dupError.message }, { status: 500 });
  if (dupCorreo) return NextResponse.json({ ok: false, error: 'correo_duplicado' }, { status: 409 });

  let authUserId: string | null = null;
  let authStatus: 'completa' | 'pendiente' = 'pendiente';
  let authMensaje =
    'El usuario interno se creó sin cuenta de acceso. Debe configurarse su cuenta mediante el flujo de activación pendiente.';

  try {
    const service = getServiceRoleClient();
    const { data: createdUser, error: createAuthError } = await service.auth.admin.createUser({
      email: correo,
      password: randomPassword(),
      email_confirm: false,
      user_metadata: { nombres, apellidos }
    });

    if (!createAuthError && createdUser.user?.id) {
      authUserId = createdUser.user.id;
      authStatus = 'completa';
      authMensaje = 'Usuario creado y vinculado con Supabase Auth. Debe completar activación por recuperación de contraseña.';
      await service.auth.admin.generateLink({
        type: 'recovery',
        email: correo
      });
    } else if (String(createAuthError?.message || '').toLowerCase().includes('already')) {
      authUserId = await findAuthUserIdByEmail(correo);
      if (authUserId) {
        authStatus = 'completa';
        authMensaje = 'Se reutilizó una cuenta de Supabase Auth existente para este correo.';
      }
    }
  } catch {
    // fallback pendiente
  }

  const { data, error } = await supabase
    .from('usuarios_internos')
    .insert({
      auth_user_id: authUserId,
      rol_id: rolId,
      nombres,
      apellidos,
      correo,
      telefono,
      cargo,
      activo
    })
    .select('id, auth_user_id, rol_id, nombres, apellidos, correo, telefono, cargo, activo, ultimo_acceso_en, creado_en, actualizado_en, roles(id, codigo, nombre, descripcion, activo)')
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    item: data,
    auth_integration: {
      estado: authStatus,
      mensaje: authMensaje
    }
  });
}
