import { NextRequest, NextResponse } from 'next/server';

/**
 * API Route del servidor para NaIA (Abacus.AI ChatLLM).
 *
 * Recibe:  POST { mensaje: string, conversationId?: string }
 * Devuelve: { mensaje, filtros, pregunta_seguimiento, conversationId }
 *
 * El deployment token NUNCA se expone al cliente: solo vive aquí, en el servidor.
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

interface NaiaPayload {
  mensaje: string;
  filtros: NaiaFiltros;
  pregunta_seguimiento: string | null;
  conversationId?: string;
}

// Respuesta de fallback cuando algo falla (nunca lanzamos 500 al cliente).
function fallback(conversationId?: string, mensaje?: string): NaiaPayload {
  return {
    mensaje:
      mensaje ||
      'Gracias por tu mensaje. En este momento tuve un inconveniente para interpretarlo por completo, pero puedes indicarme un área, modalidad, nivel, ciudad o tipo de beneficio y ajusto la búsqueda.',
    filtros: {},
    pregunta_seguimiento:
      'Por ejemplo: "quiero una maestría virtual con beca en Bogotá". ¿Qué criterio quieres aplicar primero?',
    conversationId,
  };
}

/**
 * Extrae el objeto JSON del texto que devuelve NaIA.
 * El texto puede venir:
 *   - Como JSON directo: {"mensaje":"...", "filtros":{...}, ...}
 *   - Envuelto en markdown: ```json\n{...}\n```
 *   - Con texto adicional antes/después del bloque JSON.
 */
function extraerJson(texto: string): any | null {
  if (!texto) return null;

  // 1) Bloque de código markdown ```json ... ``` o ``` ... ```
  const bloque = texto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (bloque && bloque[1]) {
    try {
      return JSON.parse(bloque[1].trim());
    } catch {
      // seguimos intentando otras estrategias
    }
  }

  // 2) JSON directo (texto completo)
  try {
    return JSON.parse(texto.trim());
  } catch {
    // continuar
  }

  // 3) Primer objeto {...} balanceado dentro del texto
  const inicio = texto.indexOf('{');
  const fin = texto.lastIndexOf('}');
  if (inicio !== -1 && fin !== -1 && fin > inicio) {
    const posible = texto.slice(inicio, fin + 1);
    try {
      return JSON.parse(posible);
    } catch {
      // nada
    }
  }

  return null;
}

// Normaliza cualquier estructura de filtros a nuestra forma conocida.
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
    ['universidad', ['universidad', 'institucion', 'institución']],
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
    const reqBody: Record<string, unknown> = {
      deploymentId,
      deploymentToken,
      message: mensaje,
    };
    if (conversationId) {
      reqBody.deploymentConversationId = conversationId;
    }

    const abacusRes = await fetch(ABACUS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });

    if (!abacusRes.ok) {
      console.error('[api/naia] Abacus respondió', abacusRes.status);
      return NextResponse.json(fallback(conversationId), { status: 200 });
    }

    const data = await abacusRes.json();

    // La respuesta de Abacus suele venir como { success, result: {...} } o directamente {...}
    const result = data?.result ?? data;

    const nuevaConversationId: string | undefined =
      result?.deploymentConversationId ||
      result?.deployment_conversation_id ||
      conversationId;

    const messages = result?.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(fallback(nuevaConversationId), { status: 200 });
    }

    // Último mensaje del bot (is_user === false)
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
      const payload: NaiaPayload = {
        mensaje:
          (typeof parsed.mensaje === 'string' && parsed.mensaje) ||
          (typeof parsed.respuesta === 'string' && parsed.respuesta) ||
          'Actualicé la búsqueda con lo que me indicaste.',
        filtros: normalizarFiltros(parsed.filtros),
        pregunta_seguimiento:
          typeof parsed.pregunta_seguimiento === 'string' && parsed.pregunta_seguimiento.trim()
            ? parsed.pregunta_seguimiento.trim()
            : null,
        conversationId: nuevaConversationId,
      };
      return NextResponse.json(payload, { status: 200 });
    }

    // No pudimos parsear JSON: devolvemos el texto plano del bot como mensaje.
    if (textoBot.trim()) {
      return NextResponse.json(
        {
          mensaje: textoBot.trim(),
          filtros: {},
          pregunta_seguimiento: null,
          conversationId: nuevaConversationId,
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
