-- =====================================================================
-- Deshacer · WA-fix-1 (BD) · 20261019200000_bd_wafix1_buscar_ofertas_publicas.sql
-- Quita RPC, índices y funciones de normalización, y las extensiones unaccent/pg_trgm, que antes de
-- la migración NO estaban instaladas (respaldo 20261019_wafix1/01_previo.json). DROP EXTENSION sin
-- CASCADE: si otra pieza ya las usa, falla y no se quita nada (revisar a mano).
-- Borra el registro del historial por NOMBRE: apply_migration registra la versión con la hora de
-- aplicación, no con 20261019200000. Idempotente. No toca datos.
-- =====================================================================
BEGIN;
DROP FUNCTION IF EXISTS public.buscar_ofertas_publicas(text, text, uuid, text, uuid, int, int);
DROP INDEX IF EXISTS public.idx_programas_nombre_norm_trgm;
DROP INDEX IF EXISTS public.idx_ofertas_nombre_norm_trgm;
DROP FUNCTION IF EXISTS public.f_normalizar_busqueda(text);
DROP FUNCTION IF EXISTS public.f_unaccent(text);
DROP EXTENSION IF EXISTS pg_trgm;
DROP EXTENSION IF EXISTS unaccent;
DELETE FROM supabase_migrations.schema_migrations
 WHERE name = 'bd_wafix1_buscar_ofertas_publicas' OR version = '20261019200000';
COMMIT;
