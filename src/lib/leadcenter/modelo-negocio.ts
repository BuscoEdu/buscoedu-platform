/**
 * Modelo de negocio de una oferta / oportunidad (por_lead | por_inscrito | sin definir).
 *
 * Qué: normaliza el valor de `ofertas_academicas.modelo_negocio` y de
 * `oportunidades.modelo_negocio_snapshot`, y da la etiqueta que ve Lead Center.
 * Por qué (decisión de producto 2026-10-19): NULL = «sin definir». No se asume
 * `por_inscrito` ni se calcula ningún cobro para una oferta sin modelo. Antes el código
 * hacía `modelo_negocio || 'por_inscrito'` y la oportunidad quedaba marcada como cobrable
 * por inscrito sin que nadie lo hubiera decidido.
 */

// Bloque: valores válidos. Son los mismos del CHECK de la BD
// (ofertas_academicas_modelo_negocio_check y oportunidades_modelo_negocio_snapshot_check,
// migración 20260829120200), que además admiten NULL.
export type ModeloNegocio = 'por_lead' | 'por_inscrito';

// Bloque: etiqueta única para el modelo ausente, para que Lead Center no muestre «—» ni invente uno.
export const ETIQUETA_MODELO_SIN_DEFINIR = 'Sin definir';

// Bloque: normalizar. Cualquier valor que no sea uno de los dos modelos (NULL, vacío, texto raro)
// se trata como «sin definir» (null). Por qué: escribir null es válido en las columnas de la BD y
// un modelo desconocido no puede disparar asignación ni cobro.
export function normalizarModeloNegocio(valor: unknown): ModeloNegocio | null {
  const texto = typeof valor === 'string' ? valor.trim().toLowerCase() : '';
  if (texto === 'por_lead' || texto === 'por_inscrito') return texto;
  return null;
}

// Bloque: etiqueta para pantalla. Conserva el código tal cual para los modelos definidos (así
// se veía antes en Lead Center) y muestra «Sin definir» cuando no hay modelo.
export function etiquetaModeloNegocio(valor: unknown): string {
  return normalizarModeloNegocio(valor) ?? ETIQUETA_MODELO_SIN_DEFINIR;
}

// Bloque: ¿el modelo permite calcular un cobro? Solo un modelo definido. Por qué: con modelo
// «sin definir» no se calcula ni se marca ningún cobro (ni por lead ni por inscrito).
export function modeloGeneraCobro(valor: unknown): boolean {
  return normalizarModeloNegocio(valor) !== null;
}
