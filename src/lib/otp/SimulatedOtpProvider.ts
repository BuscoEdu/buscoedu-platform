import bcrypt from 'bcryptjs';
import { getServiceRoleClient } from '../supabase-server';
import type {
  OtpProvider,
  OtpRequestInput,
  OtpRequestResult,
  OtpVerifyInput,
  OtpVerifyResult
} from './OtpProvider';

const CADUCIDAD_MINUTOS = 5;
const MAX_INTENTOS = 5;
const VENTANA_RATE_LIMIT_MIN = 1; // no más de N solicitudes por ventana
const MAX_SOLICITUDES_POR_VENTANA = 1; // 1 código por minuto por celular
const MAX_SOLICITUDES_HORA = 5; // tope por celular/hora

function generarCodigo(): string {
  // 6 dígitos, con ceros a la izquierda.
  return Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0');
}

/**
 * Proveedor OTP SIMULADO.
 *
 * - Genera un código de 6 dígitos, guarda solo su hash bcrypt en `desafios_otp`.
 * - NO envía SMS/WhatsApp reales. En su lugar, registra la intención de envío
 *   en `comunicaciones_transaccionales` con estado 'pendiente' (canal simulado).
 * - Devuelve el código en `codigoDemo` SOLO para que la UI de demo lo muestre
 *   bajo un aviso explícito. Un proveedor real jamás devolvería esto.
 */
export class SimulatedOtpProvider implements OtpProvider {
  readonly nombre = 'simulated';
  readonly esSimulado = true;

  async requestCode(input: OtpRequestInput): Promise<OtpRequestResult> {
    const { celularE164, proposito, ip, visitanteId, personaId } = input;
    const db = getServiceRoleClient();

    // --- Rate limiting por celular ---
    const desdeVentana = new Date(
      Date.now() - VENTANA_RATE_LIMIT_MIN * 60_000
    ).toISOString();
    const desdeHora = new Date(Date.now() - 60 * 60_000).toISOString();

    const { count: countVentana } = await db
      .from('desafios_otp')
      .select('id', { count: 'exact', head: true })
      .eq('celular_e164', celularE164)
      .gte('creado_en', desdeVentana);

    if ((countVentana ?? 0) >= MAX_SOLICITUDES_POR_VENTANA) {
      return {
        ok: false,
        error: 'rate_limited',
        reintentarEnSegundos: VENTANA_RATE_LIMIT_MIN * 60,
        mensaje: 'Espera un momento antes de solicitar otro código.'
      };
    }

    const { count: countHora } = await db
      .from('desafios_otp')
      .select('id', { count: 'exact', head: true })
      .eq('celular_e164', celularE164)
      .gte('creado_en', desdeHora);

    if ((countHora ?? 0) >= MAX_SOLICITUDES_HORA) {
      return {
        ok: false,
        error: 'rate_limited',
        reintentarEnSegundos: 3600,
        mensaje: 'Alcanzaste el máximo de solicitudes por hora. Intenta más tarde.'
      };
    }

    // Invalida retos pendientes previos del mismo celular/propósito.
    await db
      .from('desafios_otp')
      .update({ estado: 'invalidado', actualizado_en: new Date().toISOString() })
      .eq('celular_e164', celularE164)
      .eq('proposito', proposito)
      .eq('estado', 'pendiente');

    const codigo = generarCodigo();
    const codigoHash = await bcrypt.hash(codigo, 10);
    const expiraEn = new Date(Date.now() + CADUCIDAD_MINUTOS * 60_000).toISOString();

    const { data: desafio, error } = await db
      .from('desafios_otp')
      .insert({
        celular_e164: celularE164,
        proposito,
        codigo_hash: codigoHash,
        proveedor: this.nombre,
        estado: 'pendiente',
        intentos: 0,
        max_intentos: MAX_INTENTOS,
        ip_origen: ip ?? null,
        visitante_id: visitanteId ?? null,
        persona_id: personaId ?? null,
        expira_en: expiraEn
      })
      .select('id')
      .single();

    if (error || !desafio) {
      return {
        ok: false,
        error: 'db_error',
        mensaje: 'No se pudo generar el código. Intenta de nuevo.'
      };
    }

    // Registra la INTENCIÓN de envío (no se envía nada real en esta fase).
    try {
      await db.from('comunicaciones_transaccionales').insert({
        persona_id: personaId ?? null,
        canal: 'sms',
        tipo: 'otp_verificacion',
        estado: 'pendiente',
        asunto: 'Código de verificación BuscoEdu',
        contenido: `Tu código de verificación es (simulado). Propósito: ${proposito}.`,
        proveedor: 'simulated',
        metadata: { desafio_id: desafio.id, proposito }
      });
    } catch {
      // La columna/tabla puede variar; no bloquea el flujo de OTP.
    }

    return {
      ok: true,
      desafioId: desafio.id,
      expiraEn,
      codigoDemo: codigo // SOLO simulado
    };
  }

  async verifyCode(input: OtpVerifyInput): Promise<OtpVerifyResult> {
    const { celularE164, proposito, codigo } = input;
    const db = getServiceRoleClient();

    const { data: desafio } = await db
      .from('desafios_otp')
      .select('*')
      .eq('celular_e164', celularE164)
      .eq('proposito', proposito)
      .eq('estado', 'pendiente')
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!desafio) {
      return {
        ok: false,
        error: 'sin_desafio',
        mensaje: 'No hay un código activo. Solicita uno nuevo.'
      };
    }

    // Caducidad.
    if (new Date(desafio.expira_en).getTime() < Date.now()) {
      await db
        .from('desafios_otp')
        .update({ estado: 'vencido', actualizado_en: new Date().toISOString() })
        .eq('id', desafio.id);
      return {
        ok: false,
        error: 'vencido',
        mensaje: 'El código expiró. Solicita uno nuevo.'
      };
    }

    // Máximo de intentos.
    if (desafio.intentos >= desafio.max_intentos) {
      await db
        .from('desafios_otp')
        .update({ estado: 'invalidado', actualizado_en: new Date().toISOString() })
        .eq('id', desafio.id);
      return {
        ok: false,
        error: 'max_intentos',
        mensaje: 'Superaste el máximo de intentos. Solicita un nuevo código.'
      };
    }

    const coincide = await bcrypt.compare(codigo, desafio.codigo_hash);

    if (!coincide) {
      const nuevosIntentos = desafio.intentos + 1;
      const agotado = nuevosIntentos >= desafio.max_intentos;
      await db
        .from('desafios_otp')
        .update({
          intentos: nuevosIntentos,
          estado: agotado ? 'invalidado' : 'pendiente',
          actualizado_en: new Date().toISOString()
        })
        .eq('id', desafio.id);

      return {
        ok: false,
        error: 'codigo_incorrecto',
        intentosRestantes: Math.max(0, desafio.max_intentos - nuevosIntentos),
        mensaje: agotado
          ? 'Código incorrecto. Superaste los intentos; solicita uno nuevo.'
          : 'Código incorrecto. Inténtalo de nuevo.'
      };
    }

    // Éxito.
    await db
      .from('desafios_otp')
      .update({
        estado: 'verificado',
        verificado_en: new Date().toISOString(),
        actualizado_en: new Date().toISOString()
      })
      .eq('id', desafio.id);

    return {
      ok: true,
      desafioId: desafio.id,
      personaId: desafio.persona_id,
      visitanteId: desafio.visitante_id,
      mensaje: 'Celular verificado correctamente.'
    };
  }
}
