/**
 * Precios que puede ver el estudiante (portal, NaIA, WhatsApp).
 *
 * Qué: única puerta para decidir si un precio de `precios_oferta` se puede mostrar y, si no,
 * qué texto se muestra en su lugar (T17 «Precio no disponible…», copy-bot-wa-v1).
 * Por qué: BD cargó el 2026-10-19 187 precios PENDIENTES (Areandina 102, UNIR 37, Asturias 48):
 * `valor` trae el monto real publicado por la IES, pero `periodicidad` es NULL (o `concepto_cobro`
 * se cargó como 'otro'), `estado_validacion = 'pendiente'`, `es_precio_activo = true` y
 * `descripcion_condiciones` empieza por «MARCA: … confirmar antes de mostrar.». El monto NO es
 * un marcador vacío: si una pantalla lo leyera tal cual, mostraría un precio sin confirmar.
 * Hoy ninguna superficie del estudiante lee `precios_oferta`; esta puerta es para que la
 * primera que lo haga no exponga un precio pendiente.
 */
import { T17_PRECIO } from './whatsapp/copy';

// Bloque: forma mínima de una fila de `precios_oferta` (migración 20260129000700).
export interface PrecioOfertaFila {
  valor?: number | string | null;
  moneda?: string | null;
  periodicidad?: string | null;
  concepto_cobro?: string | null;
  descripcion_condiciones?: string | null;
  estado_validacion?: string | null;
  es_precio_activo?: boolean | null;
  vigente_desde?: string | null;
  vigente_hasta?: string | null;
}

// Bloque: texto que ve el estudiante cuando no hay precio mostrable. Se reusa T17 de copy.ts
// (fuente única del copy) para no duplicar la frase.
export const TEXTO_PRECIO_NO_DISPONIBLE = T17_PRECIO;

// Bloque: prefijo con el que BD marca los precios por confirmar en `descripcion_condiciones`.
const PREFIJO_MARCA = /^\s*marca\s*:/i;

// Bloque: ¿el precio está pendiente? Pendiente = nota «MARCA:» O estado distinto de 'validado'.
// Por qué: la nota y el estado van juntos en la carga de BD, pero se revisan los dos por si uno
// de ellos se corrige a mano sin el otro (fail-closed: ante la duda, no se muestra).
export function esPrecioPendiente(precio: PrecioOfertaFila | null | undefined): boolean {
  if (!precio) return true;
  if (PREFIJO_MARCA.test(precio.descripcion_condiciones || '')) return true;
  return (precio.estado_validacion || '').trim().toLowerCase() !== 'validado';
}

// Bloque: ¿se puede mostrar al estudiante? Además de no estar pendiente: activo, con monto > 0,
// con periodicidad y vigente hoy. Es la misma regla que la policy propuesta en BA-020
// (supabase/ops/20260927_ba020_estrechar_lectura_publica_precios.sql) más la nota MARCA.
export function precioMostrable(precio: PrecioOfertaFila | null | undefined, hoyIso: string): boolean {
  if (!precio || esPrecioPendiente(precio)) return false;
  if (precio.es_precio_activo !== true) return false;
  const valor = Number(precio.valor);
  if (!Number.isFinite(valor) || valor <= 0) return false;
  if (!(precio.periodicidad || '').trim()) return false;
  if (precio.vigente_desde && precio.vigente_desde > hoyIso) return false;
  if (precio.vigente_hasta && precio.vigente_hasta < hoyIso) return false;
  return true;
}

// Bloque: resultado para pantalla. Si no es mostrable NO se devuelve el monto (ni siquiera en un
// campo oculto): solo el texto T17. Así ninguna superficie puede filtrarlo por error.
export type PrecioParaEstudiante =
  | { visible: false; texto: string }
  | { visible: true; valor: number; moneda: string; periodicidad: string };

export function precioParaEstudiante(
  precio: PrecioOfertaFila | null | undefined,
  hoyIso: string
): PrecioParaEstudiante {
  if (!precio || !precioMostrable(precio, hoyIso)) {
    return { visible: false, texto: TEXTO_PRECIO_NO_DISPONIBLE };
  }
  return {
    visible: true,
    valor: Number(precio.valor),
    moneda: (precio.moneda || 'COP').trim(),
    periodicidad: String(precio.periodicidad).trim()
  };
}

// Bloque: claves de precio que nunca deben llegar al contexto de NaIA desde el navegador.
// Por qué: /api/naia valida el id de cada oferta de `ofertas_relevantes` pero pasa el objeto
// tal como lo mandó el cliente; un campo de precio inyectado (o uno futuro sin validar) llegaría
// al modelo. Se quitan por nombre, en cualquier nivel.
const CLAVE_PRECIO = /(precio|valor|costo|tarifa|matricula|matrícula|price|monto)/i;
// Bloque: claves que contienen esas palabras pero no son precio (duración del programa).
const CLAVES_NO_PRECIO = new Set(['duracion_valor', 'duracion_unidad']);

export function quitarPreciosDeContexto<T>(dato: T): T {
  if (Array.isArray(dato)) return dato.map((item) => quitarPreciosDeContexto(item)) as unknown as T;
  if (dato && typeof dato === 'object') {
    const limpio: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(dato as Record<string, unknown>)) {
      if (CLAVE_PRECIO.test(clave) && !CLAVES_NO_PRECIO.has(clave.toLowerCase())) continue;
      limpio[clave] = quitarPreciosDeContexto(valor);
    }
    return limpio as T;
  }
  return dato;
}
