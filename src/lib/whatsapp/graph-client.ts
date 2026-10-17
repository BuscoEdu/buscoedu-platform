/**
 * BA-032 · Cliente mínimo de WhatsApp Cloud API (Graph API).
 *
 * - POST https://graph.facebook.com/{versión}/{phone-number-id}/messages
 * - Texto, lista interactiva (máx 10 filas por regla de Meta; nosotros 8 fichas),
 *   botones de respuesta (máx 3) y plantilla (solo para la prueba manual hello_world).
 * - Timeout con AbortController.
 * - Los errores nunca incluyen el token: se reporta status HTTP y código de Meta.
 */

export const MAX_FILAS_LISTA_META = 10;
export const MAX_FILAS_LISTA_BUSCOEDU = 8;
export const MAX_BOTONES_META = 3;

export interface FilaLista {
  id: string;
  titulo: string;
  descripcion?: string;
}

export interface BotonRespuesta {
  id: string;
  titulo: string;
}

export interface ResultadoEnvio {
  ok: true;
  idMensaje: string | null;
}

/** Error de envío sin datos sensibles. */
export class WhatsAppApiError extends Error {
  readonly status: number;
  readonly codigoMeta: number | null;
  readonly subcodigoMeta: number | null;
  readonly tipo: 'http' | 'timeout' | 'red' | 'config' | 'validacion';
  constructor(
    mensaje: string,
    opciones: { status?: number; codigoMeta?: number | null; subcodigoMeta?: number | null; tipo: WhatsAppApiError['tipo'] }
  ) {
    super(mensaje);
    this.name = 'WhatsAppApiError';
    this.status = opciones.status ?? 0;
    this.codigoMeta = opciones.codigoMeta ?? null;
    this.subcodigoMeta = opciones.subcodigoMeta ?? null;
    this.tipo = opciones.tipo;
  }
}

/** Interfaz que usa el orquestador: permite reemplazar el envío real en tests. */
export interface EnviadorWhatsApp {
  enviarTexto(para: string, cuerpo: string): Promise<ResultadoEnvio>;
  enviarLista(
    para: string,
    input: { cuerpo: string; textoBoton: string; tituloSeccion: string; filas: FilaLista[] }
  ): Promise<ResultadoEnvio>;
  enviarBotones(para: string, input: { cuerpo: string; botones: BotonRespuesta[] }): Promise<ResultadoEnvio>;
}

export interface OpcionesClienteGraph {
  token: string;
  phoneNumberId: string;
  versionGraph: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}

// Bloque: recortes según límites documentados por Meta para mensajes interactivos (≈ verificados en guías de terceros).
function recortar(valor: string, max: number): string {
  const limpio = (valor || '').trim();
  return limpio.length <= max ? limpio : limpio.slice(0, Math.max(0, max - 1)) + '…';
}

// Bloque: elimina cualquier aparición del token de un texto antes de exponerlo.
function sinToken(texto: string, token: string): string {
  if (!texto) return '';
  return token ? texto.split(token).join('[oculto]') : texto;
}

/** Destino: Meta acepta el número sin '+'. */
export function destinoMeta(e164OWaId: string): string {
  return (e164OWaId || '').replace(/\D/g, '');
}

export function crearClienteGraph(opciones: OpcionesClienteGraph): EnviadorWhatsApp & {
  enviarPlantilla(para: string, nombre: string, idioma: string): Promise<ResultadoEnvio>;
} {
  const fetchImpl = opciones.fetchImpl || fetch;
  const timeoutMs = opciones.timeoutMs ?? 8000;
  const base = (opciones.baseUrl || 'https://graph.facebook.com').replace(/\/$/, '');

  // Bloque: POST con timeout y manejo de errores sin filtrar el token.
  async function publicar(cuerpo: Record<string, unknown>): Promise<ResultadoEnvio> {
    if (!opciones.token || !opciones.phoneNumberId) {
      throw new WhatsAppApiError('Faltan credenciales de WhatsApp (token o phone number id).', { tipo: 'config' });
    }
    const url = `${base}/${encodeURIComponent(opciones.versionGraph)}/${encodeURIComponent(opciones.phoneNumberId)}/messages`;
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), timeoutMs);
    let respuesta: Response;
    try {
      respuesta = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${opciones.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...cuerpo }),
        signal: controlador.signal
      });
    } catch (error) {
      const abortado = (error as { name?: string })?.name === 'AbortError';
      throw new WhatsAppApiError(abortado ? `Graph API no respondió en ${timeoutMs} ms.` : 'No se pudo conectar con Graph API.', {
        tipo: abortado ? 'timeout' : 'red'
      });
    } finally {
      clearTimeout(temporizador);
    }

    let datos: any = null;
    try {
      datos = await respuesta.json();
    } catch {
      datos = null;
    }

    if (!respuesta.ok) {
      const err = datos?.error || {};
      const mensaje = sinToken(typeof err.message === 'string' ? err.message.slice(0, 300) : `HTTP ${respuesta.status}`, opciones.token);
      throw new WhatsAppApiError(mensaje, {
        tipo: 'http',
        status: respuesta.status,
        codigoMeta: Number.isFinite(Number(err.code)) ? Number(err.code) : null,
        subcodigoMeta: Number.isFinite(Number(err.error_subcode)) ? Number(err.error_subcode) : null
      });
    }

    const id = Array.isArray(datos?.messages) && typeof datos.messages[0]?.id === 'string' ? datos.messages[0].id : null;
    return { ok: true, idMensaje: id };
  }

  return {
    enviarTexto(para, cuerpo) {
      const texto = recortar(cuerpo, 4096);
      if (!texto) throw new WhatsAppApiError('Texto vacío.', { tipo: 'validacion' });
      return publicar({ to: destinoMeta(para), type: 'text', text: { preview_url: true, body: texto } });
    },

    enviarLista(para, input) {
      const filas = (input.filas || []).slice(0, Math.min(MAX_FILAS_LISTA_BUSCOEDU, MAX_FILAS_LISTA_META));
      if (filas.length === 0) throw new WhatsAppApiError('La lista no tiene filas.', { tipo: 'validacion' });
      return publicar({
        to: destinoMeta(para),
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: recortar(input.cuerpo, 1024) },
          action: {
            button: recortar(input.textoBoton, 20),
            sections: [
              {
                title: recortar(input.tituloSeccion, 24),
                rows: filas.map((fila) => ({
                  id: recortar(fila.id, 200),
                  title: recortar(fila.titulo, 24),
                  ...(fila.descripcion ? { description: recortar(fila.descripcion, 72) } : {})
                }))
              }
            ]
          }
        }
      });
    },

    enviarBotones(para, input) {
      const botones = (input.botones || []).slice(0, MAX_BOTONES_META);
      if (botones.length === 0) throw new WhatsAppApiError('Sin botones.', { tipo: 'validacion' });
      return publicar({
        to: destinoMeta(para),
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: recortar(input.cuerpo, 1024) },
          action: {
            buttons: botones.map((b) => ({ type: 'reply', reply: { id: recortar(b.id, 256), title: recortar(b.titulo, 20) } }))
          }
        }
      });
    },

    // Solo para la prueba manual (hello_world). El MVP no usa plantillas en conversación.
    enviarPlantilla(para, nombre, idioma) {
      return publicar({ to: destinoMeta(para), type: 'template', template: { name: nombre, language: { code: idioma } } });
    }
  };
}
