/**
 * E1 · Frontend — Clases de estilo de la paleta A2 aprobada (brief UX §5).
 *
 * Qué hace: junta en constantes las clases Tailwind de botones, campos, foco y tarjetas.
 * Para qué: que todas las pantallas del módulo usen exactamente los mismos colores medidos
 * en AA (índigo #3b2f8f, CTA coral #ff7a59 con texto #1f1a4d en 600, bordes #8a84b8,
 * texto secundario #6b63a8) y que nadie ponga texto blanco sobre coral ni coral como texto.
 * Tailwind lee estas cadenas porque `components/**` está en `content`.
 */

/** Anillo de foco: índigo 2 px + 2 px de separación, por fuera (también sobre el coral). */
export const FOCO =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b2f8f]';

/** Área táctil mínima de 44 × 44 px. */
export const TACTIL = 'min-h-[44px] min-w-[44px]';

/** ÚNICO botón principal coral por pantalla: texto índigo oscuro #1f1a4d en peso 600. */
export const BOTON_CTA = `${FOCO} ${TACTIL} inline-flex items-center justify-center gap-2 rounded-lg bg-[#ff7a59] px-5 py-2.5 font-semibold text-[#1f1a4d] hover:bg-[#ff6a45] motion-safe:transition-colors`;

/** Botón secundario: borde y texto índigo sobre blanco. */
export const BOTON_SECUNDARIO = `${FOCO} ${TACTIL} inline-flex items-center justify-center gap-2 rounded-lg border-2 border-[#3b2f8f] bg-white px-4 py-2 font-semibold text-[#3b2f8f] hover:bg-[#ece8f7] motion-safe:transition-colors`;

/** Botón destructivo (apagar, revocar): rojo de error con texto blanco (6,47:1). No es coral. */
export const BOTON_PELIGRO = `${FOCO} ${TACTIL} inline-flex items-center justify-center gap-2 rounded-lg bg-[#b91c1c] px-5 py-2.5 font-semibold text-white hover:bg-[#991b1b] motion-safe:transition-colors`;

/** Botón deshabilitado: se ve inactivo y SIEMPRE va acompañado del motivo escrito. */
export const BOTON_DESHABILITADO = `${TACTIL} inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#8a84b8] bg-[#f7f4ee] px-5 py-2.5 font-semibold text-[#6b63a8]`;

/** Enlace de texto: índigo subrayado (nunca coral). */
export const ENLACE = `${FOCO} rounded font-semibold text-[#3b2f8f] underline underline-offset-2 hover:text-[#1f1a4d]`;

/** Campo de formulario: borde #8a84b8 (3,46:1) y 16 px para que iOS no haga zoom. */
export const CAMPO = `${FOCO} block w-full min-h-[44px] rounded-lg border border-[#8a84b8] bg-white px-3 py-2 text-base text-[#1a1830]`;

/** Campo con error: borde rojo. */
export const CAMPO_ERROR = `${FOCO} block w-full min-h-[44px] rounded-lg border-2 border-[#b91c1c] bg-white px-3 py-2 text-base text-[#1a1830]`;

/**
 * F1 (post-QA) · Reserva al final de una pantalla con barra de acción fija en móvil.
 * Qué hace: deja un padding-bottom igual al alto real de la barra (69 px medidos a 390 y 360:
 * 12 px arriba + botón de 44 px + 12 px abajo + 1 px de borde), más 1,5 rem de margen y el área
 * segura del iPhone. Desde `sm` la barra deja de ser fija y la reserva desaparece.
 * Para qué: que lo último de la pantalla (p. ej. «Cambios del tope») se pueda ver completo por
 * encima de la barra al terminar el scroll.
 */
export const RESERVA_BARRA_FIJA = 'pb-[calc(69px+1.5rem+env(safe-area-inset-bottom))] sm:pb-0';

/** Tarjeta blanca con borde decorativo #ece8f7. */
export const TARJETA = 'rounded-2xl border border-[#ece8f7] bg-white';

/** Texto secundario (ayudas, fechas): #6b63a8 = 5,28:1. */
export const TEXTO_SECUNDARIO = 'text-[#6b63a8]';

/** Título de pantalla en índigo. */
export const TITULO = 'text-2xl font-bold text-[#3b2f8f]';
