import OportunidadesBoard from '@/components/leadcenter/OportunidadesBoard';
import { getServerSupabase } from '@/src/lib/supabase-server';

export const dynamic = 'force-dynamic';

export default async function OportunidadesPage() {
  let etapas: Array<{ id: string; nombre: string }> = [];

  try {
    const supabase = await getServerSupabase();
    const { data } = await supabase
      .from('etapas_embudo')
      .select('id, nombre')
      .eq('activo', true)
      .order('orden');

    etapas = data || [];
  } catch {
    // El tablero conserva su estado de error controlado si no puede cargar el catálogo.
  }

  return <OportunidadesBoard etapas={etapas} />;
}

