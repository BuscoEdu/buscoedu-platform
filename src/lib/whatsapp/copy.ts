/**
 * Copy del flujo del bot de WhatsApp · Producto v1.3 (briefs/copy-bot-wa-v1.md), lote ajustes Ola 1/2.
 *
 * Qué: textos de conversación que decide Backend (consentimiento, fallbacks, asesor, Aplicar).
 * Por qué aparte de mensajes.ts: Frontend es dueño de mensajes.ts y presentacion.ts (resultados T09 y ficha T09b);
 * aquí solo vive el copy del flujo, con su T-id en comentario para rastrearlo contra el brief.
 * [FIJO] = texto ya aprobado; no se cambia ni una coma (T06, T14, T23).
 */

import type { BotonRespuesta } from './graph-client';

// Bloque: versión del texto legal de datos. Se sube con T01 v2 (Ley 1581 + link a /privacidad);
// quien aceptó una versión anterior debe aceptar de nuevo (criterio S20).
export const VERSION_TEXTO_DATOS_V2 = 'wa-t01-v2-2026-10-19';

export const URL_POLITICA = 'https://www.buscoedu.com/privacidad';
export const URL_EXPLORAR = 'https://www.buscoedu.com/explorar';

// Bloque: botones reutilizables (≤3 por mensaje, título ≤20; lo verifica un test).
export const BOTONES_CONSENTIMIENTO: BotonRespuesta[] = [
  { id: 'consent:si', titulo: 'Acepto' },
  { id: 'consent:no', titulo: 'No acepto' }
];
export const BOTONES_MENU: BotonRespuesta[] = [
  { id: 'menu:buscar', titulo: 'Buscar programa' },
  { id: 'menu:becas', titulo: 'Becas' },
  { id: 'menu:asesor', titulo: 'Hablar con asesor' }
];
export const BOTONES_NUEVA_O_ASESOR: BotonRespuesta[] = [
  { id: 'menu:nueva', titulo: 'Nueva búsqueda' },
  { id: 'menu:asesor', titulo: 'Hablar con asesor' }
];
export const BOTONES_SEGUIR: BotonRespuesta[] = [
  { id: 'menu:seguir', titulo: 'Seguir' },
  { id: 'menu:nueva', titulo: 'Nueva búsqueda' }
];
export const BOTONES_ERROR: BotonRespuesta[] = [
  { id: 'menu:reintentar', titulo: 'Reintentar' },
  { id: 'menu:asesor', titulo: 'Hablar con asesor' }
];
export const BOTONES_ASESOR_O_BUSCAR: BotonRespuesta[] = [
  { id: 'menu:asesor', titulo: 'Hablar con asesor' },
  { id: 'menu:buscar', titulo: 'Buscar programa' }
];
export const BOTONES_SOLO_BUSCAR: BotonRespuesta[] = [{ id: 'menu:buscar', titulo: 'Buscar programa' }];
export function botonesAutorizarContacto(ofertaId: string): BotonRespuesta[] {
  return [
    { id: `autorizar:${ofertaId}`, titulo: 'Sí, autorizo' },
    { id: `noautorizar:${ofertaId}`, titulo: 'No, gracias' }
  ];
}

/** Todos los sets de botones del flujo, para el test de límites de Meta. */
export const TODOS_LOS_BOTONES: BotonRespuesta[][] = [
  BOTONES_CONSENTIMIENTO,
  BOTONES_MENU,
  BOTONES_NUEVA_O_ASESOR,
  BOTONES_SEGUIR,
  BOTONES_ERROR,
  BOTONES_ASESOR_O_BUSCAR,
  BOTONES_SOLO_BUSCAR,
  botonesAutorizarContacto('00000000-0000-0000-0000-000000000000')
];

// T01 · Bienvenida en 2 mensajes (v1.3): saludo + autorización con botones.
export const T01_SALUDO =
  '¡Hola! Soy el asistente de BuscoEdu 👋 Te ayudo a encontrar programas de universidades verificadas, sin costo para ti.';
export const T01_AUTORIZACION =
  'Para orientarte necesito tu autorización para usar tu nombre, correo, celular e intereses solo para recomendarte programas (Ley 1581 de 2012). ' +
  'Nunca los enviamos a una universidad sin que lo autorices aparte.\n' +
  `Sal cuando quieras con STOP. Política: ${URL_POLITICA}`;

// T02 · Aceptó. T02_PEDIR = T02 sin «¡Gracias!» (derivado, para [Buscar programa] / [Nueva búsqueda] / MENU).
export const T02_PEDIR =
  'Cuéntame qué te gustaría estudiar. Puedes escribir un programa (ej.: Psicología), un área (ej.: tecnología) o una ciudad.';
export const T02_ACEPTA = `¡Gracias! ${T02_PEDIR}`;

// T03 · No acepta (sin botones, no se vuelve a preguntar).
export const T03_NO_ACEPTA =
  'Entendido, respeto tu decisión. No guardaré ningún dato tuyo.\n' +
  'Si quieres explorar por tu cuenta, sin registrarte: www.buscoedu.com/explorar\n' +
  'Si cambias de opinión, escribe ACEPTO.';

// T04 · Recordatorio (máx 1).
export const T04_RECORDATORIO = 'Para mostrarte programas necesito tu autorización primero. ¿Aceptas?';

// T05 · Revoca con consentimiento previo.
export const T05_REVOCA =
  'Listo, retiré tu autorización. No usaré tus datos para nada más.\nSi algún día quieres volver, escribe ACEPTO.';

// T06 · STOP [FIJO] (mismo texto que BAJA_CONFIRMADA de mensajes.ts).
export const T06_STOP =
  'Listo, no te escribo más por aquí. Quedó registrada tu baja. Si algún día quieres volver, escribe *ALTA*.';

