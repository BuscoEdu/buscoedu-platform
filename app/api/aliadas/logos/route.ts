import { NextResponse } from 'next/server';
import { getLogosAliadas } from '@/src/lib/logos-aliadas';

export const runtime = 'nodejs';

/** La franja de logos se revalida cada hora. Respuesta pública, sin sesión. */
export const revalidate = 3600;

/** 200 con `[{ url, alt }]`, o `[]` si no hay logos o la lectura falla. */
export async function GET() {
  const logos = await getLogosAliadas();
  return NextResponse.json(logos, {
    status: 200,
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=3600'
    }
  });
}
