/**
 * Traduce el puntaje comercial (0–110) a una temperatura visible. La regla es
 * deliberadamente centralizada para que tablero, ficha y copiloto no discrepen.
 */
export type TemperaturaComercial = 'muy_fria' | 'fria' | 'tibia' | 'caliente' | 'muy_caliente';

export const TEMPERATURA_META: Record<TemperaturaComercial, { etiqueta: string; clase: string }> = {
  muy_fria: { etiqueta: 'Muy fría', clase: 'bg-slate-100 text-slate-700' },
  fria: { etiqueta: 'Fría', clase: 'bg-sky-100 text-sky-700' },
  tibia: { etiqueta: 'Tibia', clase: 'bg-amber-100 text-amber-700' },
  caliente: { etiqueta: 'Caliente', clase: 'bg-orange-100 text-orange-700' },
  muy_caliente: { etiqueta: 'Muy caliente', clase: 'bg-red-100 text-red-700' }
};

export function normalizarPuntajeSalud(valor: number | null | undefined): number {
  return Math.min(110, Math.max(0, Number.isFinite(Number(valor)) ? Number(valor) : 40));
}

export function temperaturaDesdePuntaje(valor: number | null | undefined): TemperaturaComercial {
  const puntaje = normalizarPuntajeSalud(valor);
  if (puntaje < 20) return 'muy_fria';
  if (puntaje < 40) return 'fria';
  if (puntaje < 65) return 'tibia';
  if (puntaje < 85) return 'caliente';
  return 'muy_caliente';
}
