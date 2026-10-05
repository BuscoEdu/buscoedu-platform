# A1 · BD: hilo en Aplicar Demo WApp + flag `es_qa`

PR único `fix/a1-catalogo-demowapp` (Ola 1/3 BD).

## Cambios
- `intenciones_aplicar_demowapp.oportunidad_hilo_id uuid NULL` → FK `oportunidades(id)`; índice único `uq_intenciones_aplicar_demowapp_clave_hilo (clave_idempotencia, oportunidad_hilo_id)`. Filas viejas quedan NULL (sin backfill). Se conserva el único previo sobre `clave_idempotencia`; el 409 `hilo_no_coincide` lo decide BE.
- `es_qa boolean NOT NULL DEFAULT false` en `personas`, `oportunidades`, `aplicaciones`, `transferencias_universidad` + índices parciales `WHERE es_qa`.
- CHECK `transferencias_universidad_qa_no_facturable`: QA nunca facturable.
- `fn_ba031_convertir_si_consentido(jsonb)`: misma firma y reglas fail-closed; tras conversión ok hereda `es_qa` (payload `es_qa: true`, persona u oportunidad) a oportunidad, aplicación y transferencia (`es_facturable=false`). Devuelve `es_qa: true` en el JSON.
- No hay vistas en el repo: los filtros `es_qa` de Lead Center, cobro, B2B, notificaciones y exportes los aplica BE en `src/`.

## Orden
1. `supabase/migrations/20261005090000_a1_demowapp_hilo_es_qa.sql`
2. `supabase/ops/20261005_a1_marcar_qa_reE2E.sql` (primero el SELECT; correr UPDATEs solo si salen los 3 esperados)
3. Merge del PR (con `NEXT_PUBLIC_ALIADAS_IDS` ya cargada en Vercel).

## Rollback
```sql
BEGIN;
-- Restaurar la función: re-ejecutar el bloque CREATE OR REPLACE de
-- 20260927210000_ba031_intenciones_aplicar_demowapp.sql.
ALTER TABLE public.transferencias_universidad DROP CONSTRAINT IF EXISTS transferencias_universidad_qa_no_facturable;
DROP INDEX IF EXISTS public.uq_intenciones_aplicar_demowapp_clave_hilo, public.idx_intenciones_aplicar_demowapp_hilo,
  public.idx_personas_es_qa, public.idx_oportunidades_es_qa, public.idx_aplicaciones_es_qa, public.idx_transferencias_universidad_es_qa;
ALTER TABLE public.intenciones_aplicar_demowapp DROP COLUMN IF EXISTS oportunidad_hilo_id;
ALTER TABLE public.personas DROP COLUMN IF EXISTS es_qa;
ALTER TABLE public.oportunidades DROP COLUMN IF EXISTS es_qa;
ALTER TABLE public.aplicaciones DROP COLUMN IF EXISTS es_qa;
ALTER TABLE public.transferencias_universidad DROP COLUMN IF EXISTS es_qa;
COMMIT;
NOTIFY pgrst, 'reload schema';
```
