import { conFunnel, leerJson } from '@/src/lib/demowapp/funnel-http';
import { presentarConsentimiento, resolverConsentimientoEnHilo } from '@/src/lib/demowapp/funnel-aplicar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BA-031 · GET presenta el texto (otorgado en false).
 * POST decision=aceptar|rechazar|abandonar.
 * Solo aceptar, y solo si las reglas pasan, crea la oportunidad.
 */
export async function GET(req: Request, { params }: { params: Promise<{ intencionId: string }> }) {
  const { intencionId } = await params;
  const oportunidadId = new URL(req.url).searchParams.get('oportunidadId');
  return conFunnel((db) => presentarConsentimiento(db, intencionId, oportunidadId));
}

export async function POST(req: Request, { params }: { params: Promise<{ intencionId: string }> }) {
  const { intencionId } = await params;
  return conFunnel(async (db) => {
    const body = await leerJson(req);
    return resolverConsentimientoEnHilo(db, intencionId, {
      oportunidadId: body.oportunidadId,
      decision: body.decision,
      consentimientos: body.consentimientos,
      ip: ipDe(req)
    });
  });
}

function ipDe(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}
