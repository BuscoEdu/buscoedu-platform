# A1 · Frontend Ola 2

Catálogo fail-closed, chat de NaIA y Demo WApp / Lead Center sobre el contrato de `docs/backend/README-a1-demowapp.md`. No hay cambios de SQL ni de endpoints.

## Qué cambió

### Catálogo Explorar / NaIA

- Las aliadas se resuelven por `NEXT_PUBLIC_ALIADAS_IDS` o por igualdad de `nombre_oficial`, `nombre_corto` o `sigla`. No hay `%UNIR%` ni otro patrón: eso metía Unired.
- Si no hay IDs, `obtenerOfertas` devuelve lista vacía y `total: 0`. El vacío de vigencia (`COPY_CERO_VIGENCIA`) es el mismo en el título, el mensaje de NaIA, el panel de escritorio y el modal móvil.
- El total que se pinta y el que se guarda en `sessionStorage` es el `total` del servidor. Se quitó el `Math.max` con el largo de la página, que inflaba el restore.
- En `src/lib/ofertas.ts` volvieron los comentarios de bloque (aliadas, programa, nivel, sede, universidad, beneficio).

### NaIA

- Las respuestas de NaIA (historial de `/naia` y `/explorar`, y `NaiaMessage`) pintan negrita, cursiva y listas. El texto del estudiante sigue plano.
- El historial del hilo tiene alto mínimo (`min-h-[12rem]`), ocupa el espacio que sobra y scrollea. La franja «Puedes continuar con» quedó en `max-h` (sigue scrolleando por dentro, ya no reserva `h-28`/`h-32` fijos). El cálculo de alto de escritorio reserva como mucho 120px de pie, para que el header del sitio más esa franja no dejen el historial en ~60px.
- En el home, el FAB móvil sube (`bottom-24`) y el hero deja margen a la derecha (`max-md:pr-28`) para no tapar el aviso. En Explorar el aviso del pie tiene padding inferior para quedar por encima del FAB (`bottom-44`).

### Demo WApp

- La lista y el contexto muestran `telefonoEnmascarado` tal como llega. No se re-enmascara ni se lee `celular` / `celular_e164`.
- Etiqueta **QA** en la lista, en el contexto, en la barra del hilo y en la ficha de Lead Center cuando `esQa` / `es_qa`.
- «Nueva conversación QA» (hoja de operación, sesión super admin) hace `POST /api/demowapp/sesiones/qa` con `{ etiqueta }`. En 201 abre ese `oportunidadId`. El error queda en la hoja.
- Aplicar, Mi lista, datos, permiso y los GET del funnel mandan el `oportunidadId` del hilo activo.
- `400 hilo_requerido` y `409 hilo_no_coincide` muestran el texto y un botón Reintentar. No dejan el hilo en blanco.
- La memoria del funnel sigue en `ba031-hilo:{oportunidadId}:{ofertaId}`.
- En el paso de consentimiento se listan las universidades de la oferta antes de aceptar. Aceptar permanece deshabilitado hasta ver al menos un nombre. Rechazar o abandonar no crea lead.

### Lead Center

- Las filas de oportunidades con `es_qa` llevan badge QA. Quien no es super admin no recibe esas filas (el filtro ya está en el API). La ficha también lo muestra y sigue en 404 para el resto.

## Archivos

- `src/lib/aliadas-publicas.ts`, `src/lib/aliadas.ts`, `src/lib/aliadas-exactas.test.ts`
- `src/lib/ofertas.ts`
- `components/naia/naiaMarkdownParse.ts`, `components/naia/naiaMarkdown.tsx`, `components/naia/naiaMarkdown.test.ts`
- `components/naia/NaiaSearchExperience.tsx`, `components/naia/NaiaMessage.tsx`, `components/naia/NaiaHomeHero.tsx`
- `components/layout/Header.tsx`, `app/page.tsx`
- `components/demowapp/funnelContrato.ts`, `components/demowapp/funnelContrato.test.ts`, `components/demowapp/useFunnelHilo.ts`, `components/demowapp/FunnelEnHilo.tsx`
- `components/demowapp/SessionList.tsx`, `components/demowapp/ContextPanel.tsx`, `components/demowapp/DemoWappOpsSheet.tsx`, `components/demowapp/DemoWappPanel.tsx`
- `app/demoWapp/page.tsx`
- `components/leadcenter/OportunidadesBoard.tsx`, `app/leadcenter/oportunidades/[id]/page.tsx`

## Cómo probar

Hace falta `NEXT_PUBLIC_ALIADAS_IDS` con los uuid de las cinco aliadas. Sin esa variable el fallback es igualdad de nombre; si no hay match, el catálogo queda en cero a propósito.

### Escritorio

1. `/explorar` sin búsqueda: el título, el mensaje de NaIA y las tarjetas dicen el mismo total. Si no hay ofertas publicables, el texto es el de vigencia, no un error técnico.
2. Recargar `/explorar`: el total restaurado no sube solo.
3. `/naia`: mandar un mensaje con `**negrita**` y una lista. El historial scrollea y ocupa más que una franja de ~60px. «Puedes continuar con» no tapa los mensajes.
4. `/` a 1280px: el aviso del hero se lee entero. El FAB no está (es solo móvil).
5. Lead Center como super admin: una oportunidad `es_qa` muestra QA. Como asesor, esa fila no aparece.
6. `/demoWapp` como super admin: la hoja de operación muestra teléfonos enmascarados y el badge QA. «Nueva conversación QA» con etiqueta abre el hilo nuevo.
7. En ese hilo, Aplicar sobre una oferta: el paso de permisos lista la universidad antes de Aceptar. Rechazar deja 0 leads. El request de aplicar lleva el `oportunidadId` de ese hilo.

### Móvil (≤ 767px y ~390px de ancho)

1. `/`: el FAB no cubre el aviso ni los botones del hero. Se puede leer y pulsar «Hacerlo con NaIA».
2. `/explorar`: el FAB queda sobre la zona inferior, el aviso del pie sigue legible, y «Explorar oferta» abre resultados. El total del modal coincide con el del chat.
3. `/naia` con una búsqueda: el historial scrollea dentro de la ventana; el input y «Puedes continuar con» siguen usables.
4. `/demoWapp`: el hilo ocupa la pantalla. Operación → nueva QA → volver al chat de ese hilo. Un error `hilo_requerido` (sin hilo) o `hilo_no_coincide` muestra el aviso amarillo y Reintentar, no una pantalla vacía.

## Checklist

- [ ] Aliadas por ID o igualdad, sin `%` en el filtro.
- [ ] Total único en título, mensaje, escritorio y móvil; restore sin inflar.
- [ ] Vacío de catálogo honesto (vigencia), no disfrazado de error.
- [ ] Markdown visible en respuestas de NaIA.
- [ ] Historial de NaIA con scroll y alto útil en escritorio y móvil.
- [ ] FAB y aviso del home / Explorar no se pisan en móvil.
- [ ] Teléfono de Demo WApp = máscara del servidor + badge QA.
- [ ] Nueva conversación QA abre el hilo del 201.
- [ ] Aplicar manda `oportunidadId` del hilo activo.
- [ ] 400 `hilo_requerido` y 409 `hilo_no_coincide` con mensaje y reintento.
- [ ] Memoria `ba031-hilo:{oportunidadId}:{ofertaId}`.
- [ ] Consentimiento muestra las universidades; aceptar deshabilitado hasta ver el nombre.
- [ ] Badge QA en Lead Center solo donde la fila `es_qa` ya vino para un super admin.
