import { NextRequest, NextResponse } from 'next/server';
import { protegerYObtenerServicio } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNAS =
  'id, agente_id, numero_version, nombre_version, estado, objetivo_version, notas_cambio, configuracion_snapshot, publicada_en, desactivada_en, creada_por, aprobada_por, activo, creado_en, actualizado_en';

const CAMPOS_EDITABLES = ['nombre_version', 'objetivo_version', 'notas_cambio'] as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await protegerYObtenerServicio();
  if ('response' in guard) return guard.response;
  const { id } = await params;

  const { data, error } = await guard.service
    .from('versiones_agente_ia')
    .select(COLUMNAS)
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: 'no_encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true, item: data });
}

/**
 * Solo se pueden editar versiones en estado 'borrador'.
 * Las versiones publicadas son INMUTABLES: para cambiar se crea una nueva versión.
 */
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

  const { data: actual, error: actualError } = await guard.service
    .from('versiones_agente_ia')
    .select('id, estado')
    .eq('id', id)
    .maybeSingle();

  if (actualError) return NextResponse.json({ ok: false, error: actualError.message }, { status: 500 });
  if (!actual) return NextResponse.json({ ok: false, error: 'no_encontrado' }, { status: 404 });
  if (actual.estado !== 'borrador') {
    return NextResponse.json({ ok: false, error: 'version_inmutable_publicada' }, { status: 409 });
  }

  const patch: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
  for (const campo of CAMPOS_EDITABLES) {
    if (body?.[campo] !== undefined) patch[campo] = body[campo] === null ? null : String(body[campo]);
  }
  if (body?.configuracion_snapshot !== undefined) patch.configuracion_snapshot = body.configuracion_snapshot;

  const { data, error } = await guard.service
    .from('versiones_agente_ia')
    .update(patch)
    .eq('id', id)
    .select(COLUMNAS)
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
