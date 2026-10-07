# Restyle A2 · Ola 1/3 · BD — Bucket de logos de aliadas

**Estado:** SQL listo para pegar, **NO aplicado en prod**. Se aplica solo cuando Orquestador lo pida a Jhon (“Jhon, …”).

## Qué resuelve
La franja de logos del Home (criterio H del restyle) necesita los logos de las 5 aliadas. La tabla `public.imagenes_universidad` ya existe (`tipo`, `url_storage`, `texto_alternativo`, `es_principal`, `orden`, `activo`), pero:
- No había bucket de Storage para los archivos.
- Su RLS solo deja leer a super-admin, así que **BE lee la tabla del lado del servidor** (`getLogosAliadas()`) y no se abre la RLS.

## Archivo
`supabase/ops/20261007_restyle_bucket_logos_aliadas.sql` (ops, no migración; idempotente):

| Bloque | Qué hace | Escribe |
|---|---|---|
| 0 | Diagnóstico: ¿existe el bucket? ¿hay logos? | No |
| 1 | Crea el bucket `logos-aliadas` (público, ≤500 KB, PNG/SVG/WebP), policies de escritura solo super_admin e índice único de un logo principal activo por universidad | Sí (BEGIN/COMMIT) |
| 2 | Verificación del bucket y de las 3 policies | No |
| 3 | Plantilla comentada para insertar una fila `tipo='logo'` por aliada | Comentado |

## Decisiones
- **Bucket público**: el logo se sirve por URL pública estable, no hay URL firmada que venza antes del caché de 1 h de BE.
- **Sin policy SELECT anónima** sobre `storage.objects`: con `public=true` basta para leer por URL y así nadie puede listar el bucket.
- **`url_storage` guarda solo la ruta** dentro del bucket (ej. `poli/logo.svg`). BE arma la URL con `SUPABASE_LOGOS_BUCKET` (default `logos-aliadas`), así el contrato `{url, alt}` no cambia si se mueve el proyecto.
- **Índice único parcial** `uq_imagenes_universidad_logo_principal`: evita dos logos principales activos para la misma aliada.
- Sin logos cargados → BE devuelve `[]` → FE no pinta la franja (nada de logos de relleno).

## Pendiente (fuera de esta ola)
- Subir los 5 archivos con permiso de uso y correr el Bloque 3 con los UUID reales.
- Con los logos reales, cruzar sus colores con la paleta A2 (Sergio Arboleda, UNIR, Asturias).
