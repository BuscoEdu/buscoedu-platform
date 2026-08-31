'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AdminNav from '@/components/admin/AdminNav';
import { getSupabaseClient } from '@/src/lib/supabase';

type AdminLayoutProps = {
  children: React.ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [isLoading, setIsLoading] = useState(pathname !== '/admin/login');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [userName, setUserName] = useState('Usuario interno');
  const [roleCode, setRoleCode] = useState('super_admin');

  useEffect(() => {
    if (pathname === '/admin/login') {
      setIsLoading(false);
      return;
    }

    if (!supabase) return;

    async function validateSession() {
      setIsLoading(true);

      const {
        data: { session },
        error: sessionError
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user) {
        router.replace('/admin/login');
        setIsLoading(false);
        return;
      }

      const { data: internalUser, error: userError } = await supabase
        .from('usuarios_internos')
        .select('nombres, apellidos, activo, roles!inner(codigo)')
        .eq('auth_user_id', session.user.id)
        .eq('activo', true)
        .eq('roles.codigo', 'super_admin')
        .maybeSingle();

      if (userError || !internalUser) {
        await supabase.auth.signOut();
        router.replace('/admin/login');
        setIsLoading(false);
        return;
      }

      const fullName = [internalUser.nombres, internalUser.apellidos].filter(Boolean).join(' ').trim();
      if (fullName) setUserName(fullName);
      setRoleCode((internalUser as any)?.roles?.codigo || 'super_admin');

      setIsLoading(false);
    }

    void validateSession();
  }, [pathname, router, supabase]);

  async function handleLogout() {
    if (!supabase) return;
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    setIsLoggingOut(false);
    router.replace('/admin/login');
  }

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  if (isLoading) {
    return (
      <section className="flex min-h-[70vh] items-center justify-center bg-buscoedu-bg px-4">
        <div className="rounded-xl border border-buscoedu-border bg-white px-6 py-5 text-sm text-buscoedu-text shadow-card">
          Validando sesión de administración...
        </div>
      </section>
    );
  }

  return (
    <div className="min-h-[70vh] bg-buscoedu-bg text-buscoedu-text">
      <header className="sticky top-0 z-40 border-b border-buscoedu-border bg-white/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-buscoedu-muted">Administración</p>
            <h1 className="text-lg font-bold text-buscoedu-blue">BuscoEdu Admin</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs text-buscoedu-muted">Usuario</p>
              <p className="text-sm font-semibold text-buscoedu-text">{userName}</p>
            </div>
            <span className="rounded-full bg-buscoedu-bg px-3 py-1 text-xs font-medium text-buscoedu-blue">
              {roleCode}
            </span>
            <Link
              href="/"
              className="rounded-md border border-buscoedu-border px-3 py-2 text-xs font-semibold text-buscoedu-text hover:bg-buscoedu-bg sm:text-sm"
            >
              Volver al portal
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="rounded-md bg-buscoedu-teal px-3 py-2 text-xs font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70 sm:text-sm"
            >
              {isLoggingOut ? 'Cerrando...' : 'Cerrar sesión'}
            </button>
          </div>
        </div>
      </header>

      <div className="md:flex md:items-start">
        <AdminNav roleCode={roleCode} />
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
