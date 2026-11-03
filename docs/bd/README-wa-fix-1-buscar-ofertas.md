# WA-fix-1 · BD · `buscar_ofertas_publicas` (2026-10-19)

**Rama:** `feat/bd-wa-fix-1` (desde origin/main 0b2b916) · **Estado:** APLICADA en prod el 2026-10-19 20:02 (hora Madrid) con `apply_migration` (versión registrada `20261019180221`, nombre `bd_wafix1_buscar_ofertas_publicas`); OK de Jhon 20:01. Evidencia: `supabase/ops/respaldos/20261019_wafix1/`.

| Archivo | Qué |
|---|---|
| `supabase/migrations/20261019180221_bd_wafix1_buscar_ofertas_publicas.sql` | unaccent + pg_trgm (schema `extensions`), `f_unaccent` / `f_normalizar_busqueda` inmutables, 2 índices GIN trigram, RPC y permisos. Idempotente. |
| `supabase/ops/20261019_bd_wafix1_buscar_ofertas_publicas_deshacer.sql` | Quita RPC, índices, funciones y las extensiones (antes no estaban instaladas) y borra la migración del historial por nombre. |
| `supabase/ops/20261019_bd_wafix1_buscar_ofertas_publicas_verificacion.sql` | 10 chequeos ✓/✗ de solo lectura. |

## Contrato para Backend
`rpc('buscar_ofertas_publicas', { p_texto, p_modalidad, p_ciudad_id, p_nivel, p_area_id, p_limit, p_offset })`
→ filas `{ oferta_id uuid, fue_respaldo_area boolean, total_count bigint }`, en orden `creado_en desc, id asc` (= ORDEN_ESTABLE_OFERTAS).
- `p_texto` es libre: se quitan tildes y mayúsculas y se toman tokens de 3 o más letras sin las stopwords de `ofertas.ts`. Los tokens van con AND contra el nombre de la oferta y el nombre oficial/corto y el título del programa.
- Si hay texto y 0 coincidencias por nombre, entra el respaldo por área (área cuyo nombre contiene algún token) y `fue_respaldo_area = true`.
- `p_modalidad` y `p_nivel` van por código o nombre, sin tildes (`virtual`, `presencial`, `pregrado`, `tecnologo`, `posgrado` = especialización + maestría + doctorado). Un valor que no existe da 0 filas.
- `p_ciudad_id` es uuid: Backend resuelve el nombre a id. Las ofertas virtuales no se filtran por ciudad.
- `p_limit` va hasta 200 (default 20). Si la página queda vacía no hay filas, así que tampoco llega `total_count`.
- Después, Backend completa los datos con un `select … in(oferta_id)` de ≤ `p_limit` ids. Se acabaron las listas gigantes.
- Las aliadas se toman de `universidades.activo AND estado_alianza='aliada' AND es_demo=false` (hoy son las 4). No se lee `NEXT_PUBLIC_ALIADAS_IDS`.

## Pruebas (Postgres 17 local + copia del catálogo de prod del 19/10, sin datos personales)
Migración corrida 2 veces sin error, deshacer y re-aplicación ✓, verificación 10/10 ✓:
«ingenieria de sistemas» = 2 (sin respaldo), «sistemas» = 3, con tilde = sin tilde, administracion + virtual + Bogotá = 16 = Medellín, sin filtros = 291, respaldo por área con flag, anon con EXECUTE, SECURITY INVOKER, 0 demo. El índice trigram lo usa el `LIKE '%x%'` (EXPLAIN).

## Bitácora
| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-19 ~19:55 (hora Madrid) | Migración + deshacer + verificación de `buscar_ofertas_publicas` (unaccent, AND entre tokens, respaldo por área, ciudad no filtra virtual). Probada en local. NO aplicada. | Fallas S5/S6 de la prueba WA de las 19:10–19:35: OR sin tildes daba 45; 400 por URL con ~755 UUID | Base de datos BuscoEdu |
| 2026-10-19 20:02 (hora Madrid) | Migración aplicada en prod (versión 20261019180221). Verificación 10/10 ✓; como anon en transacción de solo lectura: admin+virtual Bogotá 16 = Medellín 16, sin filtros 291, 0 demo. Archivo renombrado a la versión registrada. | OK de Jhon 20:01 vía Orquestador (fallas S5/S6 de WA) | Base de datos BuscoEdu (bot) |
