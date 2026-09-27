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
