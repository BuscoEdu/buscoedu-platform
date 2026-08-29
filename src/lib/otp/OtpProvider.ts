/**
 * Contrato del proveedor de OTP (One-Time Password).
 *
 * El Lead Center usa OTP para verificar la titularidad del celular. El
 * proveedor es INTERCAMBIABLE: en esta fase se usa `SimulatedOtpProvider`
 * (no envía SMS/WhatsApp reales), y en el futuro se conectará Twilio o la
 * API de WhatsApp implementando esta misma interfaz, SIN cambiar la tabla
 * `desafios_otp` ni el resto del flujo.
 *
 * Reglas de seguridad implementadas por el proveedor simulado:
 *  - Código de 6 dígitos.
 *  - Se persiste SOLO el hash bcrypt (nunca el código en claro).
 *  - Caducidad (por defecto 5 minutos).
 *  - Máximo de intentos (por defecto 5).
 *  - Rate limiting por celular + IP.
 */

export type OtpProposito = 'registro' | 'login' | 'reverificacion';

export interface OtpRequestInput {
  celularE164: string;
  proposito: OtpProposito;
  ip?: string | null;
  visitanteId?: string | null;
  personaId?: string | null;
}

export interface OtpRequestResult {
  ok: boolean;
  desafioId?: string;
  expiraEn?: string; // ISO
  /**
   * SOLO presente en el proveedor simulado y SOLO para entornos de demo.
   * NUNCA se retorna en un proveedor real. La UI lo muestra bajo un aviso
   * explícito de "código de demostración".
   */
  codigoDemo?: string;
  /** Segundos que faltan para poder reenviar (rate limit). */
  reintentarEnSegundos?: number;
  error?: string;
  mensaje?: string;
}

export interface OtpVerifyInput {
  celularE164: string;
  proposito: OtpProposito;
  codigo: string;
  ip?: string | null;
}

export interface OtpVerifyResult {
  ok: boolean;
  desafioId?: string;
  personaId?: string | null;
  visitanteId?: string | null;
  error?: string;
  mensaje?: string;
  intentosRestantes?: number;
}

export interface OtpProvider {
  readonly nombre: string; // 'simulated' | 'twilio' | 'whatsapp'
  readonly esSimulado: boolean;
  requestCode(input: OtpRequestInput): Promise<OtpRequestResult>;
  verifyCode(input: OtpVerifyInput): Promise<OtpVerifyResult>;
}
