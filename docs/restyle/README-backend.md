# Restyle A2 · Ola 1/3 · Backend

Solo servidor. No cambia UI, RLS ni el schema en producción.

## Cifras del catálogo

La cifra del Home sale de la misma consulta que Explorar: `obtenerOfertas` en `src/lib/ofertas.ts`, llamada **sin filtros extra** (el catálogo que abre `/explorar`). Esa función ya exige oferta `activo = true`, `estado_publicacion = 'publicado'`, `estado_validacion = 'validado'`, vigencia abierta (`vigente_desde <= hoy` y `vigente_hasta` nulo o `>= hoy`) y `universidad_id` dentro de las aliadas (`resolverIdsAliadas`).

`programas` es el `total` de esa consulta (el conteo que muestra Explorar). `ciudades` es la cantidad de `sede.ciudad` distintas en esas mismas ofertas.

### `getCifrasCatalogo(): Promise<{ programas: number; ciudades: number } | null>`

| Resultado | Cuándo |
|---|---|
| `{ programas, ciudades }` | `programas >= 1` y `ciudades >= 1` |
| `null` | error, excepción, total ausente, total `0`, o ninguna ciudad en el conjunto |

No se inventa un número y no se devuelve un `0`.

### `GET /api/home/cifras`

- 200 con el JSON de la función, incluido `null`.
- Ejemplos: `{"programas":120,"ciudades":8}` o `null`.
- Cache: `export const revalidate = 3600` y `Cache-Control: public, s-maxage=3600, stale-while-revalidate=3600`.

## Logos de aliadas

Lee `imagenes_universidad` con el cliente de servicio (`getServiceRoleClient`). La RLS sigue siendo solo super-admin; no se toca.

Filtro de lectura: `tipo = 'logo'`, `activo = true`, `universidad_id` en `idsAliadasDesdeEnv()` (`NEXT_PUBLIC_ALIADAS_IDS`). La migración no tiene columna de soft delete (`deleted_at` / `eliminado_en`); `activo` es el flag. FK: `universidad_id`.

Un logo por universidad: gana `es_principal`; si no hay principal, el `orden` menor. La lista queda ordenada por `orden`.

`url_storage` es la ruta dentro del bucket. La URL pública se arma con `storage.from(bucket).getPublicUrl(ruta)`. Si el valor ya empieza por `http://` o `https://`, se devuelve tal cual.

`alt` es `texto_alternativo`. Si viene vacío, es el nombre de la universidad (`nombre_oficial`, o `nombre_corto`). La respuesta solo trae `url` y `alt`.

### `getLogosAliadas(): Promise<{ url: string; alt: string }[]>`

| Resultado | Cuándo |
|---|---|
| `[{ url, alt }, ...]` | hay al menos un logo usable |
| `[]` | sin ids, sin filas, sin URL o error |

### `GET /api/aliadas/logos`

- 200 con el arreglo, o `[]`.
- Ejemplo: `[{"url":"https://<proyecto>.supabase.co/storage/v1/object/public/logos-aliadas/poli/logo.svg","alt":"Politécnico Grancolombiano"}]`.
- Misma cache de 1 hora que las cifras.

## Variables

| Variable | Uso |
|---|---|
| `SUPABASE_LOGOS_BUCKET` | Bucket de los logos. Si falta o está en blanco: `logos-aliadas`. |
| `NEXT_PUBLIC_ALIADAS_IDS` | UUIDs separados por coma. El parser es `idsAliadasDesdeEnv` en `src/lib/aliadas.ts`. Es la fuente de verdad del corredor. Sin ella, el fallback es igualdad exacta de nombre (nunca `ilike` con `%`). Ver `docs/backend/README-aliadas-catalogo.md`. |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Las cifras usan el mismo cliente anónimo que Explorar. |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo logos, en servidor. |

El bucket y las policies están descritos en `docs/bd/README-restyle-logos-bucket.md`. Ese SQL no se aplica desde aquí.

## Cómo probar

```bash
npm test
npm run build
```

`npm test` corre `node --test` (el runner del repo, `node:test`) sobre estas cifras, estos logos, la etiqueta de beneficio y los tests que ya existían.

Con el servidor y las env de arriba:

```bash
curl -s http://localhost:3000/api/home/cifras
curl -s http://localhost:3000/api/aliadas/logos
```

Sin catálogo vigente o si la consulta falla, cifras responde `null`. Sin logos cargados o si la lectura falla, logos responde `[]`.

## Etiqueta de beneficio

`etiquetaBeneficio(codigo: string | null | undefined): string | null` está en `src/lib/etiquetas-beneficio.ts`. El mapa exportado es `ETIQUETAS_BENEFICIO` (Frontend puede importarlo). Los códigos son los 7 de `public.tipos_beneficio` en `supabase/migrations/20260129000400_create_tipos_beneficio.sql`. En las ofertas llegan en mayúscula. Antes de buscar se normaliza con `String(codigo ?? '').trim().toLowerCase()`.

| Código | Etiqueta |
|---|---|
| `beca_postulacion` | Beca por postulación |
| `beca_apropiacion_directa` | Beca directa (sin postulación) |
| `descuento` | Descuento |
| `financiacion` | Financiación |
| `beneficio_convenio` | Beneficio por convenio |
| `beneficio_temporal` | Beneficio temporal |
| `otro` | Beneficio disponible |
| cualquier otro código no vacío | Beneficio disponible |
| `null`, `undefined` o vacío (también solo espacios) | `null` |

No se devuelve el código crudo. `null`, `undefined` o vacío después de trim devuelven `null`: no se inventa un beneficio. «Beneficio disponible» solo aplica cuando hay un código no vacío sin etiqueta propia. Eso incluye `otro` y cualquier código desconocido.

NaIA (`lib/agentes/AgenteExecutor.ts`, `lib/agentes/ejecutar-w1.ts`) y el Demo WApp (`src/lib/demowapp/buscar-ofertas-corredor.ts`) mandan la etiqueta al prompt. Si la función devuelve `null`, omiten el campo: no se manda texto de beneficio. La voz de NaIA (`lib/agentes/vozNaia.ts`) pide no escribir códigos en `MAYÚSCULAS_CON_GUIONES`.
