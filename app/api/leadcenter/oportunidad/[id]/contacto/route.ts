import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/src/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/leadcenter/oportunidad/[id]/contacto
 * Body: { personaId, canal, resultado, nota?, crearTarea?, fechaTarea?, tituloTarea? }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }
  const { personaId, canal, resultado, nota, crearTarea, fechaTarea, tituloTarea } = body || {};
  if (!canal) return NextResponse.json({ ok: false, error: 'canal_requerido' }, { status: 400 });

  try {
    const supabase = await getServerSupabase();
    const { data, error } = await supabase.rpc('fn_registrar_contacto', {
      p_oportunidad_id: id,
      p_persona_id: personaId || null,
      p_canal: canal,
      p_resultado: resultado || null,
      p_nota: nota || null,
      p_crear_tarea: !!crearTarea,
      p_fecha_tarea: fechaTarea || null,
      p_titulo_tarea: tituloTarea || null
    });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: (data as any)?.ok ? 200 : 403 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
