/**
 * BA-039 — Canales IA sin lista fija en código (criterios F1 y F2 de E1).
 *
 * Qué hace: decide si un `codigo_canal` pedido por la API es usable leyendo
 * los canales con `canales_ia.activo = true` a través de una interfaz
 * (`FuenteCanalesIa`). No hay lista `['web','whatsapp']` en código.
 * Para qué: encender o apagar un canal desde el panel sin redeploy, y que el
 * rechazo sea por defecto (fail-closed): canal desconocido, inactivo, error de
 * BD o tabla sin canales activos → rechazo, nunca caída silenciosa a `web`.
 *
 * Este módulo es puro (sin Supabase ni alias `@/`) para que los tests corran
 * sin red ni BD. La implementación real de la fuente vive en `canales.ts`.
 */

import { AgenteEjecucionError } from './errores';

/** Errores que la API debe devolver tal cual, sin fallback conversacional ni canal web. */
export const CODIGOS_ERROR_CANAL_FAIL_CLOSED = [
  'canal_invalido',
  'canal_no_encontrado',
  'canal_no_configurado',
  'agente_canal_no_asignado',
  // BA-039: no se pudo leer `canales_ia` o no hay ninguno activo → rechazo.
  'canales_no_disponibles'
] as const;

/** ¿Es un error de canal que la API debe devolver tal cual (sin fallback conversacional)? */
export function esErrorCanalFailClosed(error: unknown): error is AgenteEjecucionError {
  return (
    error instanceof AgenteEjecucionError &&
    (CODIGOS_ERROR_CANAL_FAIL_CLOSED as readonly string[]).includes(error.codigo)
  );
}

/**
 * Estado HTTP de un error de canal.
 * 400 si el cliente pidió un código ilegible, desconocido o inactivo (igual que BA-029);
 * 503 si la lista de canales no se pudo leer (BA-039); 422 si el canal existe pero no está usable.
 */
export function estadoHttpErrorCanal(codigo: string): number {
  if (codigo === 'canal_invalido') return 400;
  if (codigo === 'canales_no_disponibles') return 503;
  return 422;
}

/** Canal por defecto cuando el cliente omite `codigo_canal` (contrato histórico de POST /api/naia). */
export const CANAL_POR_DEFECTO = 'web';

/** Tiempo que se reutiliza la lista de canales activos. Corto para que apagar un canal aplique en ≤ 60 s (C1). */
export const TTL_CANALES_MS = 30_000;

/** Formato aceptado de un código de canal antes de consultar la BD (evita consultas con basura). */
const FORMATO_CODIGO_CANAL = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/**
 * Contrato de acceso a datos de canales.
 * Qué hace: devuelve los códigos de los canales activos.
 * Para qué: aislar la BD; los tests pasan una fuente en memoria y la app la de Supabase.
 * Debe lanzar un error si no puede leer (eso se traduce en rechazo, no en lista vacía).
 */
export interface FuenteCanalesIa {
  listarCanalesActivos(): Promise<readonly string[]>;
}

/** Registro con caché corta sobre una fuente. */
export interface RegistroCanalesIa {
  /** Códigos activos normalizados. Lanza `canales_no_disponibles` si la fuente falla o no hay ninguno. */
  canalesActivos(): Promise<ReadonlySet<string>>;
  /** Olvida la caché (útil en tests o tras editar canales desde el panel). */
  invalidar(): void;
}

/** Normaliza un código de canal: sin espacios en los bordes y en minúsculas. */
export function normalizarCodigoCanal(valor: string): string {
  return valor.trim().toLowerCase();
}

/**
 * Crea un registro de canales con caché corta.
 * Qué hace: consulta la fuente, normaliza y guarda el resultado `ttlMs`.
 * Solo se guarda en caché una lectura exitosa y no vacía; un error o una
 * lista vacía no se cachea y se rechaza (fail-closed). Lecturas simultáneas
 * comparten la misma consulta.
 * Para qué: no golpear la BD en cada mensaje sin perder la regla fail-closed.
 */
