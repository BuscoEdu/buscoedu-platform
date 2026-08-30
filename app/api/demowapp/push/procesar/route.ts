import { NextRequest, NextResponse } from 'next/server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';
import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { processDuePushes } from '@/src/lib/demowapp/push-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function ejecutar(oportunidadId?: string) {
  const sesion = await getSesionLeadCenter();
  if (!sesion.autenticado || !sesion.esSuper) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  try {
    const db = getServiceRoleClient();
    const resultado = await processDuePushes(db, 100, oportunidadId ? { oportunidadId } : undefined);
    return NextResponse.json(resultado);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'server_error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let oportunidadId: string | undefined;
  try {
    const body = await req.json();
    if (body?.oportunidadId) {
      oportunidadId = String(body.oportunidadId);
      if (!UUID_RE.test(oportunidadId)) {
        return NextResponse.json({ ok: false, error: 'oportunidad_invalida' }, { status: 400 });
      }
    }
  } catch {
    // Un cuerpo vacío procesa globalmente, exclusivamente para super_admin.
  }
  return ejecutar(oportunidadId);
}
