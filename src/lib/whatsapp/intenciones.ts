/**
 * Intenciones del texto libre del estudiante (sin IA, deterministas) · lote Ola 1/2.
 *
 * Qué: clasifica un mensaje en saludo, cierre, revocación, número de la lista, «ver más», becas, precio,
 * pregunta abierta, «no entendí» o búsqueda. Por qué: antes todo caía en la búsqueda y el estudiante
 * recibía «No encontré…» para un «hola», un emoji o una pregunta (QA S1, S10, S14, S16).
 */

import { plegarComando } from './comandos';

export type IntencionTexto =
  | { tipo: 'saludo' }
  | { tipo: 'cierre' }
  | { tipo: 'revocar' }
  | { tipo: 'numero'; numero: number }
  | { tipo: 'mas' }
  | { tipo: 'becas' }
  | { tipo: 'precio' }
  | { tipo: 'registro' }
  | { tipo: 'emoji' }
  | { tipo: 'pregunta_abierta' }
  | { tipo: 'no_entendi' }
  | { tipo: 'buscar' };

// Bloque: frases de consentimiento. Solo frases claras: «ok», «listo» o «dale» NO son autorización (Ley 1581, C-10).
export const SI_CONSENTIMIENTO = new Set(['si', 'si acepto', 'acepto', 'si autorizo', 'autorizo', 'de acuerdo', 'acepto los terminos']);
export const NO_CONSENTIMIENTO = new Set(['no', 'no acepto', 'no autorizo']);

// Bloque: revocación con consentimiento previo (T05). Mensaje completo, para no confundir «no acepto pagar…».
const REVOCAR = new Set([
  'no acepto',
  'no autorizo',
  'ya no quiero',
  'retiro mi autorizacion',
  'retiro la autorizacion',
  'borra mis datos',
  'borren mis datos',
  'elimina mis datos',
  'revoco mi autorizacion'
]);

export const SALUDOS = new Set([
  'hola', 'holi', 'hola hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'hey', 'info', 'informacion',
  'hola buenas', 'hola buenos dias', 'hola buenas tardes', 'hola buenas noches', 'alo'
]);
const CIERRES = new Set(['gracias', 'muchas gracias', 'mil gracias', 'chao', 'chau', 'adios', 'listo', 'listo gracias', 'hasta luego', 'bye', 'ok gracias', 'listo muchas gracias']);
const NO_ENTENDI = new Set(['ok', 'okay', 'oki', 'vale', 'no entiendo', 'no entendi', 'que', 'como', 'eh', 'mmm', 'aja', 'k', 'si', 'no']);
const MAS = new Set(['mas', 'ver mas', 'mas opciones', 'siguiente', 'siguientes', 'otros', 'ver otros']);
const BECAS = new Set(['becas', 'beca', 'hay becas', 'tienen becas', 'quiero una beca', 'becas disponibles', 'ver becas']);

/** Quita emojis y símbolos gráficos: un mensaje de solo emojis queda vacío (C-14). */
export function quitarEmojis(texto: string): string {
  return (texto || '').replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0f]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function esRevocacion(texto: string): boolean {
  return REVOCAR.has(plegarComando(texto));
}

/** Clasifica el texto libre. El orden importa: lo más específico primero. */
export function clasificarTexto(texto: string): IntencionTexto {
  const sinEmoji = quitarEmojis(texto);
  const t = plegarComando(sinEmoji);
  // Bloque: S10 · solo emojis (había texto pero no quedó nada) tiene respuesta propia, no T10.
  if (!t && (texto || '').trim()) return { tipo: 'emoji' };
  if (!t || !/[a-z0-9ñ]/.test(t)) return { tipo: 'no_entendi' };
  if (REVOCAR.has(t)) return { tipo: 'revocar' };
  if (/^\d{1,2}$/.test(t)) return { tipo: 'numero', numero: Number(t) };
  if (SALUDOS.has(t)) return { tipo: 'saludo' };
  if (CIERRES.has(t)) return { tipo: 'cierre' };
  if (MAS.has(t)) return { tipo: 'mas' };
  // Bloque: S8 · «beca»/«becas» dentro de la frase vale lo mismo que el botón Becas.
  if (BECAS.has(t) || /\bbecas?\b/.test(t)) return { tipo: 'becas' };
  // Bloque: S14 · registro / acreditación: respuesta con el SNIES, nunca afirmar «acreditado».
  if (/\b(ministerio|aprobad[oa]s?|snies|acreditad[oa]s?|acreditacion|registro calificado)\b/.test(t)) return { tipo: 'registro' };
  if (NO_ENTENDI.has(t) || t.length < 3) return { tipo: 'no_entendi' };
  // Bloque: precio antes que pregunta abierta («¿cuánto vale el semestre?» es precio, no opinión).
  if (/\b(precio|precios|cuanto cuesta|cuanto vale|cuanto sale|costo|valor del semestre|valor de la matricula|matricula)\b/.test(t)) {
    return { tipo: 'precio' };
  }
  // Bloque: preguntas que no se responden con el catálogo (T12). Solo patrones explícitos para no robar búsquedas.
  if (/\b(vale igual|es igual|sirve|reconocid[oa]|reconocimiento|cuanto gana|salario|sueldo|es mejor|conviene|homolog|consigo trabajo|campo laboral)\b/.test(t)) {
    return { tipo: 'pregunta_abierta' };
  }
  return { tipo: 'buscar' };
}
