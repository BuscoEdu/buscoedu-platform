# Cierre Ola 2 Frontend — BA-005

**Rama:** `feat/lote-ba-sep26`  
**Fecha:** 27 de septiembre de 2026  
**Alcance:** UI de Mi lista, NaIA y Explorar. Sin PR. Sin cambios de lógica en `src/lib/ofertas.ts`. Sin ElBúho.

Contrato: `docs/ba-005-contrato-obtener-ofertas.md`. El frontend discrimina por `ok`.

## Problema

`obtenerOfertas` y `obtenerOfertasPorIds` ya no disfrazan un fallo como `{ ofertas: [], total: 0 }` exitoso. El FE seguía tratando `!ok` como lista vacía o como “0 resultados”.

## Comportamiento

### Mi lista (`app/mi-lista/page.tsx`)

| Estado | Cuándo | Qué ve la persona |
|--------|--------|-------------------|
| Cargando | consulta en curso | “Cargando...” (`role="status"`) |
| Error | `ok: false` | “No pudimos cargar tu lista” + **Reintentar**. No dice que la lista esté vacía. |
| Vacío | `ok: true` y `ofertas.length === 0` | “Tu lista está vacía” (o sin opciones publicadas si había IDs guardados) |
| Éxito | `ok: true` y hay ofertas | Tarjetas y “Vaciar lista” |

Reintentar vuelve a llamar `obtenerOfertasPorIds` con los mismos IDs.

### NaIA y Explorar (`components/naia/NaiaSearchExperience.tsx`)

`/explorar` monta el mismo componente (`layoutVariant="explorar"`).

| Situación | UI |
|-----------|----|
| `ok: false` en la primera página | Título “No pudimos consultar las opciones”. Alerta con **Reintentar**. El chat no usa el copy de “0 resultados”. |
| `ok: true` y cero ofertas | “Sin coincidencias en el catálogo” y el texto de ampliar la búsqueda. |
| Fallo al cargar más | Se conservan ofertas y total de la página ya exitosa. No se marca como página nueva cargada. Alerta “No pudimos cargar más resultados” + **Reintentar**. |
| Fallo de NaIA antes del catálogo | “No pudimos completar la búsqueda” + **Reintentar**, sin conteo en cero. |

La página siguiente usa índice base 0 (`Math.floor(cargadas / 10)`), como define `obtenerOfertas`. Antes se pasaba el conteo acumulado como si fuera la página.

Copy de interfaz en español. Errores con `role="alert"`. Botón **Reintentar** a 44px de alto mínimo. En móvil el aviso también aparece en el chat.

## Fuera de alcance

- Lógica de consulta en `src/lib/ofertas.ts` (el union `ok` ya estaba)
- ElBúho
- Apertura de PR

## Checklist QA

- [ ] Mi lista, sin IDs: vacío real (“Tu lista está vacía”), no alerta técnica
- [ ] Mi lista, `ok: false`: alerta + Reintentar; no aparece “Tu lista está vacía”
- [ ] Mi lista, Reintentar: vuelve a “Cargando...” y luego error o listado
- [ ] Mi lista, `ok: true` con ofertas: tarjetas
- [ ] NaIA o Explorar, `ok: false`: no dice “0 resultados”; hay Reintentar
- [ ] NaIA o Explorar, `ok: true` y total 0: “Sin coincidencias en el catálogo”
- [ ] Cargar más con `ok: false`: las tarjetas previas siguen; no crece el listado; Reintentar visible
- [ ] Móvil: el aviso de error se lee en el chat y en el panel de resultados
