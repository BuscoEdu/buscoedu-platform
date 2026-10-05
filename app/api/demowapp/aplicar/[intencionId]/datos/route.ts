import { conFunnel, leerJson } from '@/src/lib/demowapp/funnel-http';
import { guardarDatosEnHilo } from '@/src/lib/demowapp/funnel-aplicar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BA-031 · POST /api/demowapp/aplicar/:id/datos
 * Persiste el contacto en la sesión demo. No crea lead.
 * Si nombre y celular quedan completos, la respuesta ya trae el consentimiento.
 */
export async function POST(req: Request, { params }: { params: Promise<{ intencionId: string }> }) {
  const { intencionId } = await params;
  return conFunnel(async (db) => {
    const body = await leerJson(req);
    return guardarDatosEnHilo(db, intencionId, {
      oportunidadId: body.oportunidadId,
      nombreCompleto: body.nombreCompleto,
      celular: body.celular,
      correo: body.correo,
      pais: body.pais
    });
  });
}
