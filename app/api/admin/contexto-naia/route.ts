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

export async function GET() {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const { supabase } = auth.ctx;
  const { data, error } = await supabase
    .from('contexto_naia')
    .select('id, version, nombre, instrucciones_sistema, tono, prioridades_conversacionales, respuestas_guiadas, estado, activo, creado_por, creado_en, actualizado_en, usuarios_internos:creado_por(nombres, apellidos, correo)')
    .order('version', { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdminApi();
  if ('response' in auth) return auth.response;

  const { supabase, usuarioInternoId } = auth.ctx;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  const nombre = String(body?.nombre || '').trim();
  if (!nombre) {
    return NextResponse.json({ ok: false, error: 'nombre_requerido' }, { status: 400 });
  }

  const instruccionesSistema = body?.instrucciones_sistema ? String(body.instrucciones_sistema) : null;
  const tono = body?.tono ? String(body.tono) : null;

  const prioridades = parseJsonObject(body?.prioridades_conversacionales, 'prioridades_conversacionales');
  if (prioridades.error) {
    return NextResponse.json({ ok: false, error: prioridades.error }, { status: 400 });
  }

  const respuestas = parseJsonObject(body?.respuestas_guiadas, 'respuestas_guiadas');
  if (respuestas.error) {
    return NextResponse.json({ ok: false, error: respuestas.error }, { status: 400 });
  }

  const { data: last, error: lastError } = await supabase
    .from('contexto_naia')
    .select('version')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastError) return NextResponse.json({ ok: false, error: lastError.message }, { status: 500 });

  const version = (last?.version || 0) + 1;

  const { data, error } = await supabase
    .from('contexto_naia')
    .insert({
      version,
      nombre,
      instrucciones_sistema: instruccionesSistema,
      tono,
      prioridades_conversacionales: prioridades.value || {},
      respuestas_guiadas: respuestas.value || {},
      estado: 'borrador',
      activo: false,
      creado_por: usuarioInternoId
    })
    .select('id, version, nombre, instrucciones_sistema, tono, prioridades_conversacionales, respuestas_guiadas, estado, activo, creado_por, creado_en, actualizado_en')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, item: data });
}
