import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';
import { generarSugerencia, ContextoCopiloto } from '@/src/lib/leadcenter/copiloto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/leadcenter/oportunidad/[id]/copiloto
 * Devuelve la sugerencia determinista del copiloto para la oportunidad.
 * El copiloto NUNCA actúa por su cuenta: sólo sugiere. La lectura pasa por RLS.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await getServerSupabase();

    const { data: op, error } = await supabase
      .from('oportunidades')
      .select(
        'id, temperatura, estado, puntaje, fecha_proxima_accion, actualizado_en, etapa_id, modelo_negocio_snapshot'
      )
      .eq('id', id)
      .single();

    if (error || !op) {
      return NextResponse.json({ ok: false, error: 'no_encontrada' }, { status: 404 });
    }

    // Datos complementarios para las reglas.
    const [{ data: etapa }, { count: tareasPend }, { count: consentTransfer }] = await Promise.all([
      supabase.from('etapas_embudo').select('nombre').eq('id', (op as any).etapa_id).single(),
      supabase
        .from('tareas_crm')
        .select('id', { count: 'exact', head: true })
        .eq('oportunidad_id', id)
        .eq('estado', 'pendiente'),
      supabase
        .from('transferencias_universidad')
        .select('id', { count: 'exact', head: true })
        .eq('oportunidad_id', id)
        .eq('estado', 'pendiente')
    ]);

    const modelo = (op as any).modelo_negocio_snapshot;
    // Para por_lead, requiere consentimiento si NO existe ninguna transferencia en curso.
    const requiereConsentimientoTransferencia =
      modelo === 'por_lead' && (consentTransfer ?? 0) === 0;

    const ctx: ContextoCopiloto = {
      temperatura: (op as any).temperatura,
      estado: (op as any).estado,
      puntaje: (op as any).puntaje,
      fechaProximaAccion: (op as any).fecha_proxima_accion,
      actualizadoEn: (op as any).actualizado_en,
      etapaNombre: (etapa as any)?.nombre,
      modeloNegocio: modelo,
      requiereConsentimientoTransferencia,
      tieneTareaPendiente: (tareasPend ?? 0) > 0
    };

    return NextResponse.json({ ok: true, sugerencia: generarSugerencia(ctx) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

/**
 * POST /api/leadcenter/oportunidad/[id]/copiloto
 * Body: { accion, decision: 'registrar' | 'ignorar', tituloSugerencia? }
 * Registra la decisión del asesor como nota interna auditada. El copiloto no
 * ejecuta la acción por su cuenta: sólo deja constancia de la decisión humana.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }
  const { accion, decision, tituloSugerencia, personaId } = body || {};
  if (!decision || !['registrar', 'ignorar'].includes(decision)) {
    return NextResponse.json({ ok: false, error: 'decision_invalida' }, { status: 400 });
  }

  try {
    const sesion = await getSesionLeadCenter();
    if (!sesion.autenticado) {
      return NextResponse.json({ ok: false, error: 'no_autenticado' }, { status: 401 });
    }
    const supabase = await getServerSupabase();

    const etiqueta = decision === 'registrar' ? 'aceptó' : 'ignoró';
    const contenido =
      `[Copiloto] El asesor ${etiqueta} la sugerencia` +
      (tituloSugerencia ? ` "${tituloSugerencia}"` : '') +
      (accion ? ` (acción: ${accion})` : '') +
      '.';

    // RLS lc_notas_insert autoriza sólo si puede_ver_oportunidad(oportunidad_id).
    const { error } = await supabase.from('notas_crm').insert({
      oportunidad_id: id,
      persona_id: personaId || null,
      autor_id: sesion.usuarioInternoId,
      contenido,
      es_privada: true
    });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
