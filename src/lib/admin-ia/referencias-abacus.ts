// Referencias de Abacus en /admin/ia/multiproveedor (módulo puro, sin React ni imports con alias).
// Qué hace: decide qué texto ve el panel para un modelo o proveedor Abacus: el subtítulo del modelo
// y las dos referencias del despliegue («Despliegue: ABACUS_NAIA_DEPLOYMENT_ID», «Token: …»).
// Para qué: en Abacus la API manda `modelo` en null (Abacus se identifica por su despliegue, no por
// un nombre de modelo), y el panel mostraba «Sin modelo» aunque el despliegue sí estaba configurado.
// Ahora se muestran los NOMBRES de las variables que manda la API (P4, BE 15ab441), nunca valores.
// Los demás proveedores no cambian: siguen mostrando su modelo con etiquetaModelo().

import { etiquetaModelo, etiquetaReferenciaAbacus } from './etiquetas';
import type { ModeloApi, ReferenciasAbacusApi } from './tipos';

/** Texto cuando el campo llega en null: no es un error, es que aún no se guardó la referencia. */
export const SIN_REFERENCIA_ABACUS = 'Sin referencia configurada';
/** Texto cuando llega algo que no parece un nombre de variable: por seguridad no se muestra. */
export const REFERENCIA_NO_VALIDA = 'Referencia no válida: vuelve a guardarla en el asistente';
/** Subtítulo de un modelo Abacus sin `modelo`: lo identifica su despliegue. */
export const SUBTITULO_DESPLIEGUE_ABACUS = 'Despliegue de Abacus AI';

// Misma regla que el servidor (`nombreEnvPermitido`): solo nombres LLM_* o ABACUS_NAIA_*.
// Defensa adicional en el navegador: si por un error llegara un valor (no un nombre), no se pinta.
const NOMBRE_VARIABLE = /^(LLM_[A-Z0-9_]+|ABACUS_NAIA_[A-Z0-9_]+)$/;

export type EstadoReferencia = 'configurada' | 'sin_referencia' | 'no_valida';

export interface LineaReferenciaAbacus {
  campo: keyof ReferenciasAbacusApi;
  /** Etiqueta en español («Despliegue», «Token»). */
  etiqueta: string;
  /** Nombre de la variable de entorno, solo si es un nombre válido; si no, null. */
  nombre: string | null;
  /** Texto listo para mostrar: el nombre o el mensaje que corresponda. */
  texto: string;
  estado: EstadoReferencia;
}

const CAMPOS: (keyof ReferenciasAbacusApi)[] = ['identificador_externo', 'referencia_secreto'];

/**
 * Qué hace: convierte `abacus` (proveedor o modelo) en las dos líneas que ve el panel, siempre en
 * el mismo orden (Despliegue, Token). Si `refs` llega null/undefined, ambas quedan «Sin referencia
 * configurada».
 * Para qué: un único punto que garantiza «nombres sí, valores nunca» y «vacío ≠ error».
 */
export function lineasReferenciasAbacus(refs: ReferenciasAbacusApi | null | undefined): LineaReferenciaAbacus[] {
  return CAMPOS.map((campo) => {
    const crudo = typeof refs?.[campo] === 'string' ? refs[campo]!.trim() : '';
    const etiqueta = etiquetaReferenciaAbacus(campo);
    if (!crudo) return { campo, etiqueta, nombre: null, texto: SIN_REFERENCIA_ABACUS, estado: 'sin_referencia' };
    if (!NOMBRE_VARIABLE.test(crudo)) return { campo, etiqueta, nombre: null, texto: REFERENCIA_NO_VALIDA, estado: 'no_valida' };
    return { campo, etiqueta, nombre: crudo, texto: crudo, estado: 'configurada' };
  });
}

/** Texto de una línea en una sola frase: «Despliegue: ABACUS_NAIA_DEPLOYMENT_ID». */
export function textoLineaReferencia(l: LineaReferenciaAbacus): string {
  return `${l.etiqueta}: ${l.texto}`;
}

/**
 * Qué hace: dice si un proveedor es Abacus por su adaptador, su preset o porque la API mandó `abacus`.
 * Para qué: mostrar el bloque de referencias solo en Abacus (los demás proveedores no cambian).
 */
export function esProveedorAbacus(p: { tipo_adaptador?: string | null; preset_codigo?: string | null; abacus?: ReferenciasAbacusApi | null }): boolean {
  return p.tipo_adaptador === 'abacus' || p.preset_codigo === 'abacus_ai' || (p.abacus !== undefined && p.abacus !== null);
}

/**
 * Qué hace: dice si un modelo es de Abacus. La API solo manda `modelos[i].abacus` en Abacus; el
 * código del proveedor sirve de respaldo (p. ej. si la API aún no manda el campo).
 */
export function esModeloAbacus(m: Pick<ModeloApi, 'proveedor_codigo'> & { abacus?: ReferenciasAbacusApi | null }): boolean {
  return m.abacus !== undefined || m.proveedor_codigo === 'abacus_ai';
}

/**
 * Qué hace: subtítulo de la tarjeta del modelo.
 * - Con `modelo` (cualquier proveedor): el modelo legible, igual que antes (etiquetaModelo).
 * - Abacus sin `modelo`: «Despliegue de Abacus AI» (sus referencias van debajo).
 * - Otro proveedor sin `modelo`: «Sin modelo», igual que antes.
 * Causa raíz que corrige: el subtítulo usaba solo `m.modelo`, que en Abacus llega en null.
 */
export function subtituloModelo(m: Pick<ModeloApi, 'modelo' | 'proveedor_codigo'> & { abacus?: ReferenciasAbacusApi | null }): string {
  if (String(m.modelo ?? '').trim()) return etiquetaModelo(m.modelo);
  return esModeloAbacus(m) ? SUBTITULO_DESPLIEGUE_ABACUS : etiquetaModelo(m.modelo);
}

/**
 * Qué hace: opciones del selector «Cargar precio» por modelo. Deja fuera los modelos sin `modelo`
 * (los de Abacus): el servidor guarda su precio con modelo «*», que es la opción «Todo el
 * proveedor» que ya está arriba. Para qué: no mostrar opciones «Sin modelo» repetidas.
 */
export function opcionesPrecioPorModelo(modelos: Pick<ModeloApi, 'id' | 'modelo'>[]): { id: string; valor: string; etiqueta: string }[] {
  return modelos
    .filter((m) => String(m.modelo ?? '').trim())
    .map((m) => ({ id: m.id, valor: String(m.modelo).trim(), etiqueta: etiquetaModelo(m.modelo) }));
}
