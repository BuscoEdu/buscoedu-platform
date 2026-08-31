import { NextRequest, NextResponse } from 'next/server';
import { protegerYObtenerServicio } from '@/lib/agentes/admin-crud';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNAS =
  'id, agente_id, version_agente_id, despliegue_id, canal_id, conversacion_id, mensaje_id, estado, duracion_ms, tokens_entrada, tokens_salida, respuesta, herramientas_ejecutadas, error, ejecutado_en, agentes_ia:agente_id(codigo, nombre), canales_ia:canal_id(codigo, nombre)';

/**
 * Historial de ejecuciones (solo lectura).
 * Filtros opcionales: agente_id, canal_id, estado, desde, hasta.
 */
export async function GET(req: NextRequest) {
  const guard = await protegerYObtenerServicio();
  if ('response' in guard) return guard.response;

  const sp = req.nextUrl.searchParams;
  const agenteId = sp.get('agente_id');
  const canalId = sp.get('canal_id');
  const estado = sp.get('estado');
  const desde = sp.get('desde');
  const hasta = sp.get('hasta');
  const limite = Math.min(Number(sp.get('limite') || 100), 500);

  let query = guard.service.from('ejecuciones_agente_ia').select(COLUMNAS);

  if (agenteId) query = query.eq('agente_id', agenteId);
  if (canalId) query = query.eq('canal_id', canalId);
  if (estado) query = query.eq('estado', estado);
  if (desde) query = query.gte('ejecutado_en', desde);
  if (hasta) query = query.lte('ejecutado_en', hasta);

  const { data, error } = await query.order('ejecutado_en', { ascending: false }).limit(limite);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data || [] });
}
