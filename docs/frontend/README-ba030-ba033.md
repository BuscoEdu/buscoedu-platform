# BA-030 y BA-033 — Demo WApp solo-hilo

**Rama:** `feat/lote-ba-naia-wapp`  
**Fecha:** 27 de septiembre de 2026

El estudiante, en Demo WhatsApp, ve solo un hilo a pantalla completa (móvil y escritorio). La sensación es la de un canal de mensajes, no la de una página del portal.

## BA-030 — Conversación sin UI web

- No hay llamados a Explorar, a filtros ni a listas del portal dentro del hilo.
- Si el texto de NaIA trae esas frases, el hilo no las vuelve enlace ni botón.
- Las viñetas y la acción sugerida se responden en el chat (hasta tres respuestas rápidas).
- La oferta de la sesión es una ficha dentro del hilo.

## BA-033 — Shell a pantalla completa

- `/demoWapp` abre directo en el hilo. Ya no hay grilla de tres columnas ni tarjeta de “Iniciar sesión”.
- **Operación** tapa el hilo y concentra sesiones, búsqueda y CRM. Al cerrarla, el chat queda solo.
- El modal del estudiante usa el mismo hilo, de borde a borde, con cierre en la barra del canal.
- No se copia el FAB ni el botón “Explorar oferta” de `/naia` y `/explorar`.

## Fuera de este cambio

Portal NaIA/Explorar (BA-025, BA-026, BA-027, BA-028), Meta/BA-032 y el funnel de aplicar/consentimiento (BA-031).

## Archivos

- `app/demoWapp/layout.tsx`
- `app/demoWapp/page.tsx`
- `components/demowapp/DemoWappPanel.tsx`
- `components/demowapp/DemoWappModal.tsx`
- `components/demowapp/DemoWappOpsSheet.tsx`
- `components/demowapp/hiloTexto.ts`
- `components/demowapp/ContextPanel.tsx`

## Humo

- [ ] Móvil y escritorio: el hilo ocupa el viewport, sin columnas
- [ ] No hay panel Explorar, filtros ni CRM junto al chat
- [ ] La oferta y las viñetas de NaIA aparecen dentro del hilo
- [ ] “Explorar resultados” no se vuelve enlace ni botón
- [ ] Operación abre sesiones y contexto por encima; al cerrar vuelve el hilo solo
- [ ] `/naia` y `/explorar` conservan ventana, franja y FAB
