import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { listarTiposConsentimientoActivos } from '@/src/lib/leadcenter/tipos-consentimiento';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/leadcenter/consentimientos
 * Devuelve los tipos de consentimiento activos (código, nombre, texto), para
 * mostrarlos en el flujo de aplicación SIN casillas preseleccionadas.
 */
export async function GET() {
  try {
    const db = getServiceRoleClient();
    const items = await listarTiposConsentimientoActivos(db);
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
