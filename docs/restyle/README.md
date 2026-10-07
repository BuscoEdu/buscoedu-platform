# Restyle A2 · Ola 1/3 · Frontend

Fecha: 2026-10-07. Rama: `feat/restyle-a2`.

Esta ola cambia el look del Home y los tokens globales. No cambia el recorrido: explorar sigue sin registro, Guardar en Mi lista no es Aplicar, y Autorizar contacto sigue siendo un paso aparte con su consentimiento. Explorar, el detalle de una oferta, NaIA y el Lead Center no se rediseñan aquí.

## Tokens

Están en `app/globals.css` (`:root`) y en `tailwind.config.ts` (alias `buscoedu-*`).

| Token | Hex | Uso |
|---|---|---|
| `--color-primary` | `#3b2f8f` | Botones principales, enlaces, titulares del Home. Texto blanco encima (contraste 10.56). |
| `--color-accent` | `#ff7a59` | Solo relleno de un botón o badge accionable. El texto encima es `#1a1830` (contraste 6.72). |
| `--color-highlight` | `#b43c0b` | Una palabra del titular, sobre el fondo crema (contraste 5.33) o sobre blanco (5.85). |
| `--color-bg` | `#f7f4ee` | Fondo general. |
| `--color-band` | `#ece8f7` | Bandas de «Cómo funciona» y del FAQ. |
| `--color-text` | `#1a1830` | Texto principal y color de la sombra dura. |
| `--color-success` | `#1f7a4d` | Éxito. |
| `--color-error` | `#b42318` | Error. El consentimiento no usa este color. |
| `--color-muted` | `#3e4654` | Texto secundario. Contraste ≥ 8.6 sobre crema y blanco. |
| `--color-line` | `#6f6a62` | Bordes de formulario y divisores. |
| `--radius-card` | `16px` | Radio de tarjeta. |
| `--shadow-hard` | `4px 4px 0 var(--color-text)` | Sombra dura. |

Reglas que QA marca como fallo automático:

- Coral con texto blanco.
- Coral usado como color de texto.
- Highlight sobre una banda (`--color-band`).

El botón principal del hero («Explora programas») es índigo con texto blanco. El render estático A2 pintaba ese botón de coral porque el CSS viejo usaba `--accent` como único relleno. El plan §8 y el contraste pedido separan los dos roles: principal = índigo, coral = relleno con texto tinta. En el Home el coral aparece en el birrete (ilustración, sin texto) y en el «+» del FAQ (círculo coral, signo en `#1a1830`).

Los alias `bg-buscoedu-teal`, `bg-buscoedu-action` y `text-white` apuntan al índigo, no al coral. Así los botones de Explorar, NaIA, admin y formularios siguen legibles. El hilo de NaIA usa el fondo crema (`--buscoedu-chat`) y la burbuja de NaIA es banda con texto tinta.

## Tipografía

Cargada con `next/font` en `app/layout.tsx`:

- **Anton** (`font-display`): titulares del Home.
- **Archivo** (`font-sans`): cuerpo, wordmark «BuscoEdu» y el resto del sitio.
- **JetBrains Mono** (`font-mono`): número de paso y chip «NaIA».

`prefers-reduced-motion: reduce` anula animaciones y transiciones. El foco visible es un anillo índigo de 2px (`outline: 2px solid var(--color-primary)`) separado 2px del control (`outline-offset: 2px`). El hueco muestra el fondo real, así el anillo no se pega al borde de un botón que ya es índigo. Aplica a enlaces, botones, campos y elementos con `role="button"`.

## Componentes base

En `components/restyle/`:

