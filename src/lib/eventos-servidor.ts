/**
 * Lógica del servidor de POST /api/eventos (registro de eventos de negocio con service role).
 *
 * Qué hace: valida origen, cupo, tamaño y forma del cuerpo; asegura la fila del visitante y
 * guarda el evento en `eventos_negocio` con `construirFilaEvento`.
 * Para qué: el insert desde el navegador con la clave anon fallaba por RLS (42501 → HTTP 401) y
 * los eventos se perdían. Ahora escribe el servidor sin abrir RLS a anon.
 * Está separado de `app/api/eventos/route.ts` y recibe sus dependencias (BD, reloj, cupos) para
 * poder probarlo con fakes sin red ni Next (src/lib/eventos-servidor.test.ts).
 */

import { construirFilaEvento, LIMITES_EVENTO, validarCuerpoEvento } from './eventos-contrato';

// Bloque tipos de BD mínimos: solo lo que usa la ruta (upsert de visitante, insert de evento).
// Para qué: que las pruebas pasen un fake sin depender del cliente real de Supabase.
export interface ResultadoBd {
  error: { code?: string; message?: string } | null;
}
export interface TablaBd {
  insert(fila: Record<string, unknown>): PromiseLike<ResultadoBd>;
  upsert(fila: Record<string, unknown>, opciones: { onConflict: string; ignoreDuplicates: boolean }): PromiseLike<ResultadoBd>;
}
export interface BdEventos {
  from(tabla: string): TablaBd;
}

/**
 * Cupo en memoria por ventana fija (mismo algoritmo que el BA-008 de /api/naia).
 * Qué hace: cuenta peticiones por clave en una ventana de `ventanaMs` y niega al pasar `max`.
 * Para qué: frenar ráfagas por IP y por visitante. Es por instancia (serverless): limita abuso
 * simple, no es un cupo global; igual que en /api/naia.
 */
export class LimitadorVentana {
  private readonly cubetas = new Map<string, { cuenta: number; reiniciaEn: number }>();
  // Propiedades explícitas (no "parameter properties"): node --experimental-strip-types no las admite.
  private readonly max: number;
  private readonly ventanaMs: number;
  private readonly ahora: () => number;
  constructor(max: number, ventanaMs: number, ahora: () => number = Date.now) {
    this.max = max;
    this.ventanaMs = ventanaMs;
    this.ahora = ahora;
  }

  /** true = permitido; false = excedió el cupo. */
  permitir(clave: string): boolean {
    const t = this.ahora();
    const cubeta = this.cubetas.get(clave);
    if (!cubeta || t >= cubeta.reiniciaEn) {
      this.cubetas.set(clave, { cuenta: 1, reiniciaEn: t + this.ventanaMs });
      // Limpieza oportunista para no crecer sin límite en procesos longevos.
      if (this.cubetas.size > 5000) {
        for (const [k, v] of this.cubetas) if (t >= v.reiniciaEn) this.cubetas.delete(k);
      }
      return true;
    }
    if (cubeta.cuenta >= this.max) return false;
    cubeta.cuenta += 1;
    return true;
  }
}

// Bloque cupos por defecto: 120/min por IP (colegios o redes compartidas detrás de un NAT) y
// 60/min por visitante (abrir/cerrar fichas rápido genera ~2 eventos por oferta).
export const CUPOS_EVENTOS = {
  ventanaMs: 60_000,
  maxPorIp: 120,
  maxPorVisitante: 60
} as const;

export interface DependenciasEventos {
  obtenerDb: () => BdEventos;
  ahora?: () => Date;
  limitadorIp?: LimitadorVentana;
  limitadorVisitante?: LimitadorVentana;
  registrarError?: (mensaje: string, detalle: Record<string, unknown>) => void;
}

/** Valor que el servidor pone en `generado_por` para los eventos del sitio web. */
export const GENERADO_POR_WEB = 'web';

// Respuesta JSON sin caché (los errores llevan un código estable para el cliente y pruebas).
function json(status: number, cuerpo: Record<string, unknown>, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }
  });
}

// IP del cliente: primer valor de x-forwarded-for (Vercel), si no x-real-ip (igual que /api/naia).
export function ipCliente(req: Request): string {
  const reenviada = req.headers.get('x-forwarded-for');
  const primera = reenviada?.split(',')[0]?.trim();
  if (primera) return primera;
  return req.headers.get('x-real-ip')?.trim() || 'desconocida';
}

/**
 * Mismo origen: exige cabecera Origin cuyo host coincida con el host de la petición
 * (x-forwarded-host en Vercel, si no Host) y rechaza Sec-Fetch-Site = cross-site.
 * Para qué: que otro sitio no pueda usar el navegador del visitante para meter eventos.
 * Los navegadores siempre mandan Origin en POST de fetch y de sendBeacon.
 */
