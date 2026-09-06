// =====================================================================
// API LEADCENTER · Configuración de cierre para el formulario del asesor
// Devuelve la regla de Ganada activa (qué requisitos son obligatorios) y
// las causas de pérdida activas que puede usar un asesor. Con esto el
// formulario de "Cerrar oportunidad" se dibuja de forma dinámica.
// =====================================================================
import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const sesion = await getSesionLeadCenter();
  if (!sesion.autenticado || (!sesion.esAsesor && !sesion.esSuper)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  try {
    const supabase = await getServerSupabase();

    const [{ data: reglaGanada }, { data: reglaPerdida }, { data: causas }] = await Promise.all([
      supabase
        .from('reglas_cierre_ganada')
        .select('*')
        .eq('activo', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('reglas_cierre_perdida')
        .select('*')
        .eq('activo', true)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('causas_perdida')
        .select('id, nombre, detalle, orden, requiere_comentario, permite_asesor')
        .eq('activo', true)
        .eq('permite_asesor', true)
        .order('orden', { ascending: true })
    ]);

    return NextResponse.json({
      ok: true,
      reglaGanada: reglaGanada || null,
      reglaPerdida: reglaPerdida || null,
      causas: causas || []
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
