import { NextRequest, NextResponse } from 'next/server';
import { agenteExecutor } from '@/lib/agentes';
import { getServiceRoleClient } from '@/src/lib/supabase-server';

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

const CODIGO_CANAL = 'web';

interface NaiaPayload {
  mensaje: string;
  filtros: Record<string, string | null>;
  pregunta_seguimiento: string | null;
  opciones_sugeridas?: string[];
  conversationId?: string;
}

interface ContextoOfertasPayload {
  filtros_actuales?: Record<string, string>;
  total_resultados?: number;
  ofertas_relevantes?: Array<Record<string, unknown>>;
}

function fallback(conversationId?: string, mensaje?: string): NaiaPayload {
  return {
    mensaje:
      mensaje ||
      'Gracias por tu mensaje. Tu búsqueda sigue activa. Si quieres, indícame área, modalidad, nivel, ciudad o tipo de beneficio y ajusto los filtros.',
    filtros: {},
    pregunta_seguimiento:
      '¿Qué criterio quieres ajustar primero: área, modalidad, ciudad, nivel o beneficio?',
    // Mantiene consistencia de copy con el botón móvil de resultados.
    opciones_sugeridas: ['Quiero ajustar modalidad', 'Quiero ajustar ciudad', 'Explorar resultados'],
    conversationId
  };
}

async function resolverAgenteDelCanal(codigoCanal: string): Promise<string> {
  const { data: canal, error } = await getServiceRoleClient()
    .from('canales_ia')
    .select('codigo, agente_predeterminado_id, agentes_ia:agente_predeterminado_id(codigo, activo, estado)')
    .eq('codigo', codigoCanal)
    .eq('activo', true)
    .maybeSingle();

  const agente = (canal?.agentes_ia as any);
  if (error || !canal?.agente_predeterminado_id || !agente?.codigo || agente.activo === false || agente.estado !== 'activo') {
    throw new Error(`El canal ${codigoCanal} no tiene un agente activo asignado.`);
  }
  return agente.codigo;
}

export async function POST(req: NextRequest) {
  let mensaje = '';
  let conversationId: string | undefined;
  let contextoOfertas: ContextoOfertasPayload | undefined;

  try {
    const body = await req.json();
    mensaje = (body?.mensaje ?? '').toString();
    conversationId = body?.conversationId || undefined;

    // Captura contexto visible en frontend para responder preguntas de detalle.
    if (body?.contexto_ofertas && typeof body.contexto_ofertas === 'object') {
      contextoOfertas = {
        filtros_actuales:
          body.contexto_ofertas.filtros_actuales && typeof body.contexto_ofertas.filtros_actuales === 'object'
            ? body.contexto_ofertas.filtros_actuales
            : undefined,
        total_resultados:
          typeof body.contexto_ofertas.total_resultados === 'number'
            ? body.contexto_ofertas.total_resultados
            : undefined,
        ofertas_relevantes: Array.isArray(body.contexto_ofertas.ofertas_relevantes)
          ? body.contexto_ofertas.ofertas_relevantes
          : undefined
      };
    }
  } catch {
    return NextResponse.json(fallback(), { status: 200 });
  }

  if (!mensaje.trim()) {
    return NextResponse.json(fallback(conversationId), { status: 200 });
  }

  try {
    const codigoAgente = await resolverAgenteDelCanal(CODIGO_CANAL);
    const salida = await agenteExecutor.ejecutar({
      codigo_agente: codigoAgente,
      codigo_canal: CODIGO_CANAL,
      mensaje_usuario: mensaje,
      conversation_id: conversationId,
      contexto_ofertas: contextoOfertas
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
