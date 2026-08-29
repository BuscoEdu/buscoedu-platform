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
 * POST /api/otp/verify
 * Body: { celular, codigo, proposito?, pais? }
 * Verifica el código. En éxito, devuelve desafioId/persona/visitante para que
 * el flujo de conversión pueda usarlo como prueba de titularidad del celular.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  const { celular, codigo, proposito = 'registro', pais } = body || {};

  if (!codigo || String(codigo).replace(/\D/g, '').length !== 6) {
    return NextResponse.json(
      { ok: false, error: 'codigo_invalido', mensaje: 'El código debe tener 6 dígitos.' },
      { status: 400 }
    );
  }

  const norm = normalizarE164(String(celular || ''), pais || '57');
  if (!norm.valido) {
    return NextResponse.json(
      { ok: false, error: 'celular_invalido', mensaje: norm.motivo || 'Celular inválido' },
      { status: 400 }
    );
  }

  try {
    const provider = getOtpProvider();
    const result = await provider.verifyCode({
      celularE164: norm.e164,
      proposito,
      codigo: String(codigo).replace(/\D/g, ''),
      ip: obtenerIp(req)
    });

    return NextResponse.json(
      {
        ok: result.ok,
        celular: norm.e164,
        pais: norm.pais,
        desafioId: result.desafioId,
        personaId: result.personaId,
        visitanteId: result.visitanteId,
        intentosRestantes: result.intentosRestantes,
        error: result.error,
        mensaje: result.mensaje
      },
      { status: result.ok ? 200 : 400 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'server_error', mensaje: e?.message || 'Error del servidor' },
      { status: 500 }
    );
  }
}
