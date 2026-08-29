import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/src/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/leadcenter/consentimientos
 * Devuelve los tipos de consentimiento activos (código, nombre, texto), para
 * mostrarlos en el flujo de aplicación SIN casillas preseleccionadas.
 */
export async function GET() {
  try {
    const db = getServiceRoleClient();
    const { data, error } = await db
      .from('tipos_consentimiento')
      .select('id, codigo, nombre, descripcion, version, texto_completo, es_obligatorio')
      .eq('activo', true);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Orden estable y solo los relevantes para el flujo de aplicación.
    const orden = ['tratamiento_datos', 'contacto', 'contacto_whatsapp', 'transferencia_universidad'];
    const items = (data || []).sort(
      (a: any, b: any) => orden.indexOf(a.codigo) - orden.indexOf(b.codigo)
    );

    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
