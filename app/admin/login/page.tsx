'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/src/lib/supabase';
import { resolveRoleCode } from '@/src/lib/admin/resolve-role-code';

export default function AdminLoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [email, setEmail] = useState('admin@buscoedu.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;

    async function checkExistingSession() {
      const {
        data: { session }
      } = await supabase.auth.getSession();

      if (session?.user) {
        router.replace('/admin');
      }
    }

    checkExistingSession();
  }, [router, supabase]);

  function handlePasswordVisibilityChange(event: ChangeEvent<HTMLInputElement>) {
    setShowPassword(event.target.checked);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!supabase) {
      setError('No se pudo inicializar la conexión con Supabase.');
      return;
    }

    setError(null);
    setIsLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (signInError || !data.user) {
      setError('Correo o contraseña inválidos.');
      setIsLoading(false);
      return;
    }

    const { data: internalUser, error: roleError } = await supabase
      .from('usuarios_internos')
      .select('id, activo, rol_id, roles(codigo)')
      .eq('auth_user_id', data.user.id)
      .eq('activo', true)
      .single();

    const roleCode = resolveRoleCode(internalUser?.roles);

    console.log('[ADMIN LOGIN][ROLE CHECK]', {
      authUserId: data.user.id,
      roleError,
      internalUser,
      roleCode
    });

    if (roleError || !internalUser || roleCode !== 'super_admin') {
      await supabase.auth.signOut();
      setError('No tienes acceso al panel de administración');
      setIsLoading(false);
      return;
    }

    // Usar window.location para forzar recarga completa y asegurar sincronización de cookies
    window.location.href = '/admin';
  }

  return (
    <section className="flex min-h-[75vh] items-center justify-center bg-buscoedu-bg px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-buscoedu-border bg-white p-6 shadow-card sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-buscoedu-blue text-lg font-bold text-white">
            BE
          </div>
          <h1 className="text-2xl font-bold text-buscoedu-blue">Panel de Administración</h1>
          <p className="mt-1 text-sm text-buscoedu-muted">Acceso exclusivo para usuarios internos</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-buscoedu-text">
              Correo
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-buscoedu-border px-3 py-2 text-sm text-buscoedu-text outline-none ring-buscoedu-teal focus:ring-2"
              placeholder="admin@buscoedu.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-buscoedu-text">
              Contraseña
            </label>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-buscoedu-border px-3 py-2 text-sm text-buscoedu-text outline-none ring-buscoedu-teal focus:ring-2"
              placeholder="••••••••"
            />
            <label
              htmlFor="show-password"
              className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-buscoedu-muted sm:text-[0.95rem]"
            >
              <input
                id="show-password"
                type="checkbox"
                checked={showPassword}
                onChange={handlePasswordVisibilityChange}
                className="h-4 w-4 rounded border-buscoedu-border text-buscoedu-teal focus:ring-buscoedu-teal"
              />
              <span className="font-medium text-buscoedu-blue">Mostrar contraseña</span>
            </label>
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-buscoedu-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </section>
  );
}
