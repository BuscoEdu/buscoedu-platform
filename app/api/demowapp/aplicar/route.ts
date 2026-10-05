import { conFunnel, leerJson } from '@/src/lib/demowapp/funnel-http';
import { iniciarEnHilo } from '@/src/lib/demowapp/funnel-aplicar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BA-031 · POST /api/demowapp/aplicar
 * accion=iniciar abre Aplicar. accion=mi_lista solo registra Mi lista.
 * En los dos casos leadCreado queda en false.
 */
export async function POST(req: Request) {
  return conFunnel(async (db) => {
    const body = await leerJson(req);
    return iniciarEnHilo(db, {
      accion: body.accion,
      ofertaId: body.ofertaId,
      claveIdempotencia: body.claveIdempotencia,
      oportunidadId: body.oportunidadId,
      nombreCompleto: body.nombreCompleto,
      celular: body.celular,
      correo: body.correo,
      pais: body.pais,
      visitanteId: body.visitanteId,
      ip: ipDe(req)
    });
  });
}

function ipDe(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}
