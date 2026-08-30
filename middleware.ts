import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';
import { resolveRoleCode } from '@/src/lib/admin/resolve-role-code';

function redirectToLogin(request: NextRequest, loginPath: string) {
  const url = request.nextUrl.clone();
  url.pathname = loginPath;
  url.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const esAdmin = pathname.startsWith('/admin');
  const esLeadCenter = pathname.startsWith('/leadcenter');
  const esDemoWapp = pathname.startsWith('/demoWapp');

  // Solo protegemos /admin, /leadcenter y /demoWapp. El resto pasa sin cambios.
  if (!esAdmin && !esLeadCenter && !esDemoWapp) {
    return NextResponse.next();
  }

  // Login del Lead Center abierto (autenticación por contraseña de usuario interno).
  if (pathname === '/admin/login' || pathname === '/leadcenter/login') {
    return NextResponse.next();
  }

  const loginPath = esLeadCenter || esDemoWapp ? '/leadcenter/login' : '/admin/login';
  // El Lead Center permite asesor y super_admin; DemoWapp y /admin solo super_admin.
  const rolesPermitidos = esLeadCenter ? ['super_admin', 'asesor'] : ['super_admin'];

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return redirectToLogin(request, loginPath);
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
    return redirectToLogin(request, loginPath);
  }

  const { data: internalUser, error: roleError } = await supabase
    .from('usuarios_internos')
    .select('id, activo, rol_id, roles(codigo)')
    .eq('auth_user_id', user.id)
    .eq('activo', true)
    .single();

  const roleCode = resolveRoleCode(internalUser?.roles);

  if (roleError || !internalUser || !roleCode || !rolesPermitidos.includes(roleCode)) {
    return redirectToLogin(request, loginPath);
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/leadcenter/:path*', '/demoWapp/:path*']
};