| Componente | Para qué |
|---|---|
| `PillButton` | Pastilla. `primary` índigo/blanco, `accent` coral/tinta, `secondary` blanco con borde. `href` la vuelve enlace; si no, es botón. |
| `HardCard` | Tarjeta blanca, borde tinta, radio 16px, sombra dura. |
| `SectionBand` | Fondo de banda a ancho completo. |
| `SectionWrap` | Columna 1120px (760px si `narrow`). |
| `FaqAccordion` | Acordeón. Botón nativo, Enter y Espacio, `aria-expanded` y `aria-controls`. |
| `LogoStrip` | Logos `{url, alt}`. Es cliente por el `onError`. Al montar, si la imagen ya falló (`complete` y `naturalWidth === 0`), se oculta igual: ese fallo ocurre antes de hidratar y no dispara `onError`. |
| `HeroIllustration` | Birrete. Sobre banda, el pompón es índigo y no highlight. |
| `HablaConNaiaButton` | Abre `NaiaEntryModal`, el mismo modal del header. |

## Secciones del Home

`app/page.tsx` es un Server Component. Orden:

1. **Hero** (`HomeHero`). Promesa, la palabra «carrera» en highlight, «Explora programas» → `/explorar`, «Habla con NaIA» → modal de NaIA. Los dos caben en el primer pantallazo a 1280 y a 390.
2. **Logos y cifras**, dentro del hero, solo con dato real.
3. **Cómo funciona** (`HomeComoFunciona`), sobre banda. Explora → Compara con NaIA → Aplica con tu permiso. El paso 3 dice que la universidad solo recibe los datos si tú autorizas el contacto.
4. **Demo NaIA** (`HomeDemoNaia`). Hilo fijo, marcado como ejemplo, no es una llamada en vivo. Explica el recorrido (pregunta → tipo de respuesta → «Habla con NaIA»). No cita un número ni una universidad: el total del catálogo no es la respuesta a un filtro, y una ficha aquí destacaría a una institución.
5. **FAQ** (`HomeFaq`), sobre banda. Las cuatro preguntas del criterio H6: ¿tiene costo?, ¿me contactan sin permiso?, ¿hace falta registrarse para explorar?, ¿qué es NaIA?

No hay testimonios.

El header y el FAB de NaIA siguen en su sitio. El FAB móvil abre la misma capa de chat de antes (`NaiaChatCapa` o el evento de Explorar). En el pie hay padding inferior en móvil para que ese FAB no tape los enlaces. Los CTA del hero quedan arriba, fuera del FAB. En móvil, la clase `a2-fab-safe` suma 6.5rem bajo las cifras, la demo y el catálogo de Explorar para poder scrollear ese contenido por encima del FAB. Las cifras y las tarjetas de Explorar, además, dejan 6rem a la derecha (`max-md:pr-24`) para que el FAB no se siente encima de la tarjeta de ciudades ni de un CTA.

## Cifras y logos

La Home **no hace fetch**. En el servidor llama directo a las funciones del Backend:

```ts
getCifrasCatalogo(): Promise<{ programas: number; ciudades: number } | null>  // src/lib/cifras-catalogo.ts
getLogosAliadas(): Promise<{ url: string; alt: string }[]>                   // src/lib/logos-aliadas.ts
```

El detalle de la consulta, la caché de 1 h y las variables está en `docs/restyle/README-backend.md`. Resumen:

- `programas` es el `total` de `obtenerOfertas()` sin filtros: el mismo conteo que Explorar (activo + publicado + validado + vigente, solo aliadas). `ciudades` son los nombres distintos de `sede.ciudad` en esas ofertas. Error, total ausente, total 0 o ninguna ciudad → `null`.
- Logos salen de `imagenes_universidad` (`tipo = 'logo'`, `activo`, aliadas) con el cliente de servicio. `alt` es el texto alternativo o, si falta, el nombre de la universidad. Sin filas o si la lectura falla → `[]`.
- `GET /api/home/cifras` y `GET /api/aliadas/logos` exponen el mismo contrato. La Home no los llama.

### Qué se pinta y qué no

