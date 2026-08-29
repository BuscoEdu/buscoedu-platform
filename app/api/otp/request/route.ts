import { NextRequest, NextResponse } from 'next/server';
import { getOtpProvider } from '@/src/lib/otp';
import { normalizarE164 } from '@/src/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function obtenerIp(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}

/**
 * POST /api/otp/request
 * Body: { celular, proposito?, visitanteId?, personaId?, pais? }
 * Genera y "envía" (simulado) un código OTP.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  const { celular, proposito = 'registro', visitanteId, personaId, pais } = body || {};

  const norm = normalizarE164(String(celular || ''), pais || '57');
  if (!norm.valido) {
    return NextResponse.json(
      { ok: false, error: 'celular_invalido', mensaje: norm.motivo || 'Celular inválido' },
      { status: 400 }
    );
  }

  if (!['registro', 'login', 'reverificacion'].includes(proposito)) {
    return NextResponse.json({ ok: false, error: 'proposito_invalido' }, { status: 400 });
  }

  try {
    const provider = getOtpProvider();
    const result = await provider.requestCode({
      celularE164: norm.e164,
      proposito,
      ip: obtenerIp(req),
      visitanteId: visitanteId ?? null,
      personaId: personaId ?? null
    });

    // El código de demostración solo se expone si el proveedor es simulado.
    const payload: Record<string, unknown> = {
      ok: result.ok,
      celular: norm.e164,
      pais: norm.pais,
      proveedorSimulado: provider.esSimulado,
      expiraEn: result.expiraEn,
      reintentarEnSegundos: result.reintentarEnSegundos,
      error: result.error,
      mensaje: result.mensaje
    };
    if (provider.esSimulado && result.codigoDemo) {
      payload.codigoDemo = result.codigoDemo;
    }

    return NextResponse.json(payload, { status: result.ok ? 200 : 429 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'server_error', mensaje: e?.message || 'Error del servidor' },
      { status: 500 }
    );
  }
}
