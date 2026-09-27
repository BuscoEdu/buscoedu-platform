/** BA-028: el FAB móvil pide la ventana de chat que ya está montada en Explorar. */
export const EVENTO_FAB_NAIA = "buscoedu:naia-fab";

export function pedirChatNaia() {
  window.dispatchEvent(new Event(EVENTO_FAB_NAIA));
}
