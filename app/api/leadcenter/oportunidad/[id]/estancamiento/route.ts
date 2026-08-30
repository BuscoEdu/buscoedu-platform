import { NextResponse } from 'next/server';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';
import { calcularEstadoEstancamiento } from '@/src/lib/leadcenter/estancamiento';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getSesionLeadCenter();
  if (!sesion.autenticado) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const supabase = await getServerSupabase();

    const [{ data: oportunidad, error: oError }, { data: reglas, error: rError }] = await Promise.all([
      supabase.from('oportunidades').select('id, etapa_id, subestado_id, actualizado_en').eq('id', id).maybeSingle(),
      supabase
        .from('reglas_estancamiento')
        .select('id, etapa_id, subestado_id, tiempo_maximo_horas, accion_recomendada, activo')
        .eq('activo', true)
    ]);

    if (oError) return NextResponse.json({ ok: false, error: oError.message }, { status: 500 });
    if (rError) return NextResponse.json({ ok: false, error: rError.message }, { status: 500 });
    if (!oportunidad) return NextResponse.json({ ok: false, error: 'oportunidad_no_encontrada' }, { status: 404 });

    const estancamiento = calcularEstadoEstancamiento({
      reglas: (reglas as any[]) || [],
      etapa_id: (oportunidad as any).etapa_id,
      subestado_id: (oportunidad as any).subestado_id,
      actualizado_en: (oportunidad as any).actualizado_en
    });

    return NextResponse.json({ ok: true, oportunidad_id: id, estancamiento });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}
