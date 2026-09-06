// =====================================================================
// API LEADCENTER · Cerrar oportunidad como GANADA
// Llama a la RPC fn_cerrar_ganada con el cliente de sesión del asesor.
// La RPC valida los requisitos de la regla activa y devuelve, si falta
// algún obligatorio, la lista de faltantes (no cierra en ese caso).
// =====================================================================
import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/leadcenter/oportunidad/[id]/cerrar-ganada  Body: { datos, canal? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getSesionLeadCenter();
  if (!sesion.autenticado || (!sesion.esAsesor && !sesion.esSuper)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  const datos = body?.datos && typeof body.datos === 'object' ? body.datos : {};
  const canal = body?.canal ? String(body.canal).trim() : 'leadcenter';

  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.rpc('fn_cerrar_ganada', {
      p_oportunidad_id: id,
      p_datos: datos,
      p_canal: canal
    });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    const ok = (data as any)?.ok;
    // 200 si cerró; 422 si faltan requisitos; 403 si no autorizado.
    const status = ok ? 200 : (data as any)?.error === 'no_autorizado' ? 403 : 422;
    return NextResponse.json(data, { status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
