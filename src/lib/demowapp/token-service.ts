import crypto from 'crypto';

const TOKEN_TTL_SECONDS = 20 * 60;

interface DemoWappTokenPayload {
  personaId: string;
  oportunidadId: string;
  aplicacionId: string;
  visitanteId?: string | null;
  celularVerificado?: string | null;
  canal: 'demo_wapp';
  exp: number;
  iat: number;
  nonce: string;
}

function getTokenSecret(): string {
  const secret = process.env.DEMOWAPP_TOKEN_SECRET;
  if (!secret) {
    throw new Error('Falta DEMOWAPP_TOKEN_SECRET para los tokens temporales de Demo WApp.');
  }
  return secret;
}

function toBase64Url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(unsigned: string): string {
  const hmac = crypto.createHmac('sha256', getTokenSecret());
  hmac.update(unsigned);
  return hmac.digest('base64url');
}

export function createDemoWappToken(input: Omit<DemoWappTokenPayload, 'exp' | 'iat' | 'nonce' | 'canal'>) {
  const now = Math.floor(Date.now() / 1000);
  const payload: DemoWappTokenPayload = {
    ...input,
    canal: 'demo_wapp',
    iat: now,
    exp: now + TOKEN_TTL_SECONDS,
    nonce: crypto.randomUUID()
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return { token: `${encodedPayload}.${signature}`, nonce: payload.nonce };
}

export function verifyDemoWappToken(token: string): { ok: true; payload: DemoWappTokenPayload } | { ok: false; error: string } {
  if (!token || !token.includes('.')) {
    return { ok: false, error: 'token_invalido' };
  }

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    return { ok: false, error: 'token_invalido' };
  }

  const expected = sign(encodedPayload);
  const sigBuffer = Buffer.from(signature);
  const expBuffer = Buffer.from(expected);
  if (sigBuffer.length !== expBuffer.length || !crypto.timingSafeEqual(sigBuffer, expBuffer)) {
    return { ok: false, error: 'firma_invalida' };
  }

  try {
    const payload = JSON.parse(fromBase64Url(encodedPayload)) as DemoWappTokenPayload;
    const now = Math.floor(Date.now() / 1000);

    if (payload.canal !== 'demo_wapp') {
      return { ok: false, error: 'canal_invalido' };
    }

    if (!payload.oportunidadId || !payload.personaId || !payload.aplicacionId) {
      return { ok: false, error: 'payload_incompleto' };
    }

    if (payload.exp < now) {
      return { ok: false, error: 'token_expirado' };
    }

    return { ok: true, payload };
  } catch {
    return { ok: false, error: 'payload_invalido' };
  }
}

export function getDemoWappTokenTtlSeconds() {
  return TOKEN_TTL_SECONDS;
}
