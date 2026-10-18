/**
 * Hotfix seguridad 2026-10-18 — Cambio de etapa de una oportunidad (Lead Center).
 *
 * Qué hace, en orden (fail-closed):
 *   1. Sesión de Lead Center: sin sesión → 401; rol distinto de asesor/super_admin → 403.
 *   2. Body: JSON roto, sin `etapaNueva` o con ids que no son uuid → 400 con mensaje en español.
 *   3. Solo entonces lee etapa/subestados y llama a `fn_cambiar_etapa` con el cliente
 *      que inyecta la ruta.
 *   4. Traduce el resultado a HTTP + código (los mismos que ya usa el panel) + mensaje.
 *      Errores de BD o códigos desconocidos → 500 genérico, sin detalle interno.
 * Para qué: que nadie llegue a la RPC sin sesión válida y que ningún error filtre
 * mensajes de Postgres al navegador.
 *
 * Cliente de la RPC: la ruta pasa el cliente del usuario (no service role) porque
 * `fn_cambiar_etapa` autoriza con `puede_ver_oportunidad()` / `usuario_interno_id()`,
 * que dependen de `auth.uid()`. Con service role, `auth.uid()` es NULL y la función
 * respondería siempre `no_autorizado` (y `cambiado_por` quedaría NULL). Pasar a
 * service role requiere que BD agregue el actor como parámetro (ver README).
 * Módulo puro (sin `@/` ni Next): se prueba con node --test.
 */

export interface SesionEtapa {
  autenticado: boolean;
  esAsesor: boolean;
  esSuper: boolean;
  usuarioInternoId?: string;
}

type Resp<T> = Promise<{ data: T | null; error: { code?: string; message?: string } | null }>;

/** Lo mínimo del cliente Supabase que usa este flujo (doble en tests). */
export interface ClienteEtapa {
  leerEtapa(id: string): Resp<{ id: string; activo: boolean | null }>;
  leerSubestadosDeEtapa(etapaId: string): Resp<Array<{ id: string; etapa_id: string; activo: boolean | null }>>;
  leerSubestado(id: string): Resp<{ id: string; etapa_id: string; activo: boolean | null }>;
  cambiarEtapa(p: { p_oportunidad_id: string; p_etapa_nueva: string; p_subestado_nuevo: string; p_motivo: string | null }): Resp<Record<string, unknown>>;
}