| Situación | Qué ve la persona |
|---|---|
| `getCifrasCatalogo()` devuelve `null`, lanza, o un número que no es positivo | La franja de cifras no existe. Nunca un «0». |
| Devuelve `{ programas: 50, ciudades: N }` con ambos > 0 | Dos tarjetas con esos números. |
| `getLogosAliadas()` devuelve `[]` o logos sin `url`/`alt` | La franja de logos no existe, sin hueco. |
| Una URL de logo falla (`onError`) | Ese logo se quita. Si no queda ninguno, desaparece la franja. No hay icono roto ni recuadro de relleno. |
| Error de catálogo | No se disfraza de «0 resultados». En el Home la franja se omite. Explorar sigue mostrando su propio estado de error (Ola 2 no lo toca). |

QA compara el «programas» del Home con el total de Explorar sin filtros. Tienen que coincidir porque salen de `obtenerOfertas`. Hoy ese total es 50 en el entorno de QA.

## Cómo verificar

```bash
npx tsc --noEmit
npm test
npx next build
npm run dev
```

Este repo no tiene ESLint (`next lint` no existe en Next 16). `npm test` corre los tests de cifras, logos y del funnel.

En el navegador, Home (`/`):

- **1280 y 390** (y 360 de ancho). Los dos CTA del hero se ven sin hacer scroll y no quedan debajo del header ni del FAB.
- El botón índigo tiene texto blanco. El «+» del FAQ es coral con signo oscuro. «carrera» es highlight sobre crema. En «Cómo funciona» y en el FAQ (van sobre banda) no hay texto highlight.
- FAQ: clic, Enter y Espacio abren y cierran. `aria-expanded` cambia. La primera pregunta empieza abierta.
- «Explora programas» lleva a `/explorar`. «Habla con NaIA» abre el modal existente; al enviar, sigue a `/naia`.
- Sin logos cargados, no aparece «Universidades aliadas».
- Sin variables de Supabase, no aparecen cifras. Con variables y catálogo, el número de programas es el de Explorar.
- Recorrer Explorar, una ficha, Mi lista y el FAB: los botones con texto blanco siguen sobre índigo o tinta, no sobre coral.
- Activar «reducir movimiento» en el sistema: el FAB no escala con una transición larga.

Contrastes de referencia (texto normal, salvo donde se indica):

| Par | Ratio |
|---|---|
| Blanco sobre `#3b2f8f` | 10.56 |
| `#1a1830` sobre `#ff7a59` | 6.72 |
| `#b43c0b` sobre `#f7f4ee` | 5.33 |
| `#b43c0b` sobre blanco | 5.85 |
| `#3b2f8f` sobre `#f7f4ee` | 9.62 |
| `#1a1830` sobre `#f7f4ee` | 15.72 |

## Correcciones de Home (en la Ola 2)

- **H5.** La demo ya no dice «Encontré N programas» para la pregunta de ejemplo. Ese N era el total del catálogo, no el filtro. El bloque explica cómo responde NaIA y cierra con «Habla con NaIA».
- **T10.** El hero mantiene «catálogo de universidades aliadas»: Backend confirmó que `obtenerOfertas` solo devuelve aliadas. «Aplica en minutos» pasó a «aplica fácil».
- **H6.** El acordeón no se tocó en esta ola. Las cuatro preguntas siguen en el HTML como botones con `aria-expanded`.

## Ola 2 · Explorar y detalle

Solo visual. La consulta sigue siendo `obtenerOfertas` (activo + publicado + validado + vigente + aliadas). Guardar en Mi lista, Aplicar y Autorizar contacto siguen siendo tres acciones.

