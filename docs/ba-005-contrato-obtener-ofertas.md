# BA-005 — Contrato discriminado de `obtenerOfertas`

## Problema

Antes, ante error de consulta o excepción, `obtenerOfertas` y `obtenerOfertasPorIds`
devolvían `{ ofertas: [], total: 0, ... }` o `[]`. El frontend interpretaba eso como
**“0 resultados reales”**, ocultando fallos de red/BD y mostrando mensajes del tipo
“No encontré resultados”.

## Contrato nuevo

`ResultadoOfertas` es un union discriminado por `ok`:

```ts
export type ResultadoOfertas =
  | {
      ok: true;
      ofertas: OfertaAcademica[];
      total: number;
      page: number;
      pageSize: number;
      hasMore: boolean;
    }
  | {
      ok: false;
      error: { code: string; message: string };
      ofertas: [];
      total: 0;
      page: number;
      pageSize: number;
      hasMore: false;
    };
```

`obtenerOfertasPorIds` usa el mismo patrón:

```ts
export type ResultadoOfertasPorIds =
  | { ok: true; ofertas: OfertaAcademica[] }
  | { ok: false; error: { code: string; message: string }; ofertas: [] };
```

## Ejemplos JSON para FE

### Éxito (búsqueda con resultados)

```json
{
  "ok": true,
  "ofertas": [
    {
      "id": "uuid-oferta",
      "nombre": "Derecho — presencial Bogotá",
      "programa_id": "uuid-programa",
      "universidad_id": "uuid-universidad",
      "vigente": true
    }
  ],
  "total": 12,
  "page": 0,
  "pageSize": 10,
  "hasMore": true
}
```

### Éxito vacío (0 resultados reales de catálogo)

```json
{
  "ok": true,
  "ofertas": [],
  "total": 0,
  "page": 0,
  "pageSize": 10,
  "hasMore": false
}
```

> Nota: en éxito vacío `total` es `0` (número). El ejemplo anterior usa `0`.

### Error de consulta (NO confundir con 0 resultados)

```json
{
  "ok": false,
  "error": {
    "code": "ofertas_query_failed",
    "message": "…"
  },
  "ofertas": [],
  "total": 0,
  "page": 0,
  "pageSize": 10,
  "hasMore": false
}
```

### `obtenerOfertasPorIds` — error

```json
{
  "ok": false,
  "error": {
    "code": "ofertas_by_ids_query_failed",
    "message": "…"
  },
  "ofertas": []
}
```

## Guía FE

```ts
const resultado = await obtenerOfertas(filtros, page, pageSize);

if (!resultado.ok) {
  // Mostrar error de sistema / reintento. NO decir "0 resultados".
  mostrarError(resultado.error.message);
  return;
}

if (resultado.ofertas.length === 0) {
  // 0 resultados reales del catálogo.
  mostrarSinResultados();
} else {
  renderizar(resultado.ofertas, resultado.total);
}
```

## Callers actualizados en este lote

- `components/naia/NaiaSearchExperience.tsx` — lanza/estado error si `!ok`.
- `app/mi-lista/page.tsx` — si `!ok`, lista vacía (sin fingir catálogo OK).

Archivo fuente: `src/lib/ofertas.ts`.

## Orden y paginación (desde 2026-10-18, commit FE `c5fb085`)

### Firma (sin cambios)

```ts
obtenerOfertas(filtros: FiltrosOferta = {}, page: number = 0, pageSize: number = 20): Promise<ResultadoOfertas>
```

- `page` es **base 0**. Un valor no finito o negativo cae a `0`.
- `pageSize` por defecto es **20** (`PAGE_SIZE_DEFAULT`), igual que antes del cambio. Un valor no finito o ≤ 0 cae a `20`.
- La forma de `ResultadoOfertas` no cambió (mismas claves: `ok`, `ofertas`, `total`, `page`, `pageSize`, `hasMore`, y `error` cuando `ok: false`).

### Orden

`ORDER BY creado_en DESC, id ASC` (constante `ORDEN_ESTABLE_OFERTAS` en `src/lib/paginacion-ofertas.ts`).

- **Qué cambió:** antes solo se ordenaba por `creado_en desc`. Ahora se desempata por `id asc`.
- **Por qué:** en una carga masiva muchas ofertas comparten `creado_en`. Sin desempate, Postgres podía devolver los empates en otro orden en cada consulta, y `range()` repetía unas filas y se saltaba otras («Mostrar más» se quedaba en 14 de 50). Con el `id` el orden es total y la página N siempre trae las mismas filas.
- **Efecto para callers:** a igual `creado_en`, el orden ahora es estable. Ningún caller dependía del orden de los empates.

### Paginación

