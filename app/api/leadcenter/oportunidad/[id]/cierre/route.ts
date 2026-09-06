import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabase } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';

// Endpoint único de cierre/reapertura: la validación real vive en RPC para
// que ningún cliente pueda saltarse requisitos ni auditoría.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getSesionLeadCenter();
  if (!sesion.autenticado || (!sesion.esAsesor && !sesion.esSuper)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 }); }
  const supabase = await getServerSupabase();
  const accion = String(body?.accion || 'cerrar');
  const rpc = accion === 'reabrir' ? 'fn_reabrir_oportunidad' : 'fn_cerrar_oportunidad';
  const args = accion === 'reabrir'
    ? { p_oportunidad_id: id, p_etapa_nueva: body.etapaNueva, p_subestado_nuevo: body.subestadoNuevo || null, p_motivo: body.motivo }
    : { p_oportunidad_id: id, p_tipo_cierre: body.tipoCierre, p_causa_codigo: body.causaCodigo || null, p_comentario: body.comentario || null, p_requisitos: body.requisitos || {}, p_evidencias: body.evidencias || [], p_canal: body.canal || 'leadcenter' };
  const { data, error } = await supabase.rpc(rpc, args);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: data?.ok ? 200 : 400 });
}
