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

Los alias `bg-buscoedu-teal`, `bg-buscoedu-action` y `text-white` apuntan al índigo, no al coral. Así los botones de Explorar, NaIA, admin y formularios siguen legibles aunque esa pantalla todavía no esté rediseñada. El chat de NaIA conserva sus fondos (`--buscoedu-chat`) hasta la Ola 3.

## Tipografía

Cargada con `next/font` en `app/layout.tsx`:

- **Anton** (`font-display`): titulares del Home.
- **Archivo** (`font-sans`): cuerpo, wordmark «BuscoEdu» y el resto del sitio.
- **JetBrains Mono** (`font-mono`): número de paso y chip «NaIA».

`prefers-reduced-motion: reduce` anula animaciones y transiciones. El foco visible es un anillo tinta de 2px.

## Componentes base

En `components/restyle/`:

| Componente | Para qué |
|---|---|
| `PillButton` | Pastilla. `primary` índigo/blanco, `accent` coral/tinta, `secondary` blanco con borde. `href` la vuelve enlace; si no, es botón. |
| `HardCard` | Tarjeta blanca, borde tinta, radio 16px, sombra dura. |
| `SectionBand` | Fondo de banda a ancho completo. |
| `SectionWrap` | Columna 1120px (760px si `narrow`). |
| `FaqAccordion` | Acordeón. Botón nativo, Enter y Espacio, `aria-expanded` y `aria-controls`. |
| `LogoStrip` | Logos `{url, alt}`. Es cliente por el `onError`. |
| `HeroIllustration` | Birrete. Sobre banda, el pompón es índigo y no highlight. |
| `HablaConNaiaButton` | Abre `NaiaEntryModal`, el mismo modal del header. |

## Secciones del Home

`app/page.tsx` es un Server Component. Orden:

1. **Hero** (`HomeHero`). Promesa, la palabra «carrera» en highlight, «Explora programas» → `/explorar`, «Habla con NaIA» → modal de NaIA. Los dos caben en el primer pantallazo a 1280 y a 390.
2. **Logos y cifras**, dentro del hero, solo con dato real.
3. **Cómo funciona** (`HomeComoFunciona`), sobre banda. Explora → Compara con NaIA → Aplica con tu permiso. El paso 3 dice que la universidad solo recibe los datos si tú autorizas el contacto.
4. **Demo NaIA** (`HomeDemoNaia`). Hilo fijo, marcado como ejemplo, no es una llamada en vivo. El tono no recomienda «la mejor» universidad. Si hay cifra real de programas, la frase usa ese total del catálogo; si no, no inventa un número. No se pinta una ficha con nombre de universidad: mostrar una sola oferta aquí la destacaría.
5. **FAQ** (`HomeFaq`), sobre banda. Las cuatro preguntas del criterio H6: ¿tiene costo?, ¿me contactan sin permiso?, ¿hace falta registrarse para explorar?, ¿qué es NaIA?

No hay testimonios.

El header y el FAB de NaIA siguen en su sitio. El FAB móvil abre la misma capa de chat de antes (`NaiaChatCapa` o el evento de Explorar). En el pie hay padding inferior en móvil para que ese FAB no tape los enlaces. Los CTA del hero quedan arriba, fuera del FAB.

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

## Pendiente para las olas 2 y 3

**Ola 2 — Explorar, detalle y consentimiento (solo visual):**

- Tarjeta con modalidad, ciudad, precio vigente y beca. Chip «Aliada» del mismo tamaño para todas.
- Filtros fijos en web y hoja inferior en móvil, con «Aplicar filtros» visible.
- Estados de carga, vacío y error distintos entre sí.
- Tres acciones que no se fusionan: Aplicar (índigo, texto blanco), Guardar en Mi lista (contorno), Autorizar contacto (paso propio, índigo con texto blanco, no coral).
- Consentimiento en paso propio, casilla sin marcar, sin rojo de alarma. El error de validación sí puede usar `--color-error`, solo en el texto de ayuda.

**Ola 3 — NaIA y Demo WApp, solo tokens:**

- Burbuja, chips y FAB con la paleta A2. Contraste de los dos lados del chat.
- No se tocan prompts, consentimiento ni el tope de fichas.
- El FAB no tapa CTA en 390 ni en 360.

**Fuera de estas olas, y no bloquea el look del Home:**

- Subir los 5 logos con permiso de uso al bucket `logos-aliadas` (ver `docs/bd/README-restyle-logos-bucket.md`). Hasta entonces la franja no aparece.
- Cruzar los colores reales de Sergio Arboleda, UNIR y Asturias con el índigo. Si alguna usa índigo o morado, reevaluar (fallback B del plan).
- Lead Center: solo comprobar que sigue operable. No lleva sombra dura ni ilustraciones.
- Testimonios: no van hasta tener textos reales y autorizados.
