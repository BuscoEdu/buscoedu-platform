import { NextRequest, NextResponse } from 'next/server';
import { agenteExecutor } from '@/lib/agentes';
import { protegerYObtenerServicio } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Ejecuta una versión concreta (incluidos borradores) sin activarla en producción. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await protegerYObtenerServicio();
  if ('response' in guard) return guard.response;
  const { id } = await params;

  let body: { mensaje?: string; codigo_canal?: string; comparar_con_version_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }
  const mensaje = String(body?.mensaje || '').trim();
  const codigoCanal = String(body?.codigo_canal || 'web').trim();
  if (!mensaje) return NextResponse.json({ ok: false, error: 'mensaje_requerido' }, { status: 400 });

  const { data: version, error } = await guard.service
    .from('versiones_agente_ia')
    .select('id, agente_id, agentes_ia:agente_id(codigo)')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!version) return NextResponse.json({ ok: false, error: 'no_encontrado' }, { status: 404 });
  const codigoAgente = (version.agentes_ia as any)?.codigo;
  if (!codigoAgente) return NextResponse.json({ ok: false, error: 'agente_no_encontrado' }, { status: 409 });

  const ejecutar = async (versionId: string) => {
    const salida = await agenteExecutor.ejecutar({
      codigo_agente: codigoAgente,
      codigo_canal: codigoCanal,
      mensaje_usuario: mensaje,
      version_agente_id: versionId,
      modo_simulacion: true
    });
    return { version_id: versionId, mensaje: salida.mensaje, filtros: salida.filtros, pregunta_seguimiento: salida.pregunta_seguimiento, opciones_sugeridas: salida.opciones_sugeridas };
  };

  try {
    const principal = await ejecutar(id);
    let comparacion = null;
    if (body?.comparar_con_version_id) {
      const { data: otra } = await guard.service
        .from('versiones_agente_ia')
        .select('id, agente_id')
        .eq('id', body.comparar_con_version_id)
        .maybeSingle();
      if (!otra || otra.agente_id !== version.agente_id) {
        return NextResponse.json({ ok: false, error: 'la_version_de_comparacion_debe_pertenecer_al_mismo_agente' }, { status: 409 });
      }
      comparacion = await ejecutar(otra.id);
    }
    return NextResponse.json({ ok: true, principal, comparacion });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : 'error_en_simulacion' }, { status: 409 });
  }
}
