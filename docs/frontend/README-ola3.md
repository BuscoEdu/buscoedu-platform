# Cierre Ola 3 Frontend — BA-001, BA-010, BA-011, BA-014, BA-015, BA-016

**Rama:** `feat/lote-ba-sep26`  
**Fecha:** 27 de septiembre de 2026  
**Alcance:** UI en `app/` y `components/`. Sin PR. Sin SQL de producción. Sin ElBúho.  
**Base previa:** BA-005 en `76c22e3`.

Brief de Producto para BA-010 y BA-011. El catálogo sigue saliendo de `obtenerOfertas` (activo, publicado, validado y vigencia abierta).

## BA-001 — Ficha detrás del panel móvil

En móvil, los resultados viven en un overlay `z-[70]`. La ficha estaba en `z-50`, así que el detalle quedaba tapado.

| Capa | z-index |
|------|---------|
| Panel de resultados móvil | `z-[70]` |
| Ficha de oferta | `z-[80]` |
| Autorizar contacto | `z-[90]` |
| Aviso de solicitud enviada | `z-[100]` |

En desktop el panel de resultados no es un overlay. Al cerrar la ficha, el panel móvil vuelve a bloquear el scroll de la página.

## BA-014 — Persistencia completa o ninguna

`sessionStorage` (`buscoedu_naia_chat_v1`) ya no guarda solo el chat.

Se escribe un snapshot versión 2 con conversación, filtros, ofertas, total, orden, respuesta y aviso de error, y solo cuando el estado ya cerró (`listo` o `error`). Mientras NaIA interpreta o el catálogo consulta, no se pisa el último corte completo.

Al recargar se restaura todo el corte o se descarta. Un chat sin resultados (versión anterior) se borra. Si la URL trae `q` o `vista`, esa entrada manda y no se mezcla con la sesión vieja.

## BA-015 — «¡Qué He filtrado…»

Antes de mostrar o guardar el mensaje de NaIA se reescribe el saludo partido:

`¡Qué He filtrado…` → `He filtrado…`

También el residuo `¡! He filtrado…`. El arreglo está en el render y en el texto que se persiste.

## BA-011 — `/explorar` sin `q`

Sin `q`, la página no muestra «Tus opciones aparecerán aquí». Consulta el catálogo vigente.

| Situación | Qué ve la persona |
|-----------|-------------------|
| Cargando | «Preparando opciones…» |
| `ok: false` | BA-005: «No pudimos consultar las opciones» + **Reintentar**. No dice que haya 0 resultados. |
| `ok: true` y 0 sin filtros | BA-004: «Sin ofertas vigentes» y el texto de vigencia vencida. No es un fallo. |
| `ok: true` y 0 con filtros | «Sin coincidencias en el catálogo» |
| `ok: true` con ofertas | Fichas del catálogo |

En móvil, al terminar esa carga se abre el panel de resultados. En desktop el panel ya está a la vista.

## BA-010 — Tres acciones distintas

| Acción | Copy | Dónde |
|--------|------|--------|
| Guardar | `Guardar en Mi lista` | Corazón y botón de la ficha, y botones de la tarjeta. No crea lead. |
| Quitar | `Quitar de Mi lista` | Si ya está guardada. |
| Aplicar | `Aplicar` | Solo en la ficha. Abre el funnel. |
| Consentir | `Autorizar contacto` | Solo en el paso de consentimiento. Es el único que habilita el lead. |

Mi lista vacía incluye `Guardar no envía tus datos.`

## BA-016 — Campos vacíos en la tarjeta

Si falta universidad, nivel, modalidad o ciudad, la tarjeta y la fila móvil dicen `Por confirmar`, `Institución por confirmar` o `Programa por confirmar`. No queda la etiqueta con el valor en blanco. Área, duración y beneficio se muestran cuando sí vienen en la oferta.

## Archivos

- `components/naia/NaiaSearchExperience.tsx`
- `components/naia/copyNaia.ts`
- `components/naia/naiaSession.ts`
- `components/naia/NaiaChatPanel.tsx`
- `components/explorar/OfferCard.tsx`
- `components/explorar/OfferDetailModal.tsx`
- `components/leadcenter/AplicacionConsentimientoModal.tsx` (solo z-index del paso público)
- `app/mi-lista/page.tsx` (comentario del vacío; el copy ya estaba)

## Checklist QA

- [ ] Móvil, NaIA o Explorar: abrir una ficha desde resultados; la ficha tapa el panel y se puede cerrar
- [ ] Móvil: Aplicar abre Autorizar contacto por encima de la ficha
- [ ] Desktop: la ficha se abre y se cierra; el panel de resultados sigue al lado
- [ ] Recargar a mitad de una respuesta de NaIA: no queda el chat sin sus resultados
- [ ] Recargar con una búsqueda ya terminada: vuelven chat, filtros y fichas, o la pantalla vacía si no había un corte completo
- [ ] Una respuesta «¡Qué He filtrado…» se lee «He filtrado…»
- [ ] `/explorar` sin `q`: no dice «Tus opciones aparecerán aquí»; carga vigentes, error con Reintentar, o el texto de vigencia si hay 0
- [ ] Tarjeta, ficha y Mi lista: se lee Guardar en Mi lista, Aplicar y Autorizar contacto en su paso
- [ ] Mi lista vacía: «Guardar no envía tus datos.»
- [ ] Tarjeta sin ciudad o sin modalidad: «Por confirmar», no un blanco
