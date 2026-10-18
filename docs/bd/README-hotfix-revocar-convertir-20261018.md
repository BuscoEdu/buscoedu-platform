# HOTFIX PROD · Revocar EXECUTE público de `fn_convertir_aplicacion(jsonb)` — 2026-10-18

**Proyecto:** prod `khnrnnoxyzuulagemfbh` · **Autor:** Base de datos BuscoEdu (bot) · **OK:** Jhon, vía Orquestador (solo este cambio).

## Qué y por qué
`fn_convertir_aplicacion` es `SECURITY DEFINER` (dueño `postgres`) y tenía EXECUTE para `PUBLIC`, `anon` y `authenticated`. Cualquiera con la llave pública podía llamarla por RPC y crear personas, leads y transferencias sin pasar por la API (sin validaciones del servidor). Se quitó ese permiso y se dejó solo `service_role`.

**No** se aplicó la migración 160000 (BA-041) ni ninguna otra; el código de la función no cambió y el historial de migraciones no se tocó.

## Por qué no rompe nada
- `/api/leadcenter/convertir` (`app/api/leadcenter/convertir/route.ts`) usa `getServiceRoleClient()` (línea 65) y llama `db.rpc('fn_convertir_aplicacion', …)` (línea 198). Es el único llamador en el código.
- En la BD, el único llamador es `fn_ba031_convertir_si_consentido(jsonb)`: `SECURITY DEFINER`, dueño `postgres`, que conserva EXECUTE.

## Evidencia
| | Antes | Después |
|---|---|---|
| ACL | `{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}` | `{postgres=X/postgres,service_role=X/postgres}` |
| anon | ✓ ejecuta | ✗ `permission denied` (42501) |
| authenticated | ✓ ejecuta | ✗ `permission denied` (42501) |
| service_role | ✓ | ✓ (`{"ok":false,"error":"clave_idempotencia_requerida"}` con payload vacío, sin escribir) |

La prueba se corrió con `SET LOCAL ROLE` y payload `{}` (corta antes de escribir).

## Archivos
- SQL: `supabase/ops/20261018_hotfix_revocar_execute_convertir.sql`
- Deshacer: `supabase/ops/20261018_hotfix_revocar_execute_convertir_deshacer.sql` (devuelve el ACL original; reabre el hueco)
- La 160000 (BA-041) ya trae el mismo REVOKE/GRANT, así que aplicarla después es compatible (idempotente).

## Bitácora
| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 | Respaldo del ACL, REVOKE EXECUTE a PUBLIC/anon/authenticated, GRANT a service_role, verificación antes/después en prod | Cerrar creación de leads por RPC con llave pública | Base de datos BuscoEdu (bot), OK de Jhon vía Orquestador |
