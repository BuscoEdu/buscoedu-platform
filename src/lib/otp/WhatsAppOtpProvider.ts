import type {
  OtpProvider,
  OtpRequestInput,
  OtpRequestResult,
  OtpVerifyInput,
  OtpVerifyResult
} from './OtpProvider';

/**
 * STUB del proveedor OTP vía WhatsApp Cloud API.
 *
 * NO está conectado en esta fase. Ver docs/leadcenter/MIGRATION_TO_REAL_OTP.md.
 * Reutilizará la tabla `desafios_otp` sin cambios estructurales. Nunca devolverá
 * `codigoDemo`.
 */
export class WhatsAppOtpProvider implements OtpProvider {
  readonly nombre = 'whatsapp';
  readonly esSimulado = false;

  async requestCode(_input: OtpRequestInput): Promise<OtpRequestResult> {
    return {
      ok: false,
      error: 'no_implementado',
      mensaje: 'Proveedor WhatsApp no implementado en esta fase.'
    };
  }

  async verifyCode(_input: OtpVerifyInput): Promise<OtpVerifyResult> {
    return {
      ok: false,
      error: 'no_implementado',
      mensaje: 'Proveedor WhatsApp no implementado en esta fase.'
    };
  }
}
