import { NextRequest, NextResponse } from 'next/server';
import { agenteExecutor } from '@/lib/agentes';

/**
 * API Route del servidor para NaIA.
 *
 * Migrada al Centro de Agentes IA: la lógica de construcción de prompt,
 * llamada al proveedor (Abacus.AI) y parseo de la respuesta vive ahora en
 * `lib/agentes` (AgenteExecutor). Este endpoint solo orquesta y conserva el
 * MISMO contrato externo de entrada/salida que la versión anterior.
 *
 * Recibe:  POST { mensaje: string, conversationId?: string }
 * Devuelve: { mensaje, filtros, pregunta_seguimiento, opciones_sugeridas, conversationId }
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CODIGO_AGENTE = 'naia_asesora_educativa';
const CODIGO_CANAL = 'web';

interface NaiaPayload {
  mensaje: string;
  filtros: Record<string, string | null>;
  pregunta_seguimiento: string | null;
  opciones_sugeridas?: string[];
  conversationId?: string;
}

function fallback(conversationId?: string, mensaje?: string): NaiaPayload {
  return {
    mensaje:
      mensaje ||
      'Gracias por tu mensaje. Tu búsqueda sigue activa. Si quieres, indícame área, modalidad, nivel, ciudad o tipo de beneficio y ajusto los filtros.',
    filtros: {},
    pregunta_seguimiento:
      '¿Qué criterio quieres ajustar primero: área, modalidad, ciudad, nivel o beneficio?',
    opciones_sugeridas: ['Quiero ajustar modalidad', 'Quiero ajustar ciudad', 'Explorar el filtro actual'],
    conversationId
  };
}

export async function POST(req: NextRequest) {
  let mensaje = '';
  let conversationId: string | undefined;

  try {
    const body = await req.json();
    mensaje = (body?.mensaje ?? '').toString();
    conversationId = body?.conversationId || undefined;
  } catch {
    return NextResponse.json(fallback(), { status: 200 });
  }

  if (!mensaje.trim()) {
    return NextResponse.json(fallback(conversationId), { status: 200 });
  }

  try {
    const salida = await agenteExecutor.ejecutar({
      codigo_agente: CODIGO_AGENTE,
      codigo_canal: CODIGO_CANAL,
      mensaje_usuario: mensaje,
      conversation_id: conversationId
    });

    const payload: NaiaPayload = {
      mensaje: salida.mensaje,
      filtros: salida.filtros,
      pregunta_seguimiento: salida.pregunta_seguimiento,
      opciones_sugeridas: salida.opciones_sugeridas,
      conversationId: salida.conversationId ?? conversationId
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    console.error('[api/naia] Error ejecutando el agente:', err);
    return NextResponse.json(fallback(conversationId), { status: 200 });
  }
}
