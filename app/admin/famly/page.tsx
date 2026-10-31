import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { resolveRoleCode } from '@/src/lib/admin/resolve-role-code';

export default async function FamlyAdminPage() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect('/admin/login');

  const { data: profile } = await supabase
    .from('usuarios_internos')
    .select('roles(codigo)')
    .eq('id', session.user.id)
    .single();

  const role = resolveRoleCode(profile?.roles);
  if (role !== 'super_admin') redirect('/admin/login');

  return (
    <div style={{height:'100vh'}}>
      <iframe
        src="/admin.html"
        style={{width:'100%',height:'100%',border:'none'}}
        title="FAMLY Super Admin"
      />
    </div>
  );
}
