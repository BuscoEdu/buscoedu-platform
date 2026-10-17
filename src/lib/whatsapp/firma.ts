/**
 * BA-032 · Seguridad del webhook de Meta.
 *
 * - GET: el verify token se compara en tiempo constante.
 * - POST: X-Hub-Signature-256 = 'sha256=' + HMAC-SHA256(body crudo, META_APP_SECRET),
 *   comparado con timingSafeEqual. Sin secreto o sin firma → inválido.
 */

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Bloque: igualdad en tiempo constante para cadenas de cualquier largo.
// Se hashean ambas con SHA-256 para que timingSafeEqual reciba buffers del mismo tamaño
// y no se filtre la longitud del secreto por tiempo de respuesta.
export function igualesTiempoConstante(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

/**
 * Bloque: verificación de suscripción (GET).
 * Devuelve el challenge solo si mode=subscribe y el token coincide.
 * Sin token configurado → null (la ruta responde 403).
 */
export function verificarSuscripcion(input: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  verifyTokenEsperado: string;
}): string | null {
  if (!input.verifyTokenEsperado) return null;
  if (input.mode !== 'subscribe') return null;
  if (typeof input.token !== 'string' || !input.token) return null;
  if (typeof input.challenge !== 'string' || !input.challenge) return null;
  if (!igualesTiempoConstante(input.token, input.verifyTokenEsperado)) return null;
  return input.challenge;
}

/** Bloque: firma esperada para un body crudo (se usa en tests y en la validación). */
export function calcularFirma(cuerpoCrudo: string | Buffer, secreto: string): string {
  return 'sha256=' + createHmac('sha256', secreto).update(cuerpoCrudo).digest('hex');
}

/**
 * Bloque: validación de X-Hub-Signature-256 (POST).
 * Fail-closed: sin secreto, sin cabecera o con formato raro → false.
 */
export function firmaMetaValida(
  cuerpoCrudo: string | Buffer,
  cabeceraFirma: string | null | undefined,
  secreto: string
): boolean {
  if (!secreto) return false;
  if (typeof cabeceraFirma !== 'string') return false;
  const recibida = cabeceraFirma.trim();
  if (!/^sha256=[0-9a-f]{64}$/i.test(recibida)) return false;
  const esperada = calcularFirma(cuerpoCrudo, secreto);
  const a = Buffer.from(recibida.toLowerCase(), 'utf8');
  const b = Buffer.from(esperada, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
