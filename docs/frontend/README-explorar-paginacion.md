# Explorar — paginación estable de «Mostrar más»

**Rama:** `feat/e1-fe-admin-ia` (local) · **Fecha:** 2026-10-18 · **Quién:** Frontend BuscoEdu (bot FE)

## Qué pasaba
En `/explorar` (y en `/naia`) el botón «Mostrar 10 resultados más» se quedaba en **14 de 50**:

1. `obtenerOfertas` (`src/lib/ofertas.ts`) ordenaba **solo** por `creado_en desc`. En una carga masiva muchas ofertas comparten `creado_en`; sin un desempate, Postgres puede devolver los empates en otro orden en cada consulta, así que `range(10, 19)` repetía filas de la página 0 y se saltaba otras.
2. `NaiaSearchExperience` calculaba la siguiente página como `floor(ofertas.length / 10)` **después de quitar repetidos** (14 → página 1 otra vez) y, si una página llegaba toda repetida, recortaba el total a lo que había en pantalla.

## Qué se cambió
- **Orden total:** `creado_en desc` + `id asc` (`ORDEN_ESTABLE_OFERTAS`). El rango y «hay más» salen de `rangoPagina` / `hayMasPaginas` (página vacía → no hay más).
- **Paginación por páginas pedidas:** `paginasCargadasRef` cuenta las páginas pedidas con éxito; la siguiente es `paginaAPedir(paginasCargadas)`. `siguientePagina` agrega solo ids nuevos y mantiene el total del servidor mientras diga que hay más. Una sesión restaurada equivale a `ceil(cantidad / 10)` páginas.
- Código puro en `src/lib/paginacion-ofertas.ts`, con pruebas en `src/lib/paginacion-ofertas.test.ts` (mock de 50 filas con `creado_en` repetido: llega a 50/50 sin duplicados y en el orden del servidor; regresión: la lógica vieja no llega).

## Coordinar con BE
`src/lib/ofertas.ts` es la capa de datos del contrato BA-005 (`docs/ba-005-contrato-obtener-ofertas.md`). El cambio es mínimo (orden + cálculo de rango/«hay más»), no cambia filtros, columnas ni la forma de `ResultadoOfertas`, y beneficia también a NaIA, WhatsApp (`src/lib/whatsapp/catalogo-supabase.ts`) y al corredor de Demo WApp. Pedido a BE:
- revisar y adoptar el orden en el contrato BA-005 (agregar «orden: `creado_en desc, id asc`»);
- opcional: índice `ofertas_academicas (creado_en DESC, id)` si el volumen crece.

## Evidencia
Capturas en `/workspace/e1-fe-capturas/post-qa/{antes,despues}-{web,m390}-03-explorar-final.png`, con un PostgREST simulado de 50 filas (orden sin desempate = empates barajados por consulta). Antes: 48/50 (web) y 47/50 (390) con offsets repetidos. Después: 5 consultas `offset` 0,10,20,30,40 y 50/50 distintas.

## Bitácora
| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 | Orden estable `creado_en desc, id asc` + paginación por páginas pedidas + 7 pruebas. | «Mostrar más» se quedaba en 14 de 50. | Frontend BuscoEdu (bot FE) |
