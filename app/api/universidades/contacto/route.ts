import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/src/lib/supabase-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMPOS_REQUERIDOS = [
  'nombre_apellidos',
  'cargo',
  'universidad',
  'correo_institucional',
  'pais_mercado',
  'telefono',
  'programas_prioritarios',
  'modalidad_potenciar'
] as const;

function textoSeguro(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'json_invalido' }, { status: 400 });
  }

  // Validación mínima de los campos críticos definidos para alianzas institucionales.
  for (const campo of CAMPOS_REQUERIDOS) {
    if (!textoSeguro(body[campo])) {
      return NextResponse.json({ ok: false, error: `${campo}_requerido` }, { status: 400 });
    }
  }

  try {
    const db = getServiceRoleClient();

    const payload = {
      nombre_apellidos: textoSeguro(body.nombre_apellidos),
      cargo: textoSeguro(body.cargo),
      universidad: textoSeguro(body.universidad),
      correo_institucional: textoSeguro(body.correo_institucional),
      pais_mercado: textoSeguro(body.pais_mercado),
      telefono: textoSeguro(body.telefono) || null,
      programas_prioritarios: textoSeguro(body.programas_prioritarios) || null,
      modalidad_potenciar: textoSeguro(body.modalidad_potenciar) || null,
      matriculas_objetivo: textoSeguro(body.matriculas_objetivo) || null,
      convocatoria_proxima: textoSeguro(body.convocatoria_proxima) || null,
      necesidad_principal: textoSeguro(body.necesidad_principal) || null,
      interes_descuentos: Boolean(body.interes_descuentos),
      comentarios: textoSeguro(body.comentarios) || null
    };

    const { error } = await db.from('contactos_universidades').insert(payload);

    if (error) {
      return NextResponse.json({ ok: false, error: `insert_error: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'error_desconocido'
      },
      { status: 500 }
    );
  }
}
