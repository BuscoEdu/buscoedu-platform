import { NextRequest, NextResponse } from 'next/server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';
import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { processDuePushes } from '@/src/lib/demowapp/push-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function ejecutar() {
  const sesion = await getSesionLeadCenter();
  if (!sesion.autenticado || !sesion.esSuper) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  try {
    const db = getServiceRoleClient();
    const resultado = await processDuePushes(db, 100);
    return NextResponse.json(resultado);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}

export async function POST(_req: NextRequest) {
  return ejecutar();
}
