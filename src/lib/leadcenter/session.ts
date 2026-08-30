import { getServerSupabase, getServiceRoleClient } from '@/src/lib/supabase-server';
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
 * Resuelve la sesión del Lead Center desde las cookies.
 * La identidad procede siempre de Supabase Auth. El perfil interno se resuelve
 * desde el servidor para no confundir una política RLS administrativa con una
 * falta de autenticación del asesor.
 */
export async function getSesionLeadCenter(): Promise<SesionLeadCenter> {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) return { autenticado: false, esSuper: false, esAsesor: false };

    // RLS en usuarios_internos está reservada a la administración. Tras validar
    // la sesión del navegador, el servidor resuelve únicamente el perfil de ese
    // usuario con la service role; la clave nunca llega al cliente.
    const service = getServiceRoleClient();
    const { data: interno, error: internoError } = await service
      .from('usuarios_internos')
      .select('id, nombre, nombres, activo, rol_id, roles(codigo)')
      .eq('auth_user_id', user.id)
      .eq('activo', true)
      .single();

    if (internoError || !interno) {
      return { autenticado: false, esSuper: false, esAsesor: false };
    }

    const roleCode = resolveRoleCode((interno as any).roles);

    return {
      autenticado: true,
      authUserId: user.id,
      usuarioInternoId: (interno as any).id,
      nombre: (interno as any).nombre || (interno as any).nombres || user.email || 'Usuario',
      roleCode,
      esSuper: roleCode === 'super_admin',
      esAsesor: roleCode === 'asesor'
    };
  } catch {
    return { autenticado: false, esSuper: false, esAsesor: false };
  }
}