- Rango PostgREST: `desde = page * pageSize`, `hasta = desde + pageSize - 1` (`rangoPagina`). En la URL se ve como `offset`/`limit`.
- `total` = conteo exacto del servidor (`count: 'exact'`), siempre el del catálogo filtrado completo, no el de la página.
- `hasMore` = `recibidas > 0 && desde + recibidas < total` (`hayMasPaginas`). Una página vacía nunca dice «hay más». Página fuera de rango → `{ ok: true, ofertas: [], total: <real>, hasMore: false }` (éxito vacío, no error).
- **La paginación no es nueva:** `page`/`pageSize` y `.range()` ya existían. El commit solo cambió el orden y movió el cálculo de rango y `hasMore` a funciones puras.

### Callers revisados (veredicto BA-005: compatible ✓)

| Caller | Llamada | Resultado |
|---|---|---|
| NaIA / Explorar — `components/naia/NaiaSearchExperience.tsx` | `obtenerOfertas(filtros, 0, 10)` y luego `(filtros, pagina, 10)` en «Mostrar más» | Igual que antes. Pagina por páginas pedidas (`paginaAPedir`/`siguientePagina`) |
| WhatsApp — `src/lib/whatsapp/catalogo-supabase.ts` | `obtenerOfertas(filtros, 0, min(max(1, max), 8))` | Igual que antes: máx. 8 fichas **por diseño** (BA-032). No hay corte nuevo |
| Demo WApp — `src/lib/demowapp/buscar-ofertas-corredor.ts` | `obtenerOfertas(filtros, 0, 5)` | Igual que antes: 5 ofertas en la mesa + `total` real |
| Cifras del Home — `src/lib/cifras-catalogo.ts` | recorre `obtenerOfertas({}, page, 100)` hasta `total` (tope 30 páginas) | Igual que antes: cuenta todo el catálogo, sin truncar |
| Mi lista — `app/mi-lista/page.tsx` | `obtenerOfertasPorIds(ids)` | No afectado (no pagina; ordena por el orden de los ids) |

Ningún caller depende del `pageSize` por defecto: todos pasan un tamaño explícito. El default sigue en 20, así que **no hay truncado silencioso nuevo**. Por eso no se tocó `src/lib/ofertas.ts`.

Pruebas: `src/lib/ofertas-contrato-ba005.test.ts`. Usan un PostgREST de mentira (sin red ni BD) y revisan la consulta real: `order=creado_en.desc,id.asc`, `offset`/`limit` por página, 5 páginas de 10 sin duplicados, defaults (0/20), página fuera de rango, NaIA (10), WhatsApp (8 y 3), Demo WApp (5) y cifras del Home (páginas de 100 hasta 150). Para cargar los callers reales, `scripts/resolve-ts-tests.mjs` ahora entiende el alias `@/`.

### Índice propuesto (NO aplicado)

`supabase/migrations_pendientes/20261018170000_ba005_indice_orden_ofertas.sql` (fuera de `migrations/`: `db push` no la aplica) (deshacer: `supabase/ops/20261018_ba005_indice_orden_ofertas_deshacer.sql`):

```sql
create index if not exists idx_ofertas_academicas_creado_en_desc_id
  on public.ofertas_academicas (creado_en desc, id);
```

- **NO APLICADA – requiere OK de Jhon y plan de BD.** Es para que la revise el bot de Base de datos.
- Tiene el mismo orden que el `ORDER BY`, así que Postgres puede recorrer el índice y cortar en `LIMIT` sin ordenar todo el catálogo en cada página.
- Se propone compuesto simple y no parcial. Los filtros (`activo`, `estado_publicacion`, `estado_validacion`) dejan pasar casi todo lo publicado, y un índice parcial solo se usa si el planner puede probar el predicado (con parámetros de PostgREST podría ignorarlo). La alternativa parcial queda comentada en el archivo para decidir con `EXPLAIN` en staging.
- Hoy el catálogo es chico (≈50 ofertas en QA). El índice es preventivo, no urgente.

## Bitácora

| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 | Revisión post-QA del contrato tras `c5fb085` (orden `creado_en desc, id asc` + paginación). Veredicto: compatible. Pruebas nuevas del contrato y de los callers NaIA/WhatsApp/Demo WApp/Home. Índice `(creado_en desc, id)` propuesto como migración local **no aplicada**. | Confirmar que el orden estable de «Mostrar más» no rompe a NaIA, WhatsApp ni Demo WApp, y dejar documentados el orden, la paginación y el índice. | Backend BuscoEdu (bot) |
| 2026-10-18 | El índice pasa a `supabase/migrations_pendientes/`. `actualizado_por` en GET proveedores queda en standby (sin columna nueva). | Que `supabase db push` no lo aplique sin OK de Jhon; decisión del Orquestador. | Backend BuscoEdu (bot), por plan del Orquestador |
