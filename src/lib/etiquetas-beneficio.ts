/**
 * Código de `tipos_beneficio` → frase para el estudiante.
 * Normaliza con `String(codigo ?? '').trim().toLowerCase()` antes de buscar.
 * null, undefined o vacío después de trim → null. No se inventa un beneficio.
 * «Beneficio disponible» solo si el código no está vacío y no tiene etiqueta propia:
 * `otro` y cualquier código desconocido. Nunca se devuelve el código crudo.
 * Si el valor ya es una etiqueta de este mapa, se conserva: NaIA y el Demo WApp
 * encadenan el helper y no deben pisarla con el genérico.
 *
 * Catálogo: supabase/migrations/20260129000400_create_tipos_beneficio.sql
 * (7 códigos en minúscula; en las ofertas llegan en MAYÚSCULA).
 * El mapa exportado es `ETIQUETAS_BENEFICIO`.
 */

const BENEFICIO_DISPONIBLE = 'Beneficio disponible';

export const ETIQUETAS_BENEFICIO: Readonly<Record<string, string>> = {
  beca_postulacion: 'Beca por postulación',
  beca_apropiacion_directa: 'Beca directa (sin postulación)',
  descuento: 'Descuento',
  financiacion: 'Financiación',
  beneficio_convenio: 'Beneficio por convenio',
  beneficio_temporal: 'Beneficio temporal',
  otro: BENEFICIO_DISPONIBLE
};

const ETIQUETA_YA_RESUELTA = new Map<string, string>(
  Object.values(ETIQUETAS_BENEFICIO).map((etiqueta) => [etiqueta.toLowerCase(), etiqueta])
);

export function etiquetaBeneficio(codigo: string | null | undefined): string | null {
  const clave = String(codigo ?? '').trim().toLowerCase();
  if (!clave) return null;
  return ETIQUETAS_BENEFICIO[clave] ?? ETIQUETA_YA_RESUELTA.get(clave) ?? BENEFICIO_DISPONIBLE;
}