| Pieza | Qué cambió |
|---|---|
| `components/explorar/OfferCard.tsx` | Tarjeta con sombra dura, chip «Aliada», modalidad y ciudad si vienen, beca solo si el beneficio lo dice. Sin precio inventado. «Ver detalle» abre la ficha. «Guardar en Mi lista» no aplica. Mismo tamaño para todas las universidades. |
| `components/explorar/ExplorarFiltros.tsx` | En web, filtros fijos arriba (ciudad, modalidad, con beca) y «Aplicar filtros». En móvil, hoja inferior con cierre por botón, fondo o Escape. «Solo aliadas» es un rótulo, no un interruptor: el catálogo ya está filtrado. No hay filtro de precio porque ese dato no existe. |
| `components/explorar/OfferDetailModal.tsx` | Orden: qué es, vigencia (si hay fecha), becas, acciones. Aplicar en índigo con texto blanco. Guardar en contorno, con el aviso «Guardado en Mi lista» o «Quitado de Mi lista». Autorizar contacto no está en esta tarjeta. |
| `components/naia/NaiaSearchExperience.tsx` | En `/explorar` el catálogo es la página. El chat se abre con el FAB y se cierra con «Volver al catálogo». Vacío: «No hay programas con esos filtros» y «Limpiar filtros». Error: borde `--color-error`, texto de error y «Reintentar». Carga: esqueleto. El conteo sale de `total` cuando la consulta respondió bien. El re-skin del hilo está en la Ola 3. |
| `AplicacionConsentimientoModal` | El botón «Autorizar contacto» es índigo con texto blanco. Sigue deshabilitado si falta un consentimiento obligatorio. La casilla no viene marcada. El resto del funnel no cambia. |

El coral no se usa como texto ni como relleno de Aplicar o de Autorizar contacto. El highlight de «programas» va sobre el fondo crema, no sobre una banda.

## Ola 3 · NaIA y Demo WApp

Solo visual. No cambian prompts, el tope de ~8 fichas, la llamada a `/api/naia` ni el consentimiento (`FunnelEnHilo` y `AplicacionConsentimientoModal` siguen igual: casilla sin marcar, «Autorizar contacto» índigo y deshabilitado hasta el obligatorio).

| Criterio | Cómo se ve |
|---|---|
| N1 | Burbujas, chips, FAB, input e indicador de escritura usan tokens A2. |
| N2 | Las fichas dentro de NaIA son las mismas `OfferCard` (o la fila móvil neutra). Mismo tamaño para todas las universidades. |
| N3 | El FAB se puede minimizar a un círculo «N». En móvil, `a2-fab-safe` y margen derecho dejan los CTA fuera del FAB. |
| N4 | Guardar en Mi lista, Aplicar y Autorizar contacto siguen siendo tres acciones. La ficha es la real. |
| N5 | Escribiendo: puntos en la burbuja de banda. Error de NaIA: «No pude responder, intenta de nuevo» y Reintentar. Sin resultados: borde punteado, sin color de error. |
| N6 | Estudiante: índigo `#3b2f8f` y texto blanco. NaIA: banda `#ece8f7` y texto `#1a1830`. Coral nunca con texto blanco. |

### Cómo probar

1. Home, bloque «Pregúntale a NaIA»: el ejemplo no cita un precio ni un número. La burbuja de la persona es índigo; la de NaIA, banda.
2. «Cómo funciona», paso 1: lista los filtros reales (programa o área, nivel, país, ciudad, universidad, modalidad y beneficio). No dice precio.
3. `/naia`: enviar un mensaje. Mientras responde, se ve el indicador. Si `/api/naia` falla: «No pude responder, intenta de nuevo».
4. `/explorar`: el FAB abre el hilo y «Volver al catálogo» lo cierra. En 390 y 360 el FAB no tapa Aplicar, Guardar ni el «+» del FAQ.
5. Demo WApp: el hilo ya no usa el verde de WhatsApp en burbujas, cabecera ni enviar. El funnel no se rediseñó.

### Textos de comparación (sin precio)

NaIA puede prometer comparar modalidad, ciudad, becas y beneficios, y vigencia. No promete precio.

