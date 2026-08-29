import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { normalizarE164 } from '@/src/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function obtenerIp(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip');
}

/**
 * POST /api/leadcenter/convertir
 * Convierte una aplicación del explorador en persona + oportunidad + propuesta,
 * de forma transaccional e idempotente, vía el RPC fn_convertir_aplicacion.
 *
 * Requisitos de seguridad:
 *  - El celular debe haber sido verificado por OTP previamente (se valida que
 *    exista un desafío 'verificado' reciente para ese celular).
 *  - Nunca se transfiere a universidad sin consentimiento de transferencia.
 *
 * Body: {
 *   celular, pais, ofertaId, nombreCompleto, correo?, visitanteId?,
 *   claveIdempotencia, consentimientos: [{codigo, otorgado, versionTexto?}]
 * }
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  const {
    celular,
    pais,
    ofertaId,
    nombreCompleto,
    correo,
    visitanteId,
    claveIdempotencia,
    consentimientos
  } = body || {};

  const norm = normalizarE164(String(celular || ''), pais || '57');
  if (!norm.valido) {
    return NextResponse.json(
      { ok: false, error: 'celular_invalido', mensaje: norm.motivo },
      { status: 400 }
    );
  }
  if (!ofertaId) {
    return NextResponse.json({ ok: false, error: 'oferta_requerida' }, { status: 400 });
  }
  if (!claveIdempotencia || String(claveIdempotencia).length < 8) {
    return NextResponse.json({ ok: false, error: 'clave_idempotencia_requerida' }, { status: 400 });
  }

  try {
    const db = getServiceRoleClient();

    // --- Verificación previa de titularidad del celular (OTP) ---
    const hace15min = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: reto } = await db
      .from('desafios_otp')
      .select('id, verificado_en')
      .eq('celular_e164', norm.e164)
      .eq('estado', 'verificado')
      .gte('verificado_en', hace15min)
      .order('verificado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!reto) {
      return NextResponse.json(
        {
          ok: false,
          error: 'celular_no_verificado',
          mensaje: 'Debes verificar tu celular antes de continuar.'
        },
        { status: 403 }
      );
    }

    // Partir el nombre en nombres/apellidos de forma simple.
    const partes = String(nombreCompleto || '').trim().split(/\s+/);
    const nombres = partes.slice(0, Math.max(1, partes.length - 1)).join(' ') || partes[0] || '';
    const apellidos = partes.length > 1 ? partes.slice(-1).join(' ') : '';

    const payload = {
      clave_idempotencia: claveIdempotencia,
      celular_e164: norm.e164,
      pais_celular: norm.pais,
      nombres,
      apellidos,
      nombre_completo: nombreCompleto,
      correo: correo || null,
      visitante_id: visitanteId || null,
      oferta_id: ofertaId,
      ip_origen: obtenerIp(req),
      consentimientos: Array.isArray(consentimientos)
        ? consentimientos.map((c: any) => ({
            codigo: c.codigo,
            otorgado: !!c.otorgado,
            version_texto: c.versionTexto || 'v1'
          }))
        : []
    };

    const { data, error } = await db.rpc('fn_convertir_aplicacion', { p_payload: payload });

    if (error) {
      return NextResponse.json(
        { ok: false, error: 'rpc_error', mensaje: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data, { status: (data as any)?.ok ? 200 : 400 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'server_error', mensaje: e?.message },
      { status: 500 }
    );
  }
}
