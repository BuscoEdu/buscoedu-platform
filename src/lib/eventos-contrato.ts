/**
 * Contrato compartido de los eventos de negocio (cliente ↔ POST /api/eventos ↔ `eventos_negocio`).
 *
 * Qué hay aquí: la lista permitida de eventos, la validación estricta del cuerpo que recibe el
 * servidor y `construirFilaEvento` (fila con las columnas reales de la tabla).
 * Para qué: un solo lugar puro (sin Supabase, sin Next, sin navegador) que importan tanto el
 * cliente (`src/lib/events.ts`) como la ruta del servidor, y que se prueba sin red.
 */

// Bloque lista permitida: SOLO los eventos que hoy emite el código (callers en NaiaHomeHero,
// NaiaEntryModal, OfferDetailModal y MyListContext). Para qué: el servidor rechaza cualquier otro
// valor (fail-closed) y nadie puede llenar la tabla con nombres inventados. Agregar un evento
// nuevo exige tocar esta lista (y TypeScript obliga a que el cliente use uno de estos).
export const EVENTOS_PERMITIDOS = [
  'naia_modal_abierto',
  'intencion_busqueda_enviada',
  'ficha_oferta_abierta',
  'ficha_oferta_cerrada',
  'intento_aplicar_oferta',
  'oferta_agregada_mi_lista',
  'oferta_retirada_mi_lista'
] as const;

export type EventType = (typeof EVENTOS_PERMITIDOS)[number];

// Datos de un evento en formato del cliente; se exporta para tiparlo en las pruebas de construirFilaEvento.
export interface EventData {
  tipo_evento: EventType;
  oferta_id?: string | null;
  programa_id?: string | null;
  universidad_id?: string | null;
  metadata?: Record<string, unknown>;
}

// Bloque límites: tamaño máximo del cuerpo crudo y de `metadatos` serializado, número de claves y
// largo de cada texto. Para qué: que un visitante no pueda meter contenido grande en la tabla.
export const LIMITES_EVENTO = {
  cuerpoMaxBytes: 4096,
  metadatosMaxBytes: 2048,
  metadatosMaxClaves: 10,
  textoMaxCaracteres: 500
} as const;

// UUID con versión 1-5 y variante RFC 4122: el mismo patrón que ya usan /api/leadcenter/convertir y
// el funnel de Demo WApp para el identificador de navegación (lo genera src/lib/visitor.ts, v4).
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Campos que acepta el cuerpo. Cualquier otro (p. ej. creado_en, generado_por, persona_id) → 400.
const CAMPOS_PERMITIDOS = new Set([
  'evento',
  'visitante_id',
  'oferta_id',
  'programa_id',
  'universidad_id',
  'metadatos'
]);

const CLAVE_METADATOS_RE = /^[a-z][a-z0-9_]{0,39}$/;

export interface EventoValidado {
  visitanteId: string;
  datos: EventData;
}

export type ResultadoValidacion =
  | { ok: true; valor: EventoValidado }
  | { ok: false; codigo: string };

/** Objeto plano ({} o Object.create(null)), no array, no null, no instancia de clase. */
function esObjetoPlano(valor: unknown): valor is Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return false;
  const proto = Object.getPrototypeOf(valor);
  return proto === Object.prototype || proto === null;
}

/** id opcional: ausente o null → null; texto UUID → texto; cualquier otra cosa → inválido. */
function validarIdOpcional(valor: unknown): { ok: true; id: string | null } | { ok: false } {
  if (valor === undefined || valor === null) return { ok: true, id: null };
  if (typeof valor === 'string' && UUID_RE.test(valor)) return { ok: true, id: valor.toLowerCase() };
  return { ok: false };
}

/**
 * Valida `metadatos`: objeto plano y PLANO de un nivel (valores texto ≤ 500, número finito,
 * booleano o null), ≤ 10 claves snake_case y ≤ 2 KB serializado.
 * Para qué: no aceptar anidados ni contenido grande en una columna jsonb que lee el CRM.
 */
function validarMetadatos(valor: unknown): { ok: true; metadatos: Record<string, unknown> } | { ok: false; codigo: string } {
  if (valor === undefined || valor === null) return { ok: true, metadatos: {} };
  if (!esObjetoPlano(valor)) return { ok: false, codigo: 'metadatos_invalidos' };
  const claves = Object.keys(valor);
  if (claves.length > LIMITES_EVENTO.metadatosMaxClaves) return { ok: false, codigo: 'metadatos_muy_grandes' };
  for (const clave of claves) {
    if (!CLAVE_METADATOS_RE.test(clave)) return { ok: false, codigo: 'metadatos_invalidos' };
    const v = valor[clave];
    const primitivoValido =
      v === null ||
      typeof v === 'boolean' ||
      (typeof v === 'number' && Number.isFinite(v)) ||
      (typeof v === 'string' && v.length <= LIMITES_EVENTO.textoMaxCaracteres);
    if (!primitivoValido) {
      return { ok: false, codigo: typeof v === 'string' ? 'metadatos_muy_grandes' : 'metadatos_invalidos' };
    }
  }
  const bytes = new TextEncoder().encode(JSON.stringify(valor)).length;
  if (bytes > LIMITES_EVENTO.metadatosMaxBytes) return { ok: false, codigo: 'metadatos_muy_grandes' };
  return { ok: true, metadatos: { ...valor } };
}

