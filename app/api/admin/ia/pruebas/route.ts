import { NextRequest, NextResponse } from 'next/server';
import { protegerYObtenerServicio } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNAS =
  'id, version_agente_id, nombre_prueba, mensaje_entrada, contexto_prueba, respuesta_esperada, respuesta_obtenida, resultado, observaciones, ejecutada_por, ejecutada_en';

export async function GET(req: NextRequest) {
  const guard = await protegerYObtenerServicio();
  if ('response' in guard) return guard.response;

  const versionId = req.nextUrl.searchParams.get('version_agente_id');
  let query = guard.service.from('pruebas_agente_ia').select(COLUMNAS);
  if (versionId) query = query.eq('version_agente_id', versionId);

  const { data, error } = await query.order('ejecutada_en', { ascending: false });
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

  const versionId = String(body?.version_agente_id || '').trim();
  const nombrePrueba = String(body?.nombre_prueba || '').trim();
  const mensajeEntrada = String(body?.mensaje_entrada || '').trim();
  if (!versionId) return NextResponse.json({ ok: false, error: 'version_agente_id_requerido' }, { status: 400 });
  if (!nombrePrueba) return NextResponse.json({ ok: false, error: 'nombre_prueba_requerido' }, { status: 400 });
  if (!mensajeEntrada) return NextResponse.json({ ok: false, error: 'mensaje_entrada_requerido' }, { status: 400 });

  const registro = {
    version_agente_id: versionId,
    nombre_prueba: nombrePrueba,
    mensaje_entrada: mensajeEntrada,
    contexto_prueba: body?.contexto_prueba ?? null,
    respuesta_esperada: body?.respuesta_esperada ? String(body.respuesta_esperada) : null,
    resultado: 'pendiente' as const
  };

  const { data, error } = await guard.service
    .from('pruebas_agente_ia')
    .insert(registro)
    .select(COLUMNAS)
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
