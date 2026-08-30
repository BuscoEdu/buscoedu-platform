import { getServerSupabase } from '@/src/lib/supabase-server';
import OportunidadesBoard from '@/components/leadcenter/OportunidadesBoard';

export const dynamic = 'force-dynamic';

export default async function OportunidadesPage() {
  let etapas: { id: string; nombre: string }[] = [];

  try {
    const supabase = await getServerSupabase();
    const { data } = await supabase
      .from('etapas_embudo')
      .select('id, nombre, orden')
      .order('orden');
    etapas = (data || []).map((e: any) => ({ id: e.id, nombre: e.nombre }));
  } catch {
    etapas = [];
  }

  return <OportunidadesBoard etapas={etapas} />;
}
