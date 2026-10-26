/**
 * BA-032 · Comandos del usuario y horario de asesores.
 *
 * BAJA / STOP → deja de escribir (opt-out registrado).
 * ASESOR → pasa a humano con aviso de horario.
 * ALTA → vuelve a recibir respuestas después de una baja.
 * MENU → sale del modo asesor y vuelve con NaIA.
 */

export type ComandoUsuario = 'baja' | 'asesor' | 'alta' | 'menu';

// Bloque: normaliza (minúsculas, sin tildes, sin signos) para comparar comandos.
export function plegarComando(texto: string): string {
  return (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BAJA = new Set(['baja', 'stop', 'darme de baja', 'dar de baja', 'cancelar suscripcion', 'unsubscribe', 'no me escriban mas']);
const ASESOR = new Set(['asesor', 'asesora', 'humano', 'hablar con un asesor', 'hablar con asesor', 'quiero un asesor', 'persona']);
const ALTA = new Set(['alta', 'darme de alta']);
const MENU = new Set(['menu', 'naia', 'volver']);

/** Solo el mensaje completo cuenta como comando: "stop" sí, "no paro de estudiar" no. */
export function detectarComando(texto: string): ComandoUsuario | null {
  const t = plegarComando(texto);
  if (!t) return null;
  if (BAJA.has(t)) return 'baja';
  if (ASESOR.has(t)) return 'asesor';
  if (ALTA.has(t)) return 'alta';
  if (MENU.has(t)) return 'menu';
  if (pideAsesor(t)) return 'asesor';
  return null;
}

// Bloque: S17 · pedir una persona dentro de una frase («quiero hablar con alguien») pasa a asesor a la 1.ª vez,
// antes de la búsqueda y de clasificarTexto. \b evita falsos positivos como «desarrollo personal».
const PATRON_ASESOR = /\b(asesor|asesora|alguien|persona|humano|hablar con)\b/;

export function pideAsesor(texto: string): boolean {
  return PATRON_ASESOR.test(plegarComando(texto));
}

/**
 * Bloque: horario de asesores en hora de Colombia (UTC−5, sin horario de verano).
 * Lunes a viernes 8:00–18:00 y sábado 9:00–13:00 (≈ a confirmar por Operación).
 */
export function enHorarioAsesores(ahoraMs: number): boolean {
  const bogota = new Date(ahoraMs - 5 * 60 * 60 * 1000);
  const dia = bogota.getUTCDay(); // 0 domingo
  const minutos = bogota.getUTCHours() * 60 + bogota.getUTCMinutes();
  if (dia >= 1 && dia <= 5) return minutos >= 8 * 60 && minutos < 18 * 60;
  if (dia === 6) return minutos >= 9 * 60 && minutos < 13 * 60;
  return false;
}

export const TEXTO_HORARIO_ASESORES = 'lunes a viernes de 8:00 a.m. a 6:00 p.m. y sábados de 9:00 a.m. a 1:00 p.m. (hora Colombia)';
