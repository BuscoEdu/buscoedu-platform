/** Entero visible del catálogo. No redondea hacia un dato que no vino. */
export function formatoEntero(valor: number): string {
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(valor);
}

/** Una cifra solo se pinta si es un entero positivo. El 0 no es un dato. */
export function cifraPositiva(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0;
}
