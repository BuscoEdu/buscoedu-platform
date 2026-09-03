import { NextRequest, NextResponse } from 'next/server';
import { protegerYObtenerServicio } from '@/lib/agentes/admin-crud';
import { agenteExecutor } from '@/lib/agentes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNAS =
  'id, version_agente_id, nombre_prueba, mensaje_entrada, contexto_prueba, respuesta_esperada, respuesta_obtenida, resultado, observaciones, ejecutada_por, ejecutada_en';

/**
 * Ejecuta exactamente el mismo camino que producción contra la versión
 * asociada a la prueba, sin activarla ni contaminar el historial operativo.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await protegerYObtenerServicio();
  if ('response' in guard) return guard.response;
  const { id } = await params;
  const db = guard.service;

  const { data: prueba, error: pruebaError } = await db
    .from('pruebas_agente_ia')
    .select('id, version_agente_id, mensaje_entrada, respuesta_esperada')
    .eq('id', id)
    .maybeSingle();

  if (pruebaError) return NextResponse.json({ ok: false, error: pruebaError.message }, { status: 500 });
  if (!prueba) return NextResponse.json({ ok: false, error: 'no_encontrado' }, { status: 404 });

  const { data: version, error: versionError } = await db
    .from('versiones_agente_ia')
    .select('id, agente_id, agentes_ia:agente_id(codigo)')
    .eq('id', prueba.version_agente_id)
    .maybeSingle();
  if (versionError || !version) {
    return NextResponse.json({ ok: false, error: 'version_no_encontrada' }, { status: 404 });
  }

  const { data: configuracionCanal } = await db
    .from('configuraciones_agente_canal')
    .select('canales_ia:canal_id(codigo)')
    .eq('version_agente_id', version.id)
    .eq('activo', true)
    .limit(1)
    .maybeSingle();

  const codigoAgente = (version.agentes_ia as any)?.codigo;
  const codigoCanal = (configuracionCanal?.canales_ia as any)?.codigo;
  if (!codigoAgente || !codigoCanal) {
    return NextResponse.json({ ok: false, error: 'version_sin_canal_configurado' }, { status: 409 });
  }

  const ahora = new Date().toISOString();
  let respuestaObtenida = '';
  let resultado: 'exitosa' | 'fallida' = 'fallida';
  let observaciones: string | null = null;

  try {
    const res = await agenteExecutor.ejecutar({
      codigo_agente: codigoAgente,
      codigo_canal: codigoCanal,
      mensaje_usuario: prueba.mensaje_entrada,
      version_agente_id: version.id,
      modo_simulacion: true
    });
    respuestaObtenida = res.mensaje || '';
    resultado = respuestaObtenida.trim() ? 'exitosa' : 'fallida';
    if (!respuestaObtenida.trim()) observaciones = 'El proveedor no devolvió respuesta.';
  } catch (err) {
    observaciones = err instanceof Error ? err.message : 'error_desconocido';
    resultado = 'fallida';
  }

  const { data, error } = await db
    .from('pruebas_agente_ia')
    .update({
      respuesta_obtenida: respuestaObtenida,
      resultado,
      observaciones,
      ejecutada_por: guard.usuarioInternoId,
      ejecutada_en: ahora
    })
    .eq('id', id)
    .select(COLUMNAS)
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