export function crearRegistroCanales(
  fuente: FuenteCanalesIa,
  opciones: { ttlMs?: number; ahora?: () => number } = {}
): RegistroCanalesIa {
  const ttlMs = opciones.ttlMs ?? TTL_CANALES_MS;
  const ahora = opciones.ahora ?? Date.now;
  let cache: { valor: ReadonlySet<string>; vence: number } | null = null;
  let enCurso: Promise<ReadonlySet<string>> | null = null;

  // Bloque de lectura real: cualquier fallo o lista vacía se convierte en el mismo error fail-closed.
  async function leer(): Promise<ReadonlySet<string>> {
    let codigos: readonly string[];
    try {
      codigos = await fuente.listarCanalesActivos();
    } catch {
      throw new AgenteEjecucionError(
        'No se pudieron leer los canales activos. Intenta de nuevo en un momento.',
        'canales_no_disponibles'
      );
    }
    const activos = new Set(
      (Array.isArray(codigos) ? codigos : [])
        .filter((c): c is string => typeof c === 'string')
        .map(normalizarCodigoCanal)
        .filter(Boolean)
    );
    if (activos.size === 0) {
      throw new AgenteEjecucionError(
        'No hay canales activos configurados.',
        'canales_no_disponibles'
      );
    }
    cache = { valor: activos, vence: ahora() + ttlMs };
    return activos;
  }

  return {
    // Bloque de caché: devuelve la lista vigente o comparte la consulta en curso.
    async canalesActivos() {
      if (cache && cache.vence > ahora()) return cache.valor;
      if (!enCurso) {
        enCurso = leer().finally(() => {
          enCurso = null;
        });
      }
      return enCurso;
    },
    invalidar() {
      cache = null;
    }
  };
}

/** Lista legible para el mensaje de error: "web o whatsapp", "a, b o c". */
function listarParaHumanos(codigos: Iterable<string>): string {
  const lista = [...codigos].sort();
  if (lista.length <= 1) return lista.join('');
  return `${lista.slice(0, -1).join(', ')} o ${lista[lista.length - 1]}`;
}

/**
 * Resuelve `codigo_canal` pedido por la API contra los canales activos de BD.
 *
 * - ausente o null → `web` (contrato histórico), y también debe estar activo
 * - texto → se normaliza (mayúsculas y espacios) y debe estar activo en BD
 * - no texto, vacío, formato raro, desconocido o inactivo → `canal_invalido` (400, igual que BA-029)
 * - error de BD o ningún canal activo → `canales_no_disponibles` (503)
 *
 * Para qué: el mismo rechazo de hoy para `email`/`llamada` (F2) pero sin lista fija (F1).
 */
export async function resolverCodigoCanal(valor: unknown, registro: RegistroCanalesIa): Promise<string> {
  // Bloque 1: validar la forma del dato sin tocar la BD.
  let codigo: string;
  if (valor === undefined || valor === null) {
    codigo = CANAL_POR_DEFECTO;
  } else if (typeof valor !== 'string') {
    throw new AgenteEjecucionError(
      'codigo_canal debe ser el código de texto de un canal activo.',
      'canal_invalido'
    );
  } else {
    codigo = normalizarCodigoCanal(valor);
  }

  // Bloque 2: leer los canales activos (si falla, el error ya es fail-closed).
  const activos = await registro.canalesActivos();

  // Bloque 3: solo pasa un código bien formado y presente en la lista activa.
  if (!FORMATO_CODIGO_CANAL.test(codigo) || !activos.has(codigo)) {
    const mostrado = codigo.slice(0, 40) || '(vacío)';
    throw new AgenteEjecucionError(
      `codigo_canal no soportado: ${mostrado}. Use ${listarParaHumanos(activos)}.`,
      'canal_invalido'
    );
  }
  return codigo;
}

/**
 * Último segmento de un código de componente (`contexto_canal_whatsapp` → `whatsapp`).
 * Convención de Centro IA (BA-029) para atar un componente a un canal.
 */
export function canalDelCodigoComponente(codigo: string | null | undefined): string {
  return (codigo || '').trim().toLowerCase().split('_').filter(Boolean).pop() || '';
}

/**
 * Un componente `tipo_contexto=canal` entra al prompt solo si su código
 * identifica el canal activo.
 *
 * Convención de Centro IA: el último segmento de `codigo` (separado por `_`)
 * es el `canales_ia.codigo`. Ejemplos: `contexto_canal_web`, `contexto_canal_whatsapp`.
 * El resto de tipos (identidad, reglas, formato…) no se filtra.
 * Un bloque de canal mal nombrado se excluye en todos los canales: no se mezcla.
 * (BA-029; BA-039 solo lo mueve a este módulo puro para poder testearlo sin BD.)
 */
export function componenteContextoAplicaAlCanal(
  componente: { tipo_contexto?: string | null; codigo?: string | null },
  codigoCanal: string
): boolean {
  const tipo = (componente.tipo_contexto || '').trim().toLowerCase();
  if (tipo !== 'canal') return true;

  const canal = codigoCanal.trim().toLowerCase();
  const ultimoSegmento = canalDelCodigoComponente(componente.codigo);
  if (!ultimoSegmento || !canal) return false;
  return ultimoSegmento === canal;
}
