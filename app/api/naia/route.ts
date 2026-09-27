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
 *
 * BA-008: rate limit in-memory por IP + validación server-side de
 * contexto_ofertas.ofertas_relevantes (activo+publicado+validado+vigente).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CODIGO_CANAL = 'web';

/** Ventana y tope del rate limit simple in-memory (BA-008). */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

type RateBucket = { count: number; resetAt: number };
const rateLimitBuckets = new Map<string, RateBucket>();

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

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** true = permitido; false = excedió el cupo. */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    rateLimitBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    // Limpieza oportunista para no crecer sin límite en procesos longevos.
    if (rateLimitBuckets.size > 5000) {
      for (const [key, value] of rateLimitBuckets) {
        if (now >= value.resetAt) rateLimitBuckets.delete(key);
      }
    }
    return true;
  }
  if (bucket.count >= RATE_LIMIT_MAX) return false;
  bucket.count += 1;
  return true;
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

/**
 * BA-008: valida IDs de ofertas_relevantes contra catálogo vigente.
 * Descarta inválidas; no inventa fichas. Ante error de consulta → lista vacía
 * (fail-closed respecto a datos no verificados).
 */
async function filtrarOfertasRelevantesValidas(
  ofertas: Array<Record<string, unknown>> | undefined
): Promise<Array<Record<string, unknown>> | undefined> {
  if (!ofertas) return undefined;
  if (ofertas.length === 0) return [];

  const ids = [
    ...new Set(
      ofertas
        .map((o) => (typeof o.id === 'string' ? o.id.trim() : ''))
        .filter((id) => id.length > 0)
    )
  ];

  if (ids.length === 0) return [];

  const hoy = new Date().toISOString().slice(0, 10);
  const { data, error } = await getServiceRoleClient()
    .from('ofertas_academicas')
    .select('id')
    .in('id', ids)
    .eq('activo', true)
    .eq('estado_publicacion', 'publicado')
    .eq('estado_validacion', 'validado')
    .lte('vigente_desde', hoy)
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${hoy}`);

  if (error) {
    console.error('[api/naia] Error validando ofertas_relevantes:', error);
    return [];
  }

  const validIds = new Set((data || []).map((row: { id: string }) => row.id));
  return ofertas.filter((o) => typeof o.id === 'string' && validIds.has(o.id));
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      {
        ok: false,
        code: 'rate_limited',
        message: 'Demasiadas solicitudes. Intenta de nuevo en un minuto.'
      },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'Cache-Control': 'no-store'
        }
      }
    );
  }

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
    if (contextoOfertas) {
      contextoOfertas = {
        ...contextoOfertas,
        ofertas_relevantes: await filtrarOfertasRelevantesValidas(
          contextoOfertas.ofertas_relevantes
        )
      };
    }

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