| Dónde | Antes | Ahora |
|---|---|---|
| `HomeComoFunciona` paso 1 | «ciudad, modalidad, precio y beca» | «programa o área, nivel, país, ciudad, universidad, modalidad y beneficio» |
| `HomeDemoNaia` | «modalidad, ciudad, precio y becas» | «modalidad, ciudad, becas y beneficios, y vigencia» |
| Vacío de NaIA (`EmptyResults`) | comparaba con precio en copys anteriores | «modalidad, ciudad, becas y beneficios, y vigencia» |

Se dejan los avisos que dicen que BuscoEdu **no garantiza** precios (pie, términos, cómo funciona, beneficios, héroe de NaIA y el descargo del hilo). También el admin de precios y el «¿Tiene costo para mí?» del FAQ.

### QA de la Ola 2, en este mismo cambio

1. **Etiquetas de beneficio.** Un solo mapa: `etiquetaBeneficio()` y `ETIQUETAS_BENEFICIO` en `src/lib/etiquetas-beneficio.ts` (Backend). La tarjeta, la ficha y el chip de NaIA importan esa función. Si devuelve `null` (código null, vacío o solo espacios) no hay chip y no hay sección. «Beneficio disponible» solo si el helper lo devuelve para un código que sí existe y no está en el mapa. No se pinta un código crudo. Mapa aprobado, normalizando con `toLowerCase()`: `beca_postulacion` «Beca por postulación»; `beca_apropiacion_directa` «Beca directa (sin postulación)»; `descuento` «Descuento»; `financiacion` «Financiación»; `beneficio_convenio` «Beneficio por convenio»; `beneficio_temporal` «Beneficio temporal»; `otro` u otro código desconocido «Beneficio disponible».
2. **H5.** El demo del Home ya no dice «precio».
3. **FAQ a 390.** El «+» de «¿Qué es NaIA?» no queda bajo el FAB: la sección tiene `a2-fab-safe` y el acordeón va en un envoltorio `max-md:pr-36`.
4. **Cerrar de la ficha.** Icono X, `aria-label="Cerrar"`, blanco de toque 44px (`h-11 w-11`). El texto «Cerrar» ya no entra en el círculo.

La sección de la ficha y el filtro de Explorar (grupo y campo en «Más filtros», y el chip activo) se llaman «Becas y beneficios», porque cubren descuento y financiación. El atajo de la barra sigue diciendo «Con beca»: solo activa `tipo_beneficio = "Beca"`.

**El import de `etiquetaBeneficio` no está cableado en este árbol** hasta que `src/lib/etiquetas-beneficio.ts` esté en `origin/feat/restyle-a2`. No hay un mapa local ni un stub.

### Archivos de esta ola

`app/globals.css`, `components/home/HomeComoFunciona.tsx`, `components/home/HomeDemoNaia.tsx`, `components/home/HomeFaq.tsx`, `components/layout/Header.tsx`, `components/naia/NaiaSearchExperience.tsx`, `components/naia/NaiaChatCapa.tsx`, `components/naia/NaiaMessage.tsx`, `components/naia/NaiaEntryModal.tsx`, `components/naia/SuggestedActions.tsx`, `components/demowapp/DemoWappPanel.tsx`, `components/explorar/OfferDetailModal.tsx`, `components/explorar/FilterPanel.tsx`, `components/explorar/ExplorarFiltros.tsx`. `OfferCard` y el chip de la fila NaIA quedan listos para el import.

**Fuera de estas olas, y no bloquea el look del Home:**

- Subir los 5 logos con permiso de uso al bucket `logos-aliadas` (ver `docs/bd/README-restyle-logos-bucket.md`). Hasta entonces la franja no aparece.
- Cruzar los colores reales de Sergio Arboleda, UNIR y Asturias con el índigo. Si alguna usa índigo o morado, reevaluar (fallback B del plan).
- Lead Center: solo comprobar que sigue operable. No lleva sombra dura ni ilustraciones.
- Testimonios: no van hasta tener textos reales y autorizados.
