# Migraciones pendientes (fuera de `supabase/migrations`)

Esta carpeta guarda migraciones que **no se deben aplicar**, ni por sorpresa ni con `supabase db push`. El CLI solo lee `supabase/migrations/`, así que lo que está aquí nunca se aplica.
Para aplicar una, primero hay que decidirlo en un plan con OK de Jhon. Después se mueve de vuelta con una versión nueva y se documenta.

| Archivo | Estado | Por qué está aquí |
|---|---|---|
| `20260830150100_funnel_rls_superadmin_mutations.sql` | Descartada (E0, 2026-10-18) | Crea policies de INSERT, UPDATE y **DELETE físico** para usuarios autenticados en `etapas_embudo`, `subestados_oportunidad` y `reglas_estancamiento`. Eso choca con la regla de no borrar físicamente, y ningún cliente la usa, porque el admin escribe con service role. No está en el historial de prod. |

## Bitácora
| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 | Se crea la carpeta y se mueve 150100 | BA-040 / criterio G1: que `db push` no la aplique | Base de datos BuscoEdu (bot), por plan del Orquestador |
