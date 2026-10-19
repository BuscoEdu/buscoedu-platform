# Migraciones pendientes (fuera de `supabase/migrations`)

Esta carpeta guarda migraciones que **no se deben aplicar**, ni por sorpresa ni con `supabase db push`. El CLI solo lee `supabase/migrations/`, así que lo que está aquí nunca se aplica.
Para aplicar una, primero hay que decidirlo en un plan con OK de Jhon. Después se mueve de vuelta con una versión nueva y se documenta.

| Archivo | Estado | Por qué está aquí |
|---|---|---|
| `20260830150100_funnel_rls_superadmin_mutations.sql` | Descartada (E0, 2026-10-18) | Crea policies de INSERT, UPDATE y **DELETE físico** para usuarios autenticados en `etapas_embudo`, `subestados_oportunidad` y `reglas_estancamiento`. Eso choca con la regla de no borrar físicamente, y ningún cliente la usa, porque el admin escribe con service role. No está en el historial de prod. |
| `20261018170000_ba005_indice_orden_ofertas.sql` | Propuesta (post-QA E1, 2026-10-18) | Índice `(creado_en desc, id)` en `ofertas_academicas` para el orden de `obtenerOfertas` (BA-005). Pendiente de revisión de BD + OK de Jhon. |
| `20261019190000_fix_trg_universidad_crea_oportunidad_propuesta.sql` | Propuesta (2026-10-19) | Quita `trg_universidad_crea_oportunidad`: inserta oportunidades sin `persona_id` (NOT NULL) y rompe todo alta de universidad en prod. Deshacer en `supabase/ops/20261019_fix_trg_universidad_crea_oportunidad_deshacer.sql`. Requiere OK de Jhon. |

## Bitácora
| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 | Se crea la carpeta y se mueve 150100 | BA-040 / criterio G1: que `db push` no la aplique | Base de datos BuscoEdu (bot), por plan del Orquestador |
| 2026-10-18 | Se agrega el índice BA-005 (20261018170000) | Que `db push` no lo aplique sin OK de Jhon | Backend BuscoEdu (bot), por plan del Orquestador |