export function esMismoOrigen(req: Request): boolean {
  if (req.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origen = req.headers.get('origin');
  if (!origen) return false;
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim().toLowerCase();
  if (!host) return false;
  try {
    return new URL(origen).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

/**
 * Crea el manejador POST. Respuestas: 204 guardado · 400 inválido · 403 otro origen ·
 * 429 cupo · 500 genérico (sin detalles de BD; el código de error queda solo en el log).
 */
export function crearManejadorEventos(deps: DependenciasEventos) {
  const ahora = deps.ahora ?? (() => new Date());
  const limitadorIp = deps.limitadorIp ?? new LimitadorVentana(CUPOS_EVENTOS.maxPorIp, CUPOS_EVENTOS.ventanaMs);
  const limitadorVisitante =
    deps.limitadorVisitante ?? new LimitadorVentana(CUPOS_EVENTOS.maxPorVisitante, CUPOS_EVENTOS.ventanaMs);
  const registrarError = deps.registrarError ?? ((m, d) => console.error(m, d));
  const cupoAgotado = () =>
    json(429, { ok: false, code: 'rate_limited', message: 'Demasiadas solicitudes.' }, { 'Retry-After': '60' });

  return async function POST(req: Request): Promise<Response> {
    // 1) Origen: fuera del sitio → 403 antes de gastar cupo o leer el cuerpo.
    if (!esMismoOrigen(req)) return json(403, { ok: false, code: 'origen_no_permitido' });

    // 2) Cupo por IP (barato, antes de parsear).
    if (!limitadorIp.permitir(`ip:${ipCliente(req)}`)) return cupoAgotado();

    // 3) Cuerpo: tamaño acotado y JSON. Se lee como texto para aceptar también sendBeacon
    //    (text/plain), sin depender del Content-Type.
    const largoDeclarado = Number(req.headers.get('content-length') || '0');
    if (largoDeclarado > LIMITES_EVENTO.cuerpoMaxBytes) return json(400, { ok: false, code: 'cuerpo_muy_grande' });
    let texto: string;
    try {
      texto = await req.text();
    } catch {
      return json(400, { ok: false, code: 'cuerpo_invalido' });
    }
    if (new TextEncoder().encode(texto).length > LIMITES_EVENTO.cuerpoMaxBytes) {
      return json(400, { ok: false, code: 'cuerpo_muy_grande' });
    }
    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      return json(400, { ok: false, code: 'json_invalido' });
    }

    // 4) Validación estricta (lista permitida, UUIDs, metadatos, sin campos extra).
    const validacion = validarCuerpoEvento(cuerpo);
    if (validacion.ok === false) return json(400, { ok: false, code: validacion.codigo });
    const { visitanteId, datos } = validacion.valor;

    // 5) Cupo por visitante.
    if (!limitadorVisitante.permitir(`v:${visitanteId}`)) return cupoAgotado();

    // 6) Escritura con service role (RLS no aplica). Primero asegura la fila en `visitantes`
    //    porque `eventos_negocio.visitante_id` tiene FK a `visitantes(id)` y el alta desde el
    //    navegador también fallaba por RLS (mismo arreglo que /api/leadcenter/convertir).
    try {
      const db = deps.obtenerDb();
      const marca = ahora();
      const marcaIso = marca.toISOString();
      const { error: errorVisitante } = await db.from('visitantes').upsert(
        { id: visitanteId, identificador_navegacion: visitanteId, primer_acceso_en: marcaIso, ultimo_acceso_en: marcaIso },
        { onConflict: 'id', ignoreDuplicates: true }
      );
      if (errorVisitante) {
        registrarError('[api/eventos] no se pudo asegurar el visitante', { code: errorVisitante.code ?? null });
        return json(500, { ok: false, code: 'error_interno', message: 'No se pudo registrar el evento.' });
      }
      const { error } = await db
        .from('eventos_negocio')
        .insert(construirFilaEvento(visitanteId, datos, marca, GENERADO_POR_WEB));
      if (error) {
        registrarError('[api/eventos] insert en eventos_negocio falló', { code: error.code ?? null, evento: datos.tipo_evento });
        return json(500, { ok: false, code: 'error_interno', message: 'No se pudo registrar el evento.' });
      }
    } catch (err) {
      // Incluye la falta de SUPABASE_SERVICE_ROLE_KEY: se registra solo el nombre del error.
      registrarError('[api/eventos] error inesperado', { error: err instanceof Error ? err.name : 'desconocido' });
      return json(500, { ok: false, code: 'error_interno', message: 'No se pudo registrar el evento.' });
    }

    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  };
}
