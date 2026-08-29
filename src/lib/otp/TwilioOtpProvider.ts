import type {
  OtpProvider,
  OtpRequestInput,
  OtpRequestResult,
  OtpVerifyInput,
  OtpVerifyResult
} from './OtpProvider';

/**
 * STUB del proveedor OTP vía Twilio (SMS / Verify API).
 *
 * NO está conectado en esta fase. Se deja el esqueleto para que la migración a
 * un proveedor real (ver docs/leadcenter/MIGRATION_TO_REAL_OTP.md) consista en:
 *   1. Definir OTP_PROVIDER=twilio y las credenciales TWILIO_* en el entorno.
 *   2. Implementar requestCode/verifyCode usando la Verify API (o guardando el
 *      hash en `desafios_otp` y enviando el SMS real).
 *   3. NO devolver nunca `codigoDemo`.
 *
 * La tabla `desafios_otp` y el resto del flujo permanecen sin cambios.
 */
export class TwilioOtpProvider implements OtpProvider {
  readonly nombre = 'twilio';
  readonly esSimulado = false;

  async requestCode(_input: OtpRequestInput): Promise<OtpRequestResult> {
    return {
      ok: false,
      error: 'no_implementado',
      mensaje: 'Proveedor Twilio no implementado en esta fase.'
    };
  }

  async verifyCode(_input: OtpVerifyInput): Promise<OtpVerifyResult> {
    return {
      ok: false,
      error: 'no_implementado',
      mensaje: 'Proveedor Twilio no implementado en esta fase.'
    };
  }
}
