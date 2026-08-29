'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/src/lib/supabase';
import { resolveRoleCode } from '@/src/lib/admin/resolve-role-code';

const ROLES_PERMITIDOS = ['super_admin', 'asesor'];

export default function LeadCenterLoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return getSupabaseClient();
  }, []);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) router.replace('/leadcenter');
    });
  }, [router, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setError('No se pudo inicializar la conexión con Supabase.');
      return;
    }
    setError(null);
    setIsLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
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

    if (roleError || !internalUser || !roleCode || !ROLES_PERMITIDOS.includes(roleCode)) {
      await supabase.auth.signOut();
      setError('No tienes acceso al Lead Center.');
      setIsLoading(false);
      return;
    }

    window.location.href = '/leadcenter';
  }

  return (
    <section className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-lg sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-lg font-bold text-white">
            BE
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Lead Center</h1>
          <p className="mt-1 text-sm text-gray-500">Acceso para asesores y administradores</p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
              Correo
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="asesor@buscoedu.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-gray-500">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(e) => setShowPassword(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Mostrar contraseña</span>
            </label>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-70"
          >
            {isLoading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </section>
  );
}
