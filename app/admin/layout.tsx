'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import AdminSidebar from '@/components/admin/AdminSidebar';
import AdminTopBar from '@/components/admin/AdminTopBar';
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

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(pathname !== '/admin/login');
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [userName, setUserName] = useState('Usuario interno');

  useEffect(() => {
    if (pathname === '/admin/login') {
      setIsLoading(false);
      return;
    }

    if (!supabase) {
      return;
    }

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

      const fullName = [internalUser.nombres, internalUser.apellidos]
        .filter(Boolean)
        .join(' ')
        .trim();

      if (fullName) {
        setUserName(fullName);
      }

      setIsLoading(false);
    }

    validateSession();
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
      <div className="flex">
        <AdminSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

        <div className="flex min-h-[70vh] flex-1 flex-col md:ml-0">
          <AdminTopBar
            userName={userName}
            role="super_admin"
            onMenuClick={() => setIsSidebarOpen(true)}
            onLogout={handleLogout}
            isLoggingOut={isLoggingOut}
          />

          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
