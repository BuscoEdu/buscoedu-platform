import { NextRequest, NextResponse } from 'next/server';
import { protegerYObtenerServicio } from '@/lib/agentes/admin-crud';
import { AbacusAdapter } from '@/lib/agentes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNAS =
  'id, version_agente_id, nombre_prueba, mensaje_entrada, contexto_prueba, respuesta_esperada, respuesta_obtenida, resultado, observaciones, ejecutada_por, ejecutada_en';

/**
 * Ejecuta una prueba contra la VERSIÓN ESPECÍFICA asociada a la prueba
 * (no necesariamente la versión activa), construyendo el prompt a partir de
 * los contextos de esa versión y llamando al despliegue activo.
 * Guarda la respuesta obtenida y el resultado (exitosa/fallida).
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

  // Contextos de la versión (ordenados).
  const { data: contextosRows } = await db
    .from('versiones_agente_contextos')
    .select('orden, componentes_contexto_ia:componente_contexto_id(contenido, activo)')
    .eq('version_agente_id', prueba.version_agente_id)
    .eq('activo', true)
    .order('orden', { ascending: true });

  const promptSistema = (contextosRows || [])
    .map((r: any) => (r.componentes_contexto_ia?.activo !== false ? r.componentes_contexto_ia?.contenido : ''))
    .filter((c: string) => typeof c === 'string' && c.trim())
    .join('\n\n');

  // Despliegue activo.
  const { data: despliegue } = await db
    .from('despliegues_ia')
    .select('identificador_externo, referencia_secreto')
    .eq('activo', true)
    .eq('estado', 'activo')
    .limit(1)
    .maybeSingle();

  if (!despliegue?.identificador_externo || !despliegue?.referencia_secreto) {
    return NextResponse.json({ ok: false, error: 'sin_despliegue_activo' }, { status: 409 });
  }

  const ahora = new Date().toISOString();
  let respuestaObtenida = '';
  let resultado: 'exitosa' | 'fallida' = 'fallida';
  let observaciones: string | null = null;

  try {
    const adaptador = new AbacusAdapter();
    const res = await adaptador.ejecutar({
      prompt_sistema: promptSistema,
      mensaje_usuario: prueba.mensaje_entrada,
      identificador_externo: despliegue.identificador_externo,
      referencia_secreto: despliegue.referencia_secreto
    });
    respuestaObtenida = res.respuesta_texto || '';
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
