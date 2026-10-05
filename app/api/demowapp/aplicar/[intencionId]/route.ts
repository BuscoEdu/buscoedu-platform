import { conFunnel } from '@/src/lib/demowapp/funnel-http';
import { obtenerSesionDemo } from '@/src/lib/demowapp/funnel-aplicar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** BA-031 · Estado de la sesión demo del funnel, con las burbujas ya guardadas. */
export async function GET(req: Request, { params }: { params: Promise<{ intencionId: string }> }) {
  const { intencionId } = await params;
  const oportunidadId = new URL(req.url).searchParams.get('oportunidadId');
  return conFunnel((db) => obtenerSesionDemo(db, intencionId, oportunidadId));
}
