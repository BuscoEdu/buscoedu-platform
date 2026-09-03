import { NextRequest, NextResponse } from 'next/server';
import { protegerYObtenerServicio } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Publica una versión de agente:
 *   1. Marca la versión como 'publicada' y registra publicada_en / aprobada_por.
 *   2. Desactiva la versión previamente activa del mismo agente (si existe).
 *   3. Actualiza agentes_ia.version_activa_id apuntando a esta versión.
 *
 * Las versiones publicadas son inmutables (ver PATCH de versiones/[id]).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await protegerYObtenerServicio();
  if ('response' in guard) return guard.response;
  const { id } = await params;

  const { data: version, error: versionError } = await guard.service
    .from('versiones_agente_ia')
    .select('id, agente_id, estado, numero_version, configuracion_snapshot')
    .eq('id', id)
    .maybeSingle();

  if (versionError) return NextResponse.json({ ok: false, error: versionError.message }, { status: 500 });
  if (!version) return NextResponse.json({ ok: false, error: 'no_encontrado' }, { status: 404 });
  if (version.estado !== 'borrador') return NextResponse.json({ ok: false, error: 'solo_borrador_publicable' }, { status: 409 });

  const snapshot = (version.configuracion_snapshot || {}) as Record<string, unknown>;
  const despliegueId = snapshot.despliegue_id;
  if (typeof despliegueId !== 'string' || !despliegueId) {
    return NextResponse.json({ ok: false, error: 'selecciona_un_despliegue_para_la_version' }, { status: 409 });
  }

  const [contextos, canales, despliegue, pruebas] = await Promise.all([
    guard.service.from('versiones_agente_contextos').select('id', { count: 'exact', head: true }).eq('version_agente_id', id).eq('activo', true),
    guard.service.from('configuraciones_agente_canal').select('id', { count: 'exact', head: true }).eq('version_agente_id', id).eq('activo', true),
    guard.service.from('despliegues_ia').select('id').eq('id', despliegueId).eq('activo', true).eq('estado', 'activo').maybeSingle(),
    guard.service.from('pruebas_agente_ia').select('id', { count: 'exact', head: true }).eq('version_agente_id', id).eq('resultado', 'exitosa')
  ]);
  if (contextos.error || canales.error || despliegue.error || pruebas.error) {
    return NextResponse.json({ ok: false, error: 'no_se_pudo_validar_la_configuracion' }, { status: 500 });
  }
  if (!contextos.count) return NextResponse.json({ ok: false, error: 'asocia_al_menos_un_contexto_activo' }, { status: 409 });
  if (!canales.count) return NextResponse.json({ ok: false, error: 'configura_al_menos_un_canal_activo' }, { status: 409 });
  if (!despliegue.data) return NextResponse.json({ ok: false, error: 'el_despliegue_seleccionado_no_esta_activo' }, { status: 409 });
  if (!pruebas.count) return NextResponse.json({ ok: false, error: 'ejecuta_y_aprueba_al_menos_una_prueba_antes_de_publicar' }, { status: 409 });

  const ahora = new Date().toISOString();

  // 1. Desactivar la versión activa anterior del mismo agente.
  const { data: agente } = await guard.service
    .from('agentes_ia')
    .select('id, version_activa_id')
    .eq('id', version.agente_id)
    .maybeSingle();

  if (agente?.version_activa_id && agente.version_activa_id !== id) {
    await guard.service
      .from('versiones_agente_ia')
      .update({ estado: 'desactivada', desactivada_en: ahora, actualizado_en: ahora })
      .eq('id', agente.version_activa_id);
  }

  // 2. Publicar esta versión.
  const { data: publicada, error: publicarError } = await guard.service
    .from('versiones_agente_ia')
    .update({
      estado: 'publicada',
      publicada_en: ahora,
      aprobada_por: guard.usuarioInternoId,
      actualizado_en: ahora
    })
    .eq('id', id)
    .select('id, agente_id, numero_version, estado, publicada_en')
    .single();

  if (publicarError) return NextResponse.json({ ok: false, error: publicarError.message }, { status: 500 });

  // 3. Actualizar version_activa_id del agente y activarlo.
  const { error: agenteError } = await guard.service
    .from('agentes_ia')
    .update({ version_activa_id: id, estado: 'activo', actualizado_en: ahora })
    .eq('id', version.agente_id);

  if (agenteError) return NextResponse.json({ ok: false, error: agenteError.message }, { status: 500 });

  return NextResponse.json({ ok: true, item: publicada });
}
