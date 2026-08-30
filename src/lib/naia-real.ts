/**
 * Cliente de NaIA real (Abacus.AI ChatLLM).
 *
 * Reemplaza a naia-mock.ts. Este cliente corre en el navegador y llama a la
 * API Route interna /api/naia, que a su vez habla con Abacus.AI desde el
 * servidor (donde vive el deployment token de forma segura).
 */

export interface NaiaResponse {
  mensaje: string;
  filtros: {
    programa_o_area?: string;
    modalidad?: string;
    ciudad?: string;
    pais?: string;
    nivel_academico?: string;
    tipo_beneficio?: string;
    universidad?: string;
  };
  pregunta_seguimiento: string | null;
  opciones_sugeridas?: string[];
  conversationId?: string;
}

// Respuesta segura ante cualquier fallo de red o del servidor.
function respuestaFallback(conversationId?: string): NaiaResponse {
  return {
    mensaje:
      'Tuve un inconveniente para conectarme en este momento. Puedes intentarlo de nuevo o indicarme un área, modalidad, nivel, ciudad o tipo de beneficio.',
    filtros: {},
    pregunta_seguimiento: null,
    conversationId,
  };
}

/**
 * Envía un mensaje a NaIA y devuelve su respuesta estructurada.
 * @param mensaje        Texto escrito por el usuario.
 * @param conversationId ID de conversación para mantener el contexto (opcional).
 */
export async function callNaia(
  mensaje: string,
  conversationId?: string
): Promise<NaiaResponse> {
  try {
    const res = await fetch('/api/naia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensaje, conversationId }),
    });

    if (!res.ok) {
      return respuestaFallback(conversationId);
    }

    const data = await res.json();

    return {
      mensaje:
        typeof data?.mensaje === 'string' && data.mensaje.trim()
          ? data.mensaje
          : 'Actualicé la búsqueda con lo que me indicaste.',
      filtros: data?.filtros && typeof data.filtros === 'object' ? data.filtros : {},
      pregunta_seguimiento:
        typeof data?.pregunta_seguimiento === 'string' && data.pregunta_seguimiento.trim()
          ? data.pregunta_seguimiento
          : null,
      opciones_sugeridas: Array.isArray(data?.opciones_sugeridas)
        ? data.opciones_sugeridas.filter((x: any) => typeof x === 'string' && x.trim()).slice(0, 3)
        : undefined,
      conversationId: data?.conversationId || conversationId,
    };
  } catch {
    return respuestaFallback(conversationId);
  }
}
