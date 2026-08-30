import { NextRequest, NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/src/lib/supabase-server';

/**
 * API Route del servidor para NaIA (Abacus.AI ChatLLM).
 *
 * Recibe:  POST { mensaje: string, conversationId?: string }
 * Devuelve: { mensaje, filtros, pregunta_seguimiento, opciones_sugeridas, conversationId }
 */

const ABACUS_ENDPOINT = 'https://api.abacus.ai/api/v0/getConversationResponse';

interface NaiaFiltros {
  programa_o_area?: string;
  modalidad?: string;
  ciudad?: string;
  pais?: string;
  nivel_academico?: string;
  tipo_beneficio?: string;
  universidad?: string;
}

interface ContextoNaiaActivo {
  id: string;
  version: number;
  nombre: string;
  instrucciones_sistema: string | null;
  tono: string | null;
  prioridades_conversacionales: Record<string, any> | null;
  respuestas_guiadas: Record<string, any> | null;
}

interface NaiaPayload {
  mensaje: string;
  filtros: NaiaFiltros;
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

function limpiarTono(texto: string): string {
  return (texto || '')
    .replace(/\b(¡)?excelente elección!?/gi, '')
    .replace(/\b(qué bueno que te guste esta carrera\.?)/gi, '')
    .replace(/\b(genial|perfecto)\.?\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function opcionesDeterministas(anchor: string): string[] {
  const text = (anchor || '').toLowerCase();

  if (text.includes('pregrado') && text.includes('posgrado')) {
    return ['Me interesa pregrado', 'Me interesa posgrado', 'Explorar el filtro actual'];
  }
  if (text.includes('modalidad')) {
    return ['Prefiero modalidad virtual', 'Prefiero modalidad presencial', 'Explorar el filtro actual'];
  }
  if (text.includes('ciudad') || text.includes('ubicación') || text.includes('pais')) {
    return ['Quiero estudiar en Bogotá', 'Estoy abierto a cualquier ciudad', 'Explorar el filtro actual'];
  }
  if (text.includes('beneficio') || text.includes('beca') || text.includes('descuento')) {
    return ['Quiero opciones con beca', 'Quiero opciones con descuento', 'Explorar el filtro actual'];
  }

  return ['Quiero filtrar por modalidad', 'Quiero ajustar por ciudad', 'Explorar el filtro actual'];
}

function normalizarOpciones(raw: any, anchor: string): string[] {
  const opciones = Array.isArray(raw)
    ? raw.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
    : [];

  if (opciones.length >= 2) {
    return [opciones[0], opciones[1], 'Explorar el filtro actual'];
  }

  return opcionesDeterministas(anchor);
}

function extraerJson(texto: string): any | null {
  if (!texto) return null;

  const bloque = texto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (bloque && bloque[1]) {
    try {
      return JSON.parse(bloque[1].trim());
    } catch {
      // continuar
    }
  }

  try {
    return JSON.parse(texto.trim());
  } catch {
    // continuar
  }

  const inicio = texto.indexOf('{');
  const fin = texto.lastIndexOf('}');
  if (inicio !== -1 && fin !== -1 && fin > inicio) {
    const posible = texto.slice(inicio, fin + 1);
    try {
      return JSON.parse(posible);
    } catch {
      // continuar
    }
  }

  return null;
}

function normalizarFiltros(raw: any): NaiaFiltros {
  if (!raw || typeof raw !== 'object') return {};
  const f: NaiaFiltros = {};
  const map: [keyof NaiaFiltros, string[]][] = [
    ['programa_o_area', ['programa_o_area', 'programa', 'area', 'área', 'carrera']],
    ['modalidad', ['modalidad']],
    ['ciudad', ['ciudad']],
    ['pais', ['pais', 'país']],
    ['nivel_academico', ['nivel_academico', 'nivel_académico', 'nivel']],
    ['tipo_beneficio', ['tipo_beneficio', 'beneficio']],
    ['universidad', ['universidad', 'institucion', 'institución']]
  ];
  for (const [destino, claves] of map) {
    for (const clave of claves) {
      const valor = raw[clave];
      if (typeof valor === 'string' && valor.trim()) {
        f[destino] = valor.trim();
        break;
      }
    }
  }
  return f;
}

function buildInstructionEnvelope(contexto: ContextoNaiaActivo | null): string {
  const lineasBase = [
    'Eres NaIA, asesora virtual de BuscoEdu.',
    'Responde en español, tono tranquilo, respetuoso y directo.',
    'No prometas admisión, beca ni cupo.',
    'No inventes información.',
    'Cuando sea necesario, haz una sola pregunta útil.',
    'Devuelve SIEMPRE y SOLO JSON válido con esta forma exacta:',
    '{"mensaje":"string","filtros":{"programa_o_area":null,"modalidad":null,"ciudad":null,"pais":null,"nivel_academico":null,"tipo_beneficio":null,"universidad":null},"pregunta_seguimiento":null,"opciones_sugeridas":["opcion 1","opcion 2","Explorar el filtro actual"]}'
  ];

  if (!contexto) return lineasBase.join('\n');

  const extras: string[] = [];
  if (contexto.instrucciones_sistema) {
    extras.push(`Instrucciones operativas publicadas: ${contexto.instrucciones_sistema}`);
  }
  if (contexto.tono) {
    extras.push(`Guía de tono publicada: ${contexto.tono}`);
  }
  if (contexto.prioridades_conversacionales) {
    extras.push(
      `Prioridades conversacionales publicadas (JSON): ${JSON.stringify(
        contexto.prioridades_conversacionales
      )}`
    );
  }
  if (contexto.respuestas_guiadas) {
    extras.push(`Respuestas guiadas publicadas (JSON): ${JSON.stringify(contexto.respuestas_guiadas)}`);
  }

  return [...lineasBase, ...extras].join('\n');
}

async function obtenerContextoActivoSeguro(): Promise<ContextoNaiaActivo | null> {
  try {
    const db = getServiceRoleClient();
    const { data, error } = await db
      .from('contexto_naia')
      .select(
        'id, version, nombre, instrucciones_sistema, tono, prioridades_conversacionales, respuestas_guiadas'
      )
      .eq('activo', true)
      .eq('estado', 'publicado')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data as ContextoNaiaActivo;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const deploymentId = process.env.ABACUS_NAIA_DEPLOYMENT_ID;
  const deploymentToken = process.env.ABACUS_NAIA_DEPLOYMENT_TOKEN;

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

  if (!deploymentId || !deploymentToken) {
    console.error('[api/naia] Faltan ABACUS_NAIA_DEPLOYMENT_ID o ABACUS_NAIA_DEPLOYMENT_TOKEN');
    return NextResponse.json(fallback(conversationId), { status: 200 });
  }

  try {
    const contexto = await obtenerContextoActivoSeguro();
    const systemEnvelope = buildInstructionEnvelope(contexto);

    const reqBody: Record<string, unknown> = {
      deploymentId,
      deploymentToken,
      message: `${systemEnvelope}\n\nMensaje del estudiante: ${mensaje}`
    };

    if (conversationId) {
      reqBody.deploymentConversationId = conversationId;
    }

    const abacusRes = await fetch(ABACUS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });

    if (!abacusRes.ok) {
      console.error('[api/naia] Abacus respondió', abacusRes.status);
      return NextResponse.json(fallback(conversationId), { status: 200 });
    }

    const data = await abacusRes.json();
    const result = data?.result ?? data;

    const nuevaConversationId: string | undefined =
      result?.deploymentConversationId || result?.deployment_conversation_id || conversationId;

    const messages = result?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(fallback(nuevaConversationId), { status: 200 });
    }

    let textoBot = '';
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      const esUsuario = m?.is_user ?? m?.isUser ?? false;
      if (!esUsuario) {
        textoBot = (m?.text ?? m?.content ?? '').toString();
        if (textoBot) break;
      }
    }

    const parsed = extraerJson(textoBot);

    if (parsed && typeof parsed === 'object') {
      const mensajeLimpio = limpiarTono(
        (typeof parsed.mensaje === 'string' && parsed.mensaje) ||
          (typeof parsed.respuesta === 'string' && parsed.respuesta) ||
          'Actualicé la búsqueda con lo que me indicaste.'
      );
      const preguntaLimpia =
        typeof parsed.pregunta_seguimiento === 'string' && parsed.pregunta_seguimiento.trim()
          ? limpiarTono(parsed.pregunta_seguimiento.trim())
          : null;

      const anchor = preguntaLimpia || mensajeLimpio;

      const payload: NaiaPayload = {
        mensaje: mensajeLimpio || 'Actualicé la búsqueda con lo que me indicaste.',
        filtros: normalizarFiltros(parsed.filtros),
        pregunta_seguimiento: preguntaLimpia,
        opciones_sugeridas: normalizarOpciones(parsed.opciones_sugeridas, anchor),
        conversationId: nuevaConversationId
      };
      return NextResponse.json(payload, { status: 200 });
    }

    const limpio = limpiarTono(textoBot.trim());
    if (limpio) {
      return NextResponse.json(
        {
          mensaje: limpio,
          filtros: {},
          pregunta_seguimiento: null,
          opciones_sugeridas: normalizarOpciones([], limpio),
          conversationId: nuevaConversationId
        } as NaiaPayload,
        { status: 200 }
      );
    }

    return NextResponse.json(fallback(nuevaConversationId), { status: 200 });
  } catch (err) {
    console.error('[api/naia] Error llamando a Abacus.AI:', err);
    return NextResponse.json(fallback(conversationId), { status: 200 });
  }
}