// T07 · ALTA u «Hola» después de STOP: se antepone a T01 mensaje 2.
export const T07_REGRESO = '¡Qué bueno verte de nuevo! Antes de seguir, necesito otra vez tu autorización.';

// T08 · «Hola» con sesión y consentimiento vigentes.
export function t08HolaConBusqueda(ultimaBusqueda: string): string {
  return `¡Hola de nuevo! ¿Seguimos con tu búsqueda de ${ultimaBusqueda.slice(0, 60)} o empezamos una nueva?`;
}
export const T08_HOLA_SIN_BUSQUEDA = '¡Hola de nuevo! ¿Qué te gustaría buscar hoy?';

// T10 · No entendí (y versión tras 2 seguidas).
export const T10_NO_ENTENDI =
  'No te entendí bien 🙂 Puedes escribir el nombre de un programa (ej.: Psicología), un área o una ciudad. O elige:';
export const T10_REPETIDO = 'Parece que no te estoy ayudando bien. ¿Quieres que te escriba un asesor?';

// T11 · 0 resultados (nunca para error técnico ni «no entendí»).
export function t11SinResultados(consulta: string): string {
  return (
    `Por ahora no tengo programas verificados con «${consulta.slice(0, 60)}». ` +
    'Puedes probar con otra ciudad, la modalidad virtual o un área cercana.'
  );
}

// T12 · Pregunta abierta.
export const T12_PREGUNTA_ABIERTA =
  'Esa pregunta no la puedo responder con certeza y prefiero no darte información incorrecta. Un asesor te puede ayudar.';

// T13 · Error técnico.
export const T13_ERROR = 'Tuve un problema para consultar los programas. Inténtalo de nuevo en un momento.';

// T14 · Asesor [FIJO v1.2, con línea MENU] y respuesta si lo pide de nuevo.
export const T14_ASESOR = 'Un asesor del equipo BuscoEdu te escribirá en horario hábil. Para volver conmigo escribe *MENU*.';
export const T14_YA_AVISADO =
  'Ya le avisé al equipo; te escribirán en horario hábil. Mientras tanto, puedo seguir buscando programas contigo.';

// T15 · Voz / imagen / sticker.
export const T15_SOLO_TEXTO = 'Por ahora solo puedo leer mensajes de texto. Escríbeme qué te gustaría estudiar 🙂';

// T16 · Becas (catálogo sin condición estructurada).
export const T16_SIN_BECAS = 'No tengo becas verificadas para esa búsqueda. Las becas dependen de cada universidad.';
export function t16ConBeneficio(beneficio: string): string {
  return `Beneficio: ${beneficio}. Lo otorga la universidad; confirma los requisitos con ella o con un asesor.`;
}

// T17 · Precio (catálogo sin precio).
export const T17_PRECIO = 'Precio no disponible. Puedes consultarlo con la universidad o con un asesor.';

// T18 · Ficha ya no está en la lista.
export const T18_YA_NO_ESTA = 'Esa opción ya no está en tu lista actual. Escribe el nombre del programa o elige:';

// T09b · Texto al guardar en Mi lista.
export function t09bGuardado(programa: string): string {
  return `Listo, guardé ${programa} en tu lista. Guardar no es aplicar: cuando quieras, toca Aplicar.`;
}

// T19 · Aplicar, inicio.
export function t19Aplicar(programa: string, universidad: string): string {
  return `Vamos a aplicar a ${programa} en ${universidad}. Tu número ya está verificado. ¿Cuál es tu nombre completo?`;
}

// T20 · Nombre inválido (1.º y 2.º intento; el 3.º pasa a T14).
export const T20_NOMBRE_1 = 'Escríbeme tu nombre y apellido, por favor (ej.: Ana María Gómez).';
export const T20_NOMBRE_2 =
  'Aún no lo pude registrar. Usa solo tu nombre y apellidos, sin números (ej.: Ana María Gómez-Ruiz).';

// T21 · Correo (OMITIR se mantiene, v1.2).
export function t21PedirCorreo(nombre: string): string {
  return (
    `Gracias, ${nombre}. ¿Cuál es tu correo electrónico?\n` +
    'Si prefieres no darlo, escribe OMITIR y te contactarán por este WhatsApp.'
  );
}
export const T21_CORREO_INVALIDO = 'Ese correo no parece válido. Revisa que tenga @ y un dominio (ej.: ana@gmail.com).';

// T22 · Autorización de contacto (separada de Aplicar).
export function t22Autorizar(universidad: string, programa: string): string {
  return `¿Autorizas a BuscoEdu a compartir tu nombre, correo y celular con ${universidad} para que te contacten sobre ${programa}?`;
}
export const T22_NO = 'Entendido, no compartiré tus datos. Tu solicitud quedó guardada por si cambias de opinión.';

// T23 · Switch OFF [FIJO + qué sigue].
export const T23_PILOTO =
  'Estamos en piloto: tu autorización quedó registrada, pero todavía no enviamos datos a universidades.\n' +
  'Te avisaremos por aquí cuando podamos enviarla. Mientras tanto, ¿quieres seguir buscando?';

// T23b · Switch ON, solo tras envío exitoso.
export function t23bEnviada(universidad: string): string {
  return (
    `Listo, enviamos tu solicitud a ${universidad}. Ellos serán quienes te contacten por correo o WhatsApp.\n` +
    'Si no te escriben, cuéntame aquí y te ayudo.'
  );
}

// T24 · Cierre.
export const T24_CIERRE = '¡Con gusto! Cuando quieras seguir buscando, escríbeme. Para dejar de recibir mensajes, escribe STOP.';