/**
 * Valida el cuerpo JSON ya parseado del POST /api/eventos.
 * Qué hace: exige objeto plano, rechaza campos desconocidos, `evento` en la lista permitida,
 * `visitante_id` UUID obligatorio, ids opcionales UUID o null y `metadatos` acotado.
 * Para qué: fail-closed; solo pasa lo que el código del sitio realmente envía.
 */
export function validarCuerpoEvento(cuerpo: unknown): ResultadoValidacion {
  if (!esObjetoPlano(cuerpo)) return { ok: false, codigo: 'cuerpo_invalido' };
  for (const clave of Object.keys(cuerpo)) {
    if (!CAMPOS_PERMITIDOS.has(clave)) return { ok: false, codigo: 'campo_no_permitido' };
  }
  const evento = cuerpo.evento;
  if (typeof evento !== 'string' || !(EVENTOS_PERMITIDOS as readonly string[]).includes(evento)) {
    return { ok: false, codigo: 'evento_no_permitido' };
  }
  const visitante = cuerpo.visitante_id;
  if (typeof visitante !== 'string' || !UUID_RE.test(visitante)) {
    return { ok: false, codigo: 'visitante_invalido' };
  }
  const oferta = validarIdOpcional(cuerpo.oferta_id);
  const programa = validarIdOpcional(cuerpo.programa_id);
  const universidad = validarIdOpcional(cuerpo.universidad_id);
  if (oferta.ok === false || programa.ok === false || universidad.ok === false) return { ok: false, codigo: 'id_invalido' };
  const metadatos = validarMetadatos(cuerpo.metadatos);
  if (metadatos.ok === false) return { ok: false, codigo: metadatos.codigo };
  return {
    ok: true,
    valor: {
      visitanteId: visitante.toLowerCase(),
      datos: {
        tipo_evento: evento as EventType,
        oferta_id: oferta.id,
        programa_id: programa.id,
        universidad_id: universidad.id,
        metadata: metadatos.metadatos
      }
    }
  };
}

/**
 * Arma la fila que se inserta en `eventos_negocio` con los nombres REALES de columnas.
 * Qué hace: traduce el formato del cliente (`tipo_evento`, `metadata`) al esquema de la tabla
 * (`evento`, `metadatos`), pone la fecha en `creado_en` y el origen en `generado_por`.
 * Para qué: antes se enviaban `tipo_evento`, `metadata` y `fecha_evento`, que no existen en la
 * tabla (PostgREST respondía PGRST204 y el evento se perdía). Las columnas reales salen de las
 * migraciones que ya insertan en la tabla (20260830103000 y 20261018160000: evento, persona_id,
 * oportunidad_id, universidad_id, programa_id, oferta_id, metadatos, generado_por, creado_en,
 * visitante_id) y de docs/BUSCOEDU_DATA_DICTIONARY.md. Función pura para poder probarla.
 * Desde 2026-10-19 la usa SOLO el servidor (POST /api/eventos), que fija `creado_en` y `generado_por`.
 */
export function construirFilaEvento(
  visitorId: string,
  eventData: EventData,
  ahora: Date = new Date(),
  generadoPor: string | null = null
) {
  return {
    visitante_id: visitorId,
    evento: eventData.tipo_evento,
    oferta_id: eventData.oferta_id || null,
    programa_id: eventData.programa_id || null,
    universidad_id: eventData.universidad_id || null,
    // `metadatos` es jsonb NOT NULL (default '{}', confirmado por BD 2026-10-18): enviar null
    // haría fallar el insert, así que sin metadata se manda un objeto vacío.
    metadatos: eventData.metadata || {},
    // `generado_por` es nullable; el servidor pone 'web' para distinguir estos eventos de los de
    // Demo WApp ('demowapp_ba031', 'demowapp_push_processor') y de las funciones SQL.
    generado_por: generadoPor,
    // `creado_en` reemplaza a `fecha_evento` (columna inexistente). Lo fija el servidor (no el
    // navegador), igual que las funciones SQL y Demo WApp.
    creado_en: ahora.toISOString()
  };
}
