/**
 * BA-041 (E1 · Ola 4/4) — Traducción de los resultados de `fn_convertir_aplicacion`.
 *
 * Qué hace: convierte el `{ ok: false, error }` que devuelve la RPC en
 * `{ status HTTP, body: { ok: false, error, mensaje } }` con un mensaje en español
 * claro (tuteo neutro, sin jerga técnica) para quien usa el Lead Center.
 *   - Los 6 códigos nuevos de BA-041 (oferta y consentimiento) más los que ya
 *     existían (`duplicada`, `limite_alcanzado`, datos faltantes, oferta inexistente,
 *     embudo sin etapa inicial, `excepcion`).
 *   - Un código desconocido → 500 `error_conversion` con mensaje genérico
 *     (fail-closed): nunca se reenvía el objeto de la RPC ni `sqlstate`.
 * Para qué: que el asesor entienda qué pasó y qué hacer, y que ningún detalle
 * interno de la BD llegue al navegador.
 * Módulo puro (sin `@/` ni Next) para poder probarlo con node --test.
 */

export interface RespuestaConversion {
  status: number;
  body: Record<string, unknown>;
}

interface Traduccion {
  status: number;
  mensaje: string;
}

// ---------------------------------------------------------------------------
// Bloque 1: los 6 códigos nuevos de BA-041 (docs/bd/README-e1-ba041-20261018.md).
// Oferta → 409 (la solicitud está bien, pero la oferta no está en estado de recibirla).
// Consentimiento → 422 (la solicitud llegó, pero le falta una autorización).
// ---------------------------------------------------------------------------
export const ERRORES_BA041: Record<string, Traduccion> = {
  oferta_no_disponible: {
    status: 409,
    mensaje: 'Esta oferta no está disponible en este momento. Elige otra oferta.'
  },
  oferta_no_vigente: {
    status: 409,
    mensaje: 'Esta oferta todavía no ha empezado. Podrás aplicar cuando abra su periodo.'
  },
  oferta_vencida: {
    status: 409,
    mensaje: 'Esta oferta ya cerró. Elige otra oferta vigente.'
  },
  oferta_sin_periodo: {
    status: 409,
    mensaje: 'A esta oferta le falta el periodo académico, así que aún no recibe solicitudes. Avisa al equipo de BuscoEdu para que la completen.'
  },
  consentimiento_obligatorio_faltante: {
    status: 422,
    mensaje: 'Falta aceptar una autorización obligatoria. Revisa las casillas e intenta de nuevo.'
  },
  consentimiento_no_aceptado: {
    status: 422,
    mensaje: 'Para crear la solicitud hace falta autorizar el contacto (por ejemplo, por WhatsApp). Revisa las casillas e intenta de nuevo.'
  }
};

// ---------------------------------------------------------------------------
// Bloque 2: códigos que la RPC ya devolvía antes de BA-041.
// `duplicada` y `limite_alcanzado` conservan HTTP 400 y el mismo texto que ya
// muestra el modal (compatibilidad). `excepcion` no expone `sqlstate`.
// ---------------------------------------------------------------------------
const DATOS_FALTANTES = 'Faltan datos para crear la solicitud. Revisa el formulario e intenta de nuevo.';
export const ERRORES_PREVIOS: Record<string, Traduccion> = {
  duplicada: { status: 400, mensaje: 'Esta solicitud ya estaba creada.' },
  limite_alcanzado: {
    status: 400,
    mensaje: 'Solo puedes tener hasta 3 aplicaciones activas. Debes cerrar tu solicitud con la universidad o con BuscoEdu antes de crear otra.'
  },
  clave_idempotencia_requerida: { status: 400, mensaje: DATOS_FALTANTES },
  oferta_id_requerida: { status: 400, mensaje: DATOS_FALTANTES },
  celular_requerido: { status: 400, mensaje: DATOS_FALTANTES },
  oferta_inexistente: { status: 404, mensaje: 'No encontramos esta oferta. Elige otra oferta.' },
  etapa_inicial_inexistente: {
    status: 503,
    mensaje: 'Por ahora no podemos crear solicitudes por un ajuste pendiente en el Lead Center. Avisa al equipo de BuscoEdu.'
  },
  excepcion: {
    status: 500,
    mensaje: 'No pudimos crear la solicitud. Intenta de nuevo en unos minutos; si sigue pasando, avisa al equipo de BuscoEdu.'
  }
};

// ---------------------------------------------------------------------------
// Bloque 3: respuesta genérica segura (código desconocido o falla de la llamada).
// ---------------------------------------------------------------------------
export const CODIGO_GENERICO = 'error_conversion';
export const MENSAJE_GENERICO =
  'No pudimos crear la solicitud. Intenta de nuevo en unos minutos; si sigue pasando, avisa al equipo de BuscoEdu.';

export function respuestaGenerica(): RespuestaConversion {
  return { status: 500, body: { ok: false, error: CODIGO_GENERICO, mensaje: MENSAJE_GENERICO } };
}

/**
 * Traduce un resultado `ok: false` de la RPC. Solo copia campos conocidos:
 * `error` (si es un código conocido), `mensaje` y, en `duplicada`, `aplicacion_id`.
 * `avisar` recibe solo el código (nunca datos de la persona) para el log del servidor.
 */
export function traducirErrorConversion(
  resultado: unknown,
  avisar: (m: string) => void = (m) => console.warn(m)
): RespuestaConversion {
  const r = (resultado && typeof resultado === 'object' ? resultado : {}) as Record<string, unknown>;
  const codigo = typeof r.error === 'string' ? r.error : '';
  const t = Object.prototype.hasOwnProperty.call(ERRORES_BA041, codigo)
    ? ERRORES_BA041[codigo]
    : Object.prototype.hasOwnProperty.call(ERRORES_PREVIOS, codigo)
      ? ERRORES_PREVIOS[codigo]
      : null;
  if (!t) {
    // Fail-closed: el código no se reenvía (podría ser interno) y se recorta en el log.
    avisar(`[convertir] Resultado de conversión no reconocido: ${codigo.slice(0, 60) || 'sin_codigo'}`);
    return respuestaGenerica();
  }
  if (codigo === 'excepcion') avisar('[convertir] fn_convertir_aplicacion devolvió excepcion');
  const body: Record<string, unknown> = { ok: false, error: codigo, mensaje: t.mensaje };
  if (codigo === 'duplicada') body.aplicacion_id = typeof r.aplicacion_id === 'string' ? r.aplicacion_id : null;
  return { status: t.status, body };
}
