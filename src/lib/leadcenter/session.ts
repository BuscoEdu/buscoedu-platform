import { getServerSupabase } from '@/src/lib/supabase-server';
import { resolveRoleCode } from '@/src/lib/admin/resolve-role-code';

export interface SesionLeadCenter {
  autenticado: boolean;
  authUserId?: string;
  usuarioInternoId?: string;
  nombre?: string;
  roleCode?: string | null;
  esSuper: boolean;
  esAsesor: boolean;
}

/**
 * Resuelve la sesión del Lead Center desde las cookies (respeta RLS).
 * Devuelve el usuario interno y su rol. El middleware ya bloquea el acceso a
 * usuarios no autorizados; esto complementa dentro de los Server Components.
 */
export async function getSesionLeadCenter(): Promise<SesionLeadCenter> {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) return { autenticado: false, esSuper: false, esAsesor: false };

    const { data: interno } = await supabase
      .from('usuarios_internos')
      .select('id, nombre, nombres, activo, rol_id, roles(codigo)')
      .eq('auth_user_id', user.id)
      .eq('activo', true)
      .single();

    const roleCode = resolveRoleCode((interno as any)?.roles);

    return {
      autenticado: !!interno,
      authUserId: user.id,
      usuarioInternoId: (interno as any)?.id,
      nombre: (interno as any)?.nombre || (interno as any)?.nombres || user.email || 'Usuario',
      roleCode,
      esSuper: roleCode === 'super_admin',
      esAsesor: roleCode === 'asesor'
    };
  } catch {
    return { autenticado: false, esSuper: false, esAsesor: false };
  }
}
