import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/src/lib/supabase-server';
import { getSesionLeadCenter } from '@/src/lib/leadcenter/session';
import { crearSesionQa, normalizarEtiquetaQa, permitirAltaQa } from '@/src/lib/demowapp/sesion-qa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/demowapp/sesiones/qa
 * Solo super admin, el mismo guard que el resto de /api/demowapp privado.
 * Abre persona + oportunidad de prueba. No crea aplicación ni lead a la IES.
 */
export async function POST(req: Request) {
  const sesion = await getSesionLeadCenter();
  if (!sesion.autenticado || !sesion.esSuper) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, code: 'json_invalido', error: 'No pude leer el JSON.' }, { status: 400 });
  }
  const etiqueta = normalizarEtiquetaQa(
    body && typeof body === 'object' && !Array.isArray(body) ? (body as { etiqueta?: unknown }).etiqueta : null
  );
  if (!etiqueta) {
    return NextResponse.json(
      { ok: false, code: 'etiqueta_requerida', error: 'La etiqueta tiene que tener entre 2 y 80 caracteres.' },
      { status: 400 }
    );
  }

  const operador = sesion.usuarioInternoId || sesion.authUserId || 'super';
  if (!permitirAltaQa(operador)) {
    return NextResponse.json(
      { ok: false, code: 'rate_limit', error: 'Demasiadas sesiones QA en un minuto.' },
      { status: 429 }
    );
  }

  try {
    const alta = await crearSesionQa(getServiceRoleClient(), etiqueta);
    return NextResponse.json({ ok: true, ...alta }, { status: 201 });
  } catch (error) {
    const codigo = (error as { codigo?: string }).codigo;
    if (codigo === 'telefono_qa_agotado' || codigo === 'etapa_inicial_inexistente') {
      return NextResponse.json(
        { ok: false, code: codigo, error: error instanceof Error ? error.message : codigo },
        { status: codigo === 'telefono_qa_agotado' ? 503 : 422 }
      );
    }
    console.error('[demowapp] sesion_qa', {
      code: (error as { code?: string }).code || null,
      message: error instanceof Error ? error.message : 'error_desconocido'
    });
    return NextResponse.json({ ok: false, code: 'server_error', error: 'No pude abrir la sesión QA.' }, { status: 500 });
  }
}
