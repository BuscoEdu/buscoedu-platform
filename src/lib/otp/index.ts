import type { OtpProvider } from './OtpProvider';
import { SimulatedOtpProvider } from './SimulatedOtpProvider';
import { TwilioOtpProvider } from './TwilioOtpProvider';
import { WhatsAppOtpProvider } from './WhatsAppOtpProvider';

export * from './OtpProvider';

/**
 * Factory del proveedor OTP. Selección por variable de entorno OTP_PROVIDER.
 * Por defecto 'simulated'. Cambiar de proveedor NO requiere tocar el resto del
 * código: solo la variable de entorno y (para reales) sus credenciales.
 */
export function getOtpProvider(): OtpProvider {
  const proveedor = (process.env.OTP_PROVIDER || 'simulated').toLowerCase();
  switch (proveedor) {
    case 'twilio':
      return new TwilioOtpProvider();
    case 'whatsapp':
      return new WhatsAppOtpProvider();
    case 'simulated':
    default:
      return new SimulatedOtpProvider();
  }
}
