import { NextResponse } from 'next/server';
import { getCifrasCatalogo } from '@/src/lib/cifras-catalogo';

export const runtime = 'nodejs';

/** El Home revalida las cifras cada hora. No hay datos de sesión. */
export const revalidate = 3600;

/** 200 con `{ programas, ciudades }`, o `null` si el conteo es 0 o falla. */
export async function GET() {
  const cifras = await getCifrasCatalogo();
  return NextResponse.json(cifras, {
    status: 200,
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=3600'
    }
  });
}
