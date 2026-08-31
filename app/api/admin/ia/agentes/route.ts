import { NextRequest, NextResponse } from 'next/server';
import { protegerYObtenerServicio } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNAS =
  'id, codigo, nombre, descripcion, tipo_agente, objetivo, idioma_principal, entorno, version_activa_id, estado, activo, creado_en, actualizado_en, version_activa:version_activa_id(id, numero_version, estado)';

export async function GET() {
  const guard = await protegerYObtenerServicio();
  if ('response' in guard) return guard.response;

  const { data, error } = await guard.service
    .from('agentes_ia')
    .select(COLUMNAS)
    .order('creado_en', { ascending: false });

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

  const codigo = String(body?.codigo || '').trim();
  const nombre = String(body?.nombre || '').trim();
  if (!codigo) return NextResponse.json({ ok: false, error: 'codigo_requerido' }, { status: 400 });
  if (!nombre) return NextResponse.json({ ok: false, error: 'nombre_requerido' }, { status: 400 });

  const registro = {
    codigo,
    nombre,
    descripcion: body?.descripcion ? String(body.descripcion) : null,
    tipo_agente: body?.tipo_agente ? String(body.tipo_agente) : 'asesor_educativo',
    objetivo: body?.objetivo ? String(body.objetivo) : null,
    idioma_principal: body?.idioma_principal ? String(body.idioma_principal) : 'es',
    entorno: body?.entorno ? String(body.entorno) : 'produccion',
    estado: body?.estado ? String(body.estado) : 'borrador',
    creado_por: guard.usuarioInternoId
  };

  const { data, error } = await guard.service
    .from('agentes_ia')
    .insert(registro)
    .select(COLUMNAS)
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
