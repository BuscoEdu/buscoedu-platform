import { NextRequest, NextResponse } from 'next/server';
import { protegerYObtenerServicio } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNAS =
  'id, codigo, nombre, descripcion, tipo_agente, objetivo, idioma_principal, entorno, version_activa_id, estado, activo, creado_en, actualizado_en, version_activa:version_activa_id(id, numero_version, estado)';

const CAMPOS_EDITABLES = [
  'nombre',
  'descripcion',
  'tipo_agente',
  'objetivo',
  'idioma_principal',
  'entorno',
  'estado'
] as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await protegerYObtenerServicio();
  if ('response' in guard) return guard.response;
  const { id } = await params;

  const { data, error } = await guard.service
    .from('agentes_ia')
    .select(COLUMNAS)
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: 'no_encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true, item: data });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await protegerYObtenerServicio();
  if ('response' in guard) return guard.response;
  const { id } = await params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  const patch: Record<string, unknown> = { actualizado_en: new Date().toISOString(), actualizado_por: guard.usuarioInternoId };
  for (const campo of CAMPOS_EDITABLES) {
    if (body?.[campo] !== undefined) {
      patch[campo] = body[campo] === null ? null : String(body[campo]);
    }
  }
  if (body?.activo !== undefined) patch.activo = Boolean(body.activo);

  const { data, error } = await guard.service
    .from('agentes_ia')
    .update(patch)
    .eq('id', id)
    .select(COLUMNAS)
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await protegerYObtenerServicio();
  if ('response' in guard) return guard.response;
  const { id } = await params;

  // Borrado lógico: activo = false y estado archivado.
  const { data, error } = await guard.service
    .from('agentes_ia')
    .update({ activo: false, estado: 'archivado', actualizado_en: new Date().toISOString(), actualizado_por: guard.usuarioInternoId })
    .eq('id', id)
    .select('id, activo, estado')
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
