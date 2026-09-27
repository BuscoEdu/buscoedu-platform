import { NextRequest, NextResponse } from 'next/server';
import {
  agenteExecutor,
  esErrorCanalFailClosed,
  estadoHttpErrorCanal,
  resolverAgenteDelCanal,
  resolverCodigoCanalExplicito,
  type CodigoCanalIa
} from '@/lib/agentes';
import { getServiceRoleClient } from '@/src/lib/supabase-server';

/**
 * API Route del servidor para NaIA.
 *
 * Migrada al Centro de Agentes IA: la lógica de construcción de prompt,
 * llamada al proveedor (Abacus.AI) y parseo de la respuesta vive ahora en
 * `lib/agentes` (AgenteExecutor). Este endpoint solo orquesta y conserva el
 * MISMO contrato externo de entrada/salida que la versión anterior.
 *
 * Recibe:  POST { mensaje, conversationId?, contexto_ofertas?, codigo_canal? }
 *   codigo_canal: 'web' | 'whatsapp'. Si se omite, queda 'web' (chat público).
 *   Un valor distinto no cae a web: responde canal_invalido (400).
 *   Canal inactivo o sin config activa: canal_no_configurado (422), sin fallback.
 * Devuelve: { mensaje, filtros, pregunta_seguimiento, opciones_sugeridas, conversationId }
 *
 * BA-008: rate limit in-memory por IP + validación server-side de
 * contexto_ofertas.ofertas_relevantes (activo+publicado+validado+vigente).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
      'Se me enredó la respuesta un momento. Cuéntame **qué te gustaría estudiar** y, si ya lo tienes, la **ciudad** o la **modalidad**.',
    filtros: {},
    pregunta_seguimiento: '¿Qué te gustaría estudiar?',
    // BA-024: sin grilla fija. El botón de explorar vive en la interfaz.
    opciones_sugeridas: [],
    conversationId
  };
}

/** BA-029: error de canal se devuelve tal cual. El resto conserva el fallback conversacional. */
function respuestaCanalFailClosed(err: unknown) {
  if (!esErrorCanalFailClosed(err)) return null;
  return NextResponse.json(
    { ok: false, code: err.codigo, message: err.message },
    {
      status: estadoHttpErrorCanal(err.codigo),
      headers: { 'Cache-Control': 'no-store' }
    }
  );
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
  let codigoCanal: CodigoCanalIa = 'web';

  try {
    const body = await req.json();
    mensaje = (body?.mensaje ?? '').toString();
    conversationId = body?.conversationId || undefined;
    // BA-029: explícito. Omitido o null = web. Otro valor = canal_invalido (no cae a web).
    codigoCanal = resolverCodigoCanalExplicito(body?.codigo_canal);

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
  } catch (err) {
    const falloCanal = respuestaCanalFailClosed(err);
    if (falloCanal) return falloCanal;
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

    const codigoAgente = await resolverAgenteDelCanal(codigoCanal);
    const salida = await agenteExecutor.ejecutar({
      codigo_agente: codigoAgente,
      codigo_canal: codigoCanal,
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
    const falloCanal = respuestaCanalFailClosed(err);
    if (falloCanal) {
      console.error('[api/naia] Canal no disponible:', err);
      return falloCanal;
    }
    console.error('[api/naia] Error ejecutando el agente:', err);
    return NextResponse.json(fallback(conversationId), { status: 200 });
  }
}
