import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/src/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getServiceRoleClient();
    const { data, error } = await db
      .from('contexto_naia')
      .select('id, version, nombre, instrucciones_sistema, tono, prioridades_conversacionales, respuestas_guiadas, actualizado_en')
      .eq('activo', true)
      .eq('estado', 'publicado')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ ok: true, item: null });
    }

    return NextResponse.json({ ok: true, item: data });
  } catch {
    return NextResponse.json({ ok: true, item: null });
  }
}
