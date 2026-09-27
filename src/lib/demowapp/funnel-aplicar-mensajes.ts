/**
 * BA-031 · Textos del hilo. No redirigen a un perfil web.
 * El estudiante ve la burbuja; la UI además recibe el arreglo estructurado.
 */

import type { TipoConsentimientoRegla } from './funnel-aplicar-reglas';

export function mensajeMiLista(ofertaNombre: string): string {
  return `Listo, dejé «${ofertaNombre}» en Mi lista. Eso no es aplicar ni autoriza que te contacten: no creo ninguna solicitud para la universidad.`;
}

export function mensajeIniciarSinDatos(ofertaNombre: string): string {
  return [
    `Vamos a aplicar a «${ofertaNombre}».`,
    'Aplicar no la guarda en Mi lista ni autoriza el contacto.',
    'En este chat escríbeme tu nombre completo y tu celular. Si quieres, también el correo. No hace falta ir a un perfil web.'
  ].join(' ');
}

export function mensajeDatosParciales(faltantes: string[]): string {
  const lista = faltantes.join(' y ');
  return `Me falta ${lista} para seguir con la aplicación en este chat. Todavía no creo ninguna solicitud.`;
}

export function mensajeConsentimiento(ofertaNombre: string, tipos: TipoConsentimientoRegla[]): string {
  const bloques = tipos.map((tipo, indice) => {
    const marca = tipo.es_obligatorio ? ' (necesaria para seguir)' : '';
    const texto = (tipo.texto_completo || tipo.descripcion || '').trim();
    return `${indice + 1}. ${tipo.nombre}${marca}\n${texto}`.trim();
  });

  return [
    `Gracias. Tus datos quedan en este hilo, todavía sin solicitud.`,
    `Estos son los permisos para aplicar a «${ofertaNombre}». Ninguno viene aceptado.`,
    'Aplicar no es autorizar el contacto: si no aceptas, no creo la solicitud ni la comparto con la universidad.',
    ...bloques,
    'Cuando respondas, marca cada permiso. Puedes aceptar, rechazar o abandonar.'
  ].join('\n\n');
}

export function mensajeRechazo(ofertaNombre: string): string {
  return `Entendido: no autorizas el contacto para «${ofertaNombre}». No creé ninguna solicitud ni compartí tus datos con la universidad.`;
}

export function mensajeAbandono(): string {
  return 'Cerré esta aplicación sin enviarla. No quedó solicitud ni lead para la universidad.';
}

export function mensajeConfirmacion(ofertaNombre: string): string {
  return `Listo. Autorizaste el contacto y quedó tu solicitud para «${ofertaNombre}». En el Lead Center ya está la oportunidad, con la traza de ese consentimiento.`;
}
