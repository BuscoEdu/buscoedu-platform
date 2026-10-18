/**
 * BA-032 · Límite de mensajes por número.
 *
 * Interfaz reemplazable: hoy hay una implementación en memoria (válida por
 * instancia; en serverless cada instancia cuenta por separado). Para producción
 * con tráfico real conviene una implementación compartida (p. ej. tabla o KV).
 */

export interface LimitadorTasa {
  /** true si este número todavía puede ser atendido en la ventana actual. */
  permitir(clave: string, ahoraMs: number): boolean;
}

// Bloque: ventana deslizante simple en memoria.
export function crearLimitadorMemoria(maxPorVentana = 20, ventanaMs = 60_000): LimitadorTasa {
  const marcas = new Map<string, number[]>();
  return {
    permitir(clave: string, ahoraMs: number): boolean {
      const desde = ahoraMs - ventanaMs;
      const previas = (marcas.get(clave) || []).filter((t) => t > desde);
      if (previas.length >= maxPorVentana) {
        marcas.set(clave, previas);
        return false;
      }
      previas.push(ahoraMs);
      marcas.set(clave, previas);
      // Limpieza básica para que el mapa no crezca sin control.
      if (marcas.size > 5000) {
        for (const [k, v] of marcas) {
          if (!v.some((t) => t > desde)) marcas.delete(k);
        }
      }
      return true;
    }
  };
}
