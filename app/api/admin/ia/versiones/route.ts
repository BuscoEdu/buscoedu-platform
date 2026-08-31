import { NextRequest, NextResponse } from 'next/server';
import { protegerYObtenerServicio } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNAS =
  'id, agente_id, numero_version, nombre_version, estado, objetivo_version, notas_cambio, configuracion_snapshot, publicada_en, desactivada_en, creada_por, aprobada_por, activo, creado_en, actualizado_en';

export async function GET(req: NextRequest) {
  const guard = await protegerYObtenerServicio();
  if ('response' in guard) return guard.response;

  const agenteId = req.nextUrl.searchParams.get('agente_id');

  let query = guard.service.from('versiones_agente_ia').select(COLUMNAS);
  if (agenteId) query = query.eq('agente_id', agenteId);

  const { data, error } = await query.order('creado_en', { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data || [] });
}

export async function POST(req: NextRequest) {
  const guard = await protegerYObtenerServicio();
  if ('response' in guard) return guard.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  const agenteId = String(body?.agente_id || '').trim();
  const numeroVersion = String(body?.numero_version || '').trim();
  if (!agenteId) return NextResponse.json({ ok: false, error: 'agente_id_requerido' }, { status: 400 });
  if (!numeroVersion) return NextResponse.json({ ok: false, error: 'numero_version_requerido' }, { status: 400 });

  const registro = {
    agente_id: agenteId,
    numero_version: numeroVersion,
    nombre_version: body?.nombre_version ? String(body.nombre_version) : null,
    objetivo_version: body?.objetivo_version ? String(body.objetivo_version) : null,
    notas_cambio: body?.notas_cambio ? String(body.notas_cambio) : null,
    configuracion_snapshot: body?.configuracion_snapshot ?? null,
    estado: 'borrador' as const,
    creada_por: guard.usuarioInternoId
  };

  const { data, error } = await guard.service
    .from('versiones_agente_ia')
    .insert(registro)
    .select(COLUMNAS)
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
