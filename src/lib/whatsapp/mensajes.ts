/**
 * BA-032 · Textos que ve el estudiante en WhatsApp.
 * Español colombiano neutro, de tú. Sin promesas que el sistema no cumple.
 */

import type { OfertaWa } from './tipos';

export const URL_WEB = 'https://www.buscoedu.com';
export const VERSION_TEXTO_DATOS = 'wa-ba032-v1';

// Bloque: bienvenida + autorización de datos (Ley 1581 de 2012).
export const BIENVENIDA_CONSENTIMIENTO =
  '¡Hola! 👋 Te escribe *BuscoEdu*, y yo soy NaIA, tu asesora virtual. Te ayudo a encontrar programas vigentes de universidades aliadas.\n\n' +
  'Antes de seguir necesito tu autorización: de acuerdo con la Ley 1581 de 2012, ¿autorizas a BuscoEdu a tratar los datos que compartas en este chat ' +
  '(lo que quieres estudiar y tus datos de contacto) para orientarte? Puedes leer la política en ' + URL_WEB + '/privacidad\n\n' +
  'Mientras no aceptes, solo guardo tu número. Escribe BAJA cuando quieras que deje de escribirte.';

export const RECORDATORIO_CONSENTIMIENTO =
  'Para ayudarte necesito primero tu autorización de datos. Toca *Sí, autorizo* o *No autorizo*. Si prefieres, mira el catálogo en ' + URL_WEB + '/explorar';

export const SIN_CONSENTIMIENTO =
  'Entendido, no guardo tus datos ni tus mensajes. Puedes ver los programas en ' + URL_WEB + '/explorar. Si cambias de opinión, escribe *ACEPTO*.';

export const CONSENTIMIENTO_OK =
  '¡Gracias! Cuéntame qué te gustaría estudiar: por ejemplo "quiero estudiar administración virtual" o "busco una maestría en Bogotá".';

export const PEDIR_INTERES =
  'Cuéntame qué te gustaría estudiar (área o programa) y, si quieres, la ciudad o la modalidad. Así busco en el catálogo vigente.';

export const SIN_RESULTADOS =
  'No encontré programas vigentes con eso en el catálogo de BuscoEdu. No te voy a inventar opciones. ' +
  'Prueba con otra área, ciudad o modalidad, o mira ' + URL_WEB + '/explorar';

export const ERROR_HONESTO =
  'Uy, tuve un problema técnico y no pude completar eso. No guardé nada a medias. ' +
  'Puedes intentarlo de nuevo en unos minutos o seguir en ' + URL_WEB;

export const BAJA_CONFIRMADA =
  'Listo, no te escribo más por aquí. Quedó registrada tu baja. Si algún día quieres volver, escribe *ALTA*.';

export const VOLVER_MENU = '¡De vuelta conmigo, NaIA! ' + PEDIR_INTERES;

// Bloque: ASESOR en piloto (Producto 17/10). Aún no hay pantalla en Lead Center:
// el equipo contesta a mano desde Meta, así que no prometemos tiempos ni respuesta inmediata.
// `enHorario` se conserva por compatibilidad; el texto es el mismo en ambos casos.
export function textoAsesor(_enHorario: boolean): string {
  return 'Un asesor del equipo BuscoEdu te escribirá en horario hábil. Para volver conmigo escribe *MENU*.';
}

export const ASESOR_SIN_CONSENTIMIENTO =
  'Para que un asesor te atienda necesito primero tu autorización de datos. Toca *Sí, autorizo* para seguir.';

// Bloque: resultados del catálogo (máx 8 fichas, cada una con link a la web).
export function textoResultados(ofertas: OfertaWa[]): string {
  const lineas = ofertas.map((o, i) => {
    const detalle = [o.universidad, o.modalidad, o.nivel, o.ciudad].filter(Boolean).join(' · ');
    const beneficio = o.beneficio ? `\n   Beneficio: ${o.beneficio}` : '';
    return `${i + 1}. *${o.nombre}*\n   ${detalle}${beneficio}\n   ${o.url}`;
  });
  return `Encontré ${ofertas.length} ${ofertas.length === 1 ? 'opción vigente' : 'opciones vigentes'} en el catálogo de BuscoEdu:\n\n${lineas.join('\n\n')}`;
}

export const CUERPO_LISTA = 'Elige una ficha para guardarla en tu lista o aplicar.';

export function textoFicha(o: OfertaWa): string {
  const detalle = [o.universidad, o.modalidad, o.nivel, o.ciudad].filter(Boolean).join(' · ');
  return `*${o.nombre}*\n${detalle}${o.beneficio ? `\nBeneficio: ${o.beneficio}` : ''}\nFicha: ${o.url}\n\n¿Qué quieres hacer?`;
}

export const OFERTA_YA_NO_ESTA =
  'Esa ficha ya no está en tu búsqueda actual. Cuéntame de nuevo qué buscas y la vuelvo a traer.';

export function textoMiLista(nombre: string): string {
  return `Guardé *${nombre}* en tu lista. Guardar no es aplicar ni autoriza que te contacten.`;
}

export function textoPedirNombre(oferta: string): string {
  return `Vamos a aplicar a *${oferta}*. Tu número ya está verificado por WhatsApp, así que no te pido código. ¿Cuál es tu nombre completo?`;
}

export const NOMBRE_INVALIDO = 'Necesito tu nombre y apellido (solo letras). ¿Me lo escribes de nuevo?';

export const PEDIR_CORREO = 'Gracias. ¿Cuál es tu correo? Si prefieres no darlo, escribe *OMITIR*.';
export const CORREO_INVALIDO = 'Ese correo no parece válido. Escríbelo de nuevo o escribe *OMITIR*.';

// Bloque: autorización de contacto explícita y por oferta (≠ aplicar).
export function textoAutorizarContacto(oferta: string, universidad: string): string {
  return (
    `Último paso para *${oferta}*. Aplicar no autoriza contacto por sí solo.\n\n` +
    `¿Autorizas que BuscoEdu comparta tu nombre, celular y correo con *${universidad}* y que te contacten (WhatsApp, llamada o correo) sobre esta oferta? ` +
    'Solo aplica a esta oferta.'
  );
}

export const CONTACTO_NO_AUTORIZADO =
  'Entendido, no comparto tus datos con la universidad ni creo ninguna solicitud. La ficha sigue disponible en la web cuando quieras.';

// Bloque: interruptor de conversión apagado (piloto). Texto exacto de Producto 17/10:
// nunca decir «tu solicitud fue enviada»; no se envían datos a universidades.
export function textoSolicitudRegistradaSinConversion(_oferta: string): string {
  return 'Estamos en piloto: tu autorización quedó registrada, pero todavía no enviamos datos a universidades.';
}

export function textoLeadCreado(oferta: string, universidad: string): string {
  return `¡Listo! Tu solicitud para *${oferta}* quedó creada y autorizaste el contacto de *${universidad}*. Te escribirán pronto.`;
}

export function textoConversionRechazada(): string {
  return 'No pude crear tu solicitud: faltó una autorización obligatoria o la oferta cambió. No guardé nada a medias. Puedes revisarla en ' + URL_WEB;
}

export const TIPO_NO_SOPORTADO =
  'Por ahora solo leo mensajes de texto y las opciones del menú. Cuéntame por escrito qué te gustaría estudiar.';