export interface RespuestaEtapa {
  status: number;
  body: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MENSAJE_GENERICO = 'No pudimos cambiar la etapa. Intenta de nuevo en unos minutos.';
const r = (status: number, error: string, mensaje: string): RespuestaEtapa => ({ status, body: { ok: false, error, mensaje } });

// Bloque 1: códigos de fn_cambiar_etapa → HTTP + mensaje (mismos códigos que lee AccionesOportunidad).
const ERRORES_RPC: Record<string, [number, string]> = {
  no_autorizado: [403, 'No tienes permiso sobre esta oportunidad.'],
  oportunidad_no_encontrada: [404, 'No encontramos esta oportunidad.'],
  etapa_invalida: [400, 'La etapa elegida no es válida.'],
  subestado_requerido: [400, 'Elige un subestado para la etapa.'],
  subestado_invalido_para_etapa: [400, 'El subestado seleccionado no pertenece a la etapa elegida.']
};

export async function procesarCambioEtapa(p: {
  sesion: SesionEtapa;
  oportunidadId: string;
  /** Cuerpo ya parseado, o `undefined` si el JSON no era válido. */
  body: unknown;
  /** Se pide solo después de validar sesión y body (fail-closed). */
  cliente: () => Promise<ClienteEtapa>;
  avisar?: (m: string) => void;
}): Promise<RespuestaEtapa> {
  const avisar = p.avisar ?? ((m: string) => console.warn(m));

  // Bloque 2: sesión y rol.
  if (!p.sesion?.autenticado) return r(401, 'no_autenticado', 'Tu sesión expiró. Vuelve a iniciar sesión.');
  if (!p.sesion.esAsesor && !p.sesion.esSuper) return r(403, 'forbidden', 'No tienes permiso para cambiar etapas.');

  // Bloque 3: body.
  if (p.body === undefined || p.body === null || typeof p.body !== 'object' || Array.isArray(p.body)) {
    return r(400, 'json_invalido', 'La solicitud no es válida. Recarga la página e intenta de nuevo.');
  }
  const b = p.body as Record<string, unknown>;
  const etapaNueva = typeof b.etapaNueva === 'string' ? b.etapaNueva.trim() : '';
  const subestadoNuevo = typeof b.subestadoNuevo === 'string' && b.subestadoNuevo.trim() ? b.subestadoNuevo.trim() : null;
  const motivo = typeof b.motivo === 'string' && b.motivo.trim() ? b.motivo.trim().slice(0, 1000) : null;
  if (!etapaNueva) return r(400, 'etapa_requerida', 'Elige la etapa nueva.');
  if (!UUID.test(etapaNueva)) return r(400, 'etapa_invalida', 'La etapa elegida no es válida.');
  if (subestadoNuevo && !UUID.test(subestadoNuevo)) return r(400, 'subestado_invalido_para_etapa', 'El subestado seleccionado no pertenece a la etapa elegida.');
  if (!UUID.test(p.oportunidadId || '')) return r(400, 'oportunidad_invalida', 'No encontramos esta oportunidad.');

  // Bloque 4: lecturas previas + RPC. Cualquier error de BD → genérico (solo el código al log).
  const fallaBd = (donde: string, e: { code?: string } | null) => {
    avisar(`[etapa] Error de BD en ${donde} (${e?.code || 'sin_codigo'})`);
    return r(500, 'error_interno', MENSAJE_GENERICO);
  };
  try {
    const db = await p.cliente();
    const etapa = await db.leerEtapa(etapaNueva);
    if (etapa.error) return fallaBd('etapa', etapa.error);
    if (!etapa.data || etapa.data.activo === false) return r(400, 'etapa_invalida', 'La etapa elegida no es válida.');

    const subs = await db.leerSubestadosDeEtapa(etapaNueva);
    if (subs.error) return fallaBd('subestados', subs.error);
    if (!subs.data?.length) return r(409, 'etapa_sin_subestados', 'Esta etapa no tiene subestados configurados. Avisa al equipo de BuscoEdu.');

    const objetivo = subestadoNuevo || subs.data[0].id;
    const sub = await db.leerSubestado(objetivo);
    if (sub.error) return fallaBd('subestado', sub.error);
    if (!sub.data || sub.data.activo === false || sub.data.etapa_id !== etapaNueva) {
      return r(400, 'subestado_invalido_para_etapa', 'El subestado seleccionado no pertenece a la etapa elegida.');
    }

    const rpc = await db.cambiarEtapa({ p_oportunidad_id: p.oportunidadId, p_etapa_nueva: etapaNueva, p_subestado_nuevo: objetivo, p_motivo: motivo });
    if (rpc.error) return fallaBd('fn_cambiar_etapa', rpc.error);
    const res = (rpc.data || {}) as Record<string, unknown>;
    if (res.ok === true) return { status: 200, body: { ok: true, oportunidad_id: res.oportunidad_id ?? p.oportunidadId } };

    // Bloque 5: códigos conocidos; desconocido → genérico (fail-closed).
    const codigo = typeof res.error === 'string' ? res.error : '';
    const t = Object.prototype.hasOwnProperty.call(ERRORES_RPC, codigo) ? ERRORES_RPC[codigo] : null;
    if (!t) {
      avisar(`[etapa] Resultado no reconocido: ${codigo.slice(0, 60) || 'sin_codigo'}`);
      return r(500, 'error_interno', MENSAJE_GENERICO);
    }
    return r(t[0], codigo, t[1]);
  } catch (e) {
    avisar(`[etapa] Error inesperado: ${(e as Error)?.name || 'desconocido'}`);
    return r(500, 'error_interno', MENSAJE_GENERICO);
  }
}
