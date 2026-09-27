import { NextResponse } from 'next/server';

// Este endpoint se mantiene como una respuesta de compatibilidad para clientes
// que todavía intenten consultar la antigua API pública de contexto.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// La configuración pública de NaIA ya no se sirve desde contexto_naia: Centro IA
// (agentes_ia, versiones y despliegues) es la única fuente canónica.
export async function GET() {
  // Se informa explícitamente que la ruta quedó retirada para evitar exponer
  // contexto legado o inducir a nuevos consumidores a usarlo como runtime.
  return NextResponse.json(
    {
      ok: false,
      code: 'contexto_naia_legacy',
      message:
        'La API pública de contexto NaIA fue retirada. La fuente canónica de NaIA es Centro IA (agentes_ia, versiones y despliegues).',
    },
    {
      status: 410,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
