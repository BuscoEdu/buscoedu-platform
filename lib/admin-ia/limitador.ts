/**
 * E1 · BA-037 M4 — Límite de pruebas de conexión: máx. 6 por minuto por modelo.
 * Qué hace: ventana deslizante en memoria (por instancia del servidor).
 * Para qué: que «Probar conexión» no se use como forma de gastar o de saturar al
 * proveedor. Las pruebas no cuentan para el tope (canal `panel`), por eso se limitan aquí.
 * Módulo puro.
 */
export const PRUEBAS_POR_MINUTO = 6;

export function crearLimitadorPruebas(opciones: { maximo?: number; ventanaMs?: number; ahora?: () => number } = {}) {
  const maximo = opciones.maximo ?? PRUEBAS_POR_MINUTO;
  const ventana = opciones.ventanaMs ?? 60_000;
  const ahora = opciones.ahora ?? Date.now;
  const marcas = new Map<string, number[]>();
  return (clave: string): boolean => {
    const t = ahora();
    const recientes = (marcas.get(clave) ?? []).filter((x) => t - x < ventana);
    if (recientes.length >= maximo) {
      marcas.set(clave, recientes);
      return false;
    }
    recientes.push(t);
    marcas.set(clave, recientes);
    return true;
  };
}
