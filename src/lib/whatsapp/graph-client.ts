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
    input: { cuerpo: string; textoBoton: string; tituloSeccion: string; filas: FilaLista[]; pie?: string }
  ): Promise<ResultadoEnvio>;
  enviarBotones(para: string, input: { cuerpo: string; botones: BotonRespuesta[] }): Promise<ResultadoEnvio>;
  /**
   * Botón oficial de Meta para pedir que el usuario comparta su número (interactive request_contact_info).
   * Opcional para no romper enviadores de prueba antiguos.
   */
  enviarSolicitudContacto?(para: string, cuerpo: string): Promise<ResultadoEnvio>;
}

export interface OpcionesClienteGraph {
  token: string;
  phoneNumberId: string;
  versionGraph: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  /** Log enmascarado (sin token ni números). Se usa para la alerta wa_token_invalido. */
  log?: (evento: string, datos?: Record<string, unknown>) => void;
}

/** Código de Meta para token vencido o inválido (OAuthException). */
export const CODIGO_META_TOKEN_INVALIDO = 190;

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

/**
 * Bloque: direccionamiento del envío (teléfono o BSUID).
 * Qué: `para` es un teléfono (E.164 o wa_id) o un BSUID (p. ej. CO.1234…, con o sin prefijo uid:).
 * - teléfono → { to: "<dígitos>" } (como siempre);
 * - BSUID    → { recipient: "<BSUID completo>" } (campo documentado por Meta; si van ambos, `to` gana).
 * Por qué: un usuario con nombre de usuario puede no exponer su número; solo se le puede responder por BSUID.
 * Un teléfono nunca trae letras; un BSUID siempre empieza por el código de país en letras.
 */
export function direccionMeta(para: string): { to: string } | { recipient: string } {
  const limpio = (para || '').trim();
  const sinPrefijo = limpio.toLowerCase().startsWith('uid:') ? limpio.slice(4).trim() : limpio;
  if (/[A-Za-z]/.test(sinPrefijo)) return { recipient: sinPrefijo };
  return { to: destinoMeta(sinPrefijo) };
}

/** Bloque: destino de respuesta para un remitente: teléfono si se conoce, si no BSUID. */
export function destinoRemitente(remitente: { telefono: string | null; userId: string | null }): string {
  return remitente.telefono || (remitente.userId ? `uid:${remitente.userId}` : '');
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
      // Bloque: alerta distinta si el token venció o es inválido (C-28; el token actual vence ≈2026-12-18).
      // Solo status y códigos: nunca el valor del token ni el mensaje crudo de Meta.
      if (Number(err.code) === CODIGO_META_TOKEN_INVALIDO) {
        opciones.log?.('wa_token_invalido', {
          status: respuesta.status,
          codigoMeta: CODIGO_META_TOKEN_INVALIDO,
          subcodigoMeta: Number.isFinite(Number(err.error_subcode)) ? Number(err.error_subcode) : null
        });
      }
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
      return publicar({ ...direccionMeta(para), type: 'text', text: { preview_url: true, body: texto } });
    },

    enviarLista(para, input) {
      // Hasta 10 filas (límite Meta): 8 programas + «Ver más» (C-37). El orquestador nunca manda más de 8 programas.
      const filas = (input.filas || []).slice(0, MAX_FILAS_LISTA_META);
      if (filas.length === 0) throw new WhatsAppApiError('La lista no tiene filas.', { tipo: 'validacion' });
      return publicar({
        ...direccionMeta(para),
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: recortar(input.cuerpo, 1024) },
          // Pie opcional (≤60, límite Meta): un solo link a Explorar, nunca un link por ficha.
          ...(input.pie ? { footer: { text: recortar(input.pie, 60) } } : {}),
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
        ...direccionMeta(para),
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

    // Bloque: pide el número al usuario (doc BSUID de Meta: interactive.type = request_contact_info).
    enviarSolicitudContacto(para, cuerpo) {
      const texto = recortar(cuerpo, 1024);
      if (!texto) throw new WhatsAppApiError('Texto vacío.', { tipo: 'validacion' });
      return publicar({
        ...direccionMeta(para),
        type: 'interactive',
        interactive: { type: 'request_contact_info', body: { text: texto }, action: { name: 'request_contact_info' } }
      });
    },

    // Solo para la prueba manual (hello_world). El MVP no usa plantillas en conversación.
    enviarPlantilla(para, nombre, idioma) {
      return publicar({ ...direccionMeta(para), type: 'template', template: { name: nombre, language: { code: idioma } } });
    }
  };
}
