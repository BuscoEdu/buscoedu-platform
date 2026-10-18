/**
 * E1 · A7, B1, P5 de UX — Estados de proveedor y modelo para el panel.
 *
 * Qué hace:
 *   - `pruebaVigente`: la última prueba fue exitosa y es posterior a los últimos cambios
 *     de conexión del modelo y del proveedor y al último guardado de clave; la clave no
 *     está revocada.
 *   - `estadoPanel`: borrador / configurado / probado / encendido / error.
 *   - `encendido`: `estado = 'activo'` y `activo = true` (lo mismo que mira el motor BA-034).
 * Para qué: que «Encender» exija una prueba válida (A7), que el agente solo vea modelos
 * encendidos y probados (B1) y que el panel muestre «configurado ≠ en uso» (P5).
 * Módulo puro: sin BD.
 */

export interface PruebaConexion {
  exitosa: boolean;
  latencia_ms: number | null;
  modelo_respondio: string | null;
  motivo_codigo: string | null;
  creado_en: string;
}

export interface MarcasVigencia {
  /** despliegues_ia.config_actualizada_en (N2) o, si aún no existe, actualizado_en. */
  modelo_config_en: string | null;
  /** proveedores_ia.config_actualizada_en (N2) o null. */
  proveedor_config_en: string | null;
  clave_actualizada_en: string | null;
  clave_revocada_en: string | null;
}

const ms = (t: string | null | undefined) => (t ? Date.parse(t) : Number.NEGATIVE_INFINITY);

export function pruebaVigente(prueba: PruebaConexion | null | undefined, marcas: MarcasVigencia): boolean {
  if (!prueba || prueba.exitosa !== true) return false;
  if (marcas.clave_revocada_en) return false;
  const t = ms(prueba.creado_en);
  return t > ms(marcas.modelo_config_en) && t > ms(marcas.proveedor_config_en) && t > ms(marcas.clave_actualizada_en);
}

export function estaEncendido(fila: { estado?: string | null; activo?: boolean | null }): boolean {
  return fila.activo !== false && (fila.estado ?? 'activo') === 'activo';
}

export type EstadoPanel = 'borrador' | 'configurado' | 'probado' | 'encendido' | 'error';

export function estadoPanel(p: {
  clave_configurada: boolean;
  modelos: number;
  alguna_prueba_vigente: boolean;
  ultima_prueba_fallida: boolean;
  encendido: boolean;
  circuito_abierto: boolean;
}): EstadoPanel {
  if (p.circuito_abierto || p.ultima_prueba_fallida) return 'error';
  if (!p.clave_configurada || p.modelos === 0) return 'borrador';
  if (!p.alguna_prueba_vigente) return 'configurado';
  return p.encendido ? 'encendido' : 'probado';
}
