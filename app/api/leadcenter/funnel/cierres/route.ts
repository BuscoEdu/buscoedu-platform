import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';

// Devuelve la configuración activa que el formulario de cierre debe respetar.
export async function GET() {
  const sesion = await getSesionLeadCenter();
  if (!sesion.autenticado || (!sesion.esAsesor && !sesion.esSuper)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const supabase = await getServerSupabase();
  const [requisitos, causas] = await Promise.all([
    supabase.from('funnel_cierre_requisitos').select('codigo,nombre,tipo_cierre,modo,orden').eq('activo', true).order('orden'),
    supabase.from('funnel_causas_perdida').select('codigo,nombre,requiere_detalle,orden').eq('activo', true).order('orden')
  ]);
  if (requisitos.error || causas.error) return NextResponse.json({ ok: false, error: requisitos.error?.message || causas.error?.message }, { status: 500 });
  return NextResponse.json({ ok: true, requisitos: requisitos.data || [], causas: causas.data || [] });
}
