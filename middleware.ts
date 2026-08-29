import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { resolveRoleCode } from '@/src/lib/admin/resolve-role-code';

function redirectToAdminLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = '/admin/login';
  url.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/admin')) {
    return NextResponse.next();
  }

  if (pathname === '/admin/login') {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return redirectToAdminLogin(request);
  }

  let response = NextResponse.next({
    request
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options as CookieOptions)
        );
      }
    }
  });

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return redirectToAdminLogin(request);
  }

  const { data: internalUser, error: roleError } = await supabase
    .from('usuarios_internos')
    .select('id, activo, rol_id, roles(codigo)')
    .eq('auth_user_id', user.id)
    .eq('activo', true)
    .single();

  const roleCode = resolveRoleCode(internalUser?.roles);

  if (roleError || !internalUser || roleCode !== 'super_admin') {
    return redirectToAdminLogin(request);
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*']
};
