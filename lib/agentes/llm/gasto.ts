/**
 * E1 · BA-038 — Control del tope de gasto diario antes de llamar a la IA (D5–D7).
 *
 * Qué hace, antes de cada llamada:
 *   1. Canal `panel` (pruebas de conexión del admin): NO se consulta el gasto ni se
 *      registran alertas; no cuenta para ningún tope (solo lo inicia super_admin).
 *   2. Cualquier otro canal: `fn_ia_gasto_hoy(canal)`.
 *        - `cortado` → no se llama a la IA (D6), se registra la alerta y el estudiante
 *          recibe el texto de C3.
 *        - `alerta` → se registra la alerta (la BD no la duplica en el día) y se sigue.
 *        - `normal` → se sigue.
 *   3. Si la consulta falla o responde `ok:false` (incluido `canal_inexistente`) →
 *      fail-closed: sin IA + C3 (decisión del Orquestador: sin saber el gasto no se
 *      puede garantizar «nunca sin límite»).
 * Si registrar la alerta falla, solo se avisa en el log: no cambia la decisión.
 * Para qué: que un canal nunca gaste más que su tope y que el corte no afecte a los demás.
 * Módulo puro: la consulta y el registro llegan inyectados.
 */

/** Canal de las pruebas de conexión del panel (no existe en `canales_ia`, ver N8). */
export const CANAL_PANEL = 'panel';

export interface EstadoGastoCanal {
  ok: boolean;
  error?: string;
  estado?: 'normal' | 'alerta' | 'cortado';
  gasto_usd?: number;
  tope_diario_usd?: number;
  pct_usado?: number;
  motivos_alerta?: string[];
}

export interface ControlGasto {
  /** `fn_ia_gasto_hoy(p_canal_codigo)`. */
  consultar(canalCodigo: string): Promise<EstadoGastoCanal>;
  /** `fn_ia_registrar_alerta_gasto(p_canal_codigo)`. */
  registrarAlerta(canalCodigo: string): Promise<void>;
}

export type DecisionGasto =
  | { permitir: true; estado: EstadoGastoCanal | null }
  | { permitir: false; motivo: 'tope_diario' | 'gasto_no_disponible'; estado: EstadoGastoCanal | null };

export async function verificarGastoAntesDeIa(
  control: ControlGasto,
  canalCodigo: string,
  avisar: (m: string) => void = (m) => console.warn(m)
): Promise<DecisionGasto> {
  // Bloque 1: pruebas del panel, fuera del tope.
  if (canalCodigo === CANAL_PANEL) return { permitir: true, estado: null };

  // Bloque 2: consulta del gasto (fail-closed si falla).
  let estado: EstadoGastoCanal;
  try {
    estado = await control.consultar(canalCodigo);
  } catch {
    avisar(`[BA-038 tope] No se pudo consultar el gasto de ${canalCodigo}; se bloquea la IA (fail-closed).`);
    return { permitir: false, motivo: 'gasto_no_disponible', estado: null };
  }
  if (!estado || estado.ok !== true || !estado.estado) {
    avisar(`[BA-038 tope] Gasto no disponible para ${canalCodigo} (${estado?.error ?? 'sin_estado'}); se bloquea la IA (fail-closed).`);
    return { permitir: false, motivo: 'gasto_no_disponible', estado: estado ?? null };
  }

  // Bloque 3: alerta o corte → registrar la alerta sin bloquear por ello.
  if (estado.estado === 'cortado' || estado.estado === 'alerta') {
    try {
      await control.registrarAlerta(canalCodigo);
    } catch {
      avisar(`[BA-038 tope] No se pudo registrar la alerta de ${canalCodigo}.`);
    }
  }
  if (estado.estado === 'cortado') return { permitir: false, motivo: 'tope_diario', estado };
  return { permitir: true, estado };
}
