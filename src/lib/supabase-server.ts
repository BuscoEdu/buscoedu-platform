import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

/**
 * Cliente Supabase para el SERVIDOR.
 *
 * Dos variantes:
 *  - getServiceRoleClient(): usa SUPABASE_SERVICE_ROLE_KEY. Bypassa RLS.
 *    SOLO para operaciones internas controladas (OTP, RPC de conversión).
 *    NUNCA se expone al navegador ni se importa desde componentes cliente.
 *  - getServerSupabase(): cliente ligado a la sesión (cookies) del usuario
 *    autenticado. Respeta RLS. Se usa en el Lead Center (asesor/super_admin).
 *
 * Ninguna clave se hardcodea: todo proviene de variables de entorno.
 */

export function getServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    const missing = [
      !url ? 'NEXT_PUBLIC_SUPABASE_URL' : null,
      !serviceKey ? 'SUPABASE_SERVICE_ROLE_KEY' : null
    ].filter(Boolean);
    throw new Error(`Faltan variables de entorno del servidor: ${missing.join(', ')}`);
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/**
 * Cliente ligado a la sesión (cookies). Respeta RLS. Úsese en Server
 * Components / Route Handlers del Lead Center para que las políticas
 * lc_* filtren por el asesor autenticado.
 */
export async function getServerSupabase(): Promise<SupabaseClient> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Faltan variables de entorno de Supabase: NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Llamado desde un Server Component: el middleware refresca la sesión.
        }
      }
    }
  });
}
