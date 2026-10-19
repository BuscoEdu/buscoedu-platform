-- =====================================================================
-- Deshacer · WA-fix-1 (BD) · 20261019200000_bd_wafix1_buscar_ofertas_publicas.sql
-- Quita RPC, índices y funciones de normalización. NO quita las extensiones unaccent/pg_trgm
-- (otras piezas podrían usarlas; quitarlas aparte con DROP EXTENSION si se confirma que nadie las usa).
-- Borra el registro de la migración del historial. Idempotente. No toca datos.
-- =====================================================================
BEGIN;
DROP FUNCTION IF EXISTS public.buscar_ofertas_publicas(text, text, uuid, text, uuid, int, int);
DROP INDEX IF EXISTS public.idx_programas_nombre_norm_trgm;
DROP INDEX IF EXISTS public.idx_ofertas_nombre_norm_trgm;
DROP FUNCTION IF EXISTS public.f_normalizar_busqueda(text);
DROP FUNCTION IF EXISTS public.f_unaccent(text);
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261019200000';
COMMIT;
