import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/src/lib/admin/require-super-admin-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parseJsonObject(value: any, fieldName: string): { value?: Record<string, any>; error?: string } {
  if (value == null || value === '') return { value: {} };

  const raw = typeof value === 'string' ? value : value;
  let parsed: any = raw;

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { error: `${fieldName}_json_invalido` };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { error: `${fieldName}_debe_ser_objeto` };
  }

  return { value: parsed };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const { id } = await params;
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from('contexto_naia')
    .select('id, version, nombre, instrucciones_sistema, tono, prioridades_conversacionales, respuestas_guiadas, estado, activo, creado_por, creado_en, actualizado_en')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: 'no_encontrado' }, { status: 404 });

  return NextResponse.json({ ok: true, item: data });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const { id } = await params;
  const { supabase } = auth.ctx;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  const { data: actual, error: currentError } = await supabase
    .from('contexto_naia')
    .select('id, estado')
    .eq('id', id)
    .maybeSingle();

  if (currentError) return NextResponse.json({ ok: false, error: currentError.message }, { status: 500 });
  if (!actual) return NextResponse.json({ ok: false, error: 'no_encontrado' }, { status: 404 });
  if (actual.estado !== 'borrador') {
    return NextResponse.json({ ok: false, error: 'solo_borrador_editable' }, { status: 409 });
  }

  const patch: Record<string, any> = { actualizado_en: new Date().toISOString() };

  if (body?.nombre !== undefined) {
    const nombre = String(body.nombre || '').trim();
    if (!nombre) return NextResponse.json({ ok: false, error: 'nombre_requerido' }, { status: 400 });
    patch.nombre = nombre;
  }

  if (body?.instrucciones_sistema !== undefined) {
    patch.instrucciones_sistema = body.instrucciones_sistema ? String(body.instrucciones_sistema) : null;
  }

  if (body?.tono !== undefined) {
    patch.tono = body.tono ? String(body.tono) : null;
  }

  if (body?.prioridades_conversacionales !== undefined) {
    const parsed = parseJsonObject(body.prioridades_conversacionales, 'prioridades_conversacionales');
    if (parsed.error) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    patch.prioridades_conversacionales = parsed.value || {};
  }

  if (body?.respuestas_guiadas !== undefined) {
    const parsed = parseJsonObject(body.respuestas_guiadas, 'respuestas_guiadas');
    if (parsed.error) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    patch.respuestas_guiadas = parsed.value || {};
  }

  const { data, error } = await supabase
    .from('contexto_naia')
    .update(patch)
    .eq('id', id)
    .select('id, version, nombre, instrucciones_sistema, tono, prioridades_conversacionales, respuestas_guiadas, estado, activo, creado_por, creado_en, actualizado_en')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const { id } = await params;
  const { supabase } = auth.ctx;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  const accion = String(body?.accion || '').trim().toLowerCase();
  if (!accion) return NextResponse.json({ ok: false, error: 'accion_requerida' }, { status: 400 });

  const { data: actual, error: currentError } = await supabase
    .from('contexto_naia')
    .select('id, estado, activo')
    .eq('id', id)
    .maybeSingle();

  if (currentError) return NextResponse.json({ ok: false, error: currentError.message }, { status: 500 });
  if (!actual) return NextResponse.json({ ok: false, error: 'no_encontrado' }, { status: 404 });

  if (accion === 'publicar') {
    const desactivar = await supabase
      .from('contexto_naia')
      .update({ activo: false, actualizado_en: new Date().toISOString() })
      .eq('activo', true);

    if (desactivar.error) return NextResponse.json({ ok: false, error: desactivar.error.message }, { status: 500 });

    const { data, error } = await supabase
      .from('contexto_naia')
      .update({ estado: 'publicado', activo: true, actualizado_en: new Date().toISOString() })
      .eq('id', id)
      .select('id, version, nombre, instrucciones_sistema, tono, prioridades_conversacionales, respuestas_guiadas, estado, activo, creado_por, creado_en, actualizado_en')
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  }

  if (accion === 'archivar') {
    const { data, error } = await supabase
      .from('contexto_naia')
      .update({ estado: 'archivado', activo: false, actualizado_en: new Date().toISOString() })
      .eq('id', id)
      .select('id, version, nombre, instrucciones_sistema, tono, prioridades_conversacionales, respuestas_guiadas, estado, activo, creado_por, creado_en, actualizado_en')
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  }

  return NextResponse.json({ ok: false, error: 'accion_no_soportada' }, { status: 400 });
}
