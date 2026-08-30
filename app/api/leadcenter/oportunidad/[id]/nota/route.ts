import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const sesion = await getSesionLeadCenter();
  if (!sesion.autenticado) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const { id } = await context.params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  const nota = (body?.nota ?? '').toString().trim();

  try {
    const supabase = await getServerSupabase();

    const { data, error } = await supabase
      .from('oportunidades')
      .update({ notas_internas: nota || null, actualizado_en: new Date().toISOString() })
      .eq('id', id)
      .select('id, notas_internas')
      .single();

    if (error) {
      const status = /permission|row-level security|not authorized|forbidden/i.test(error.message)
        ? 403
        : 500;
      return NextResponse.json({ ok: false, error: status === 403 ? 'forbidden' : error.message }, { status });
    }

    return NextResponse.json({ ok: true, item: data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'server_error' },
      { status: 500 }
    );
  }
}
