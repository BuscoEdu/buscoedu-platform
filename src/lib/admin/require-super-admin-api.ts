import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { resolveRoleCode } from '@/src/lib/admin/resolve-role-code';

export interface SuperAdminApiContext {
  supabase: Awaited<ReturnType<typeof getServerSupabase>>;
  userId: string;
  usuarioInternoId: string;
}

export async function requireSuperAdminApi(): Promise<
  { ok: true; ctx: SuperAdminApiContext } | { ok: false; response: NextResponse }
> {
  const supabase = await getServerSupabase();

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    };
  }

  const { data: interno, error: internoError } = await supabase
    .from('usuarios_internos')
    .select('id, activo, rol_id, roles(codigo)')
    .eq('auth_user_id', user.id)
    .eq('activo', true)
    .maybeSingle();

  const roleCode = resolveRoleCode((interno as any)?.roles);

  if (internoError || !interno || roleCode !== 'super_admin') {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })
    };
  }

  return {
    ok: true,
    ctx: {
      supabase,
      userId: user.id,
      usuarioInternoId: (interno as any).id
    }
  };
}
