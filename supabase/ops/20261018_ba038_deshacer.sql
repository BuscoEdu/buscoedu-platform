-- =====================================================
-- BA-038 · DESHACER 20261018140000_ba038_tope_gasto_ia
-- Autor: Base de datos BuscoEdu (bot) · 2026-10-18
-- Qué hace: quita las funciones y el trigger y RENOMBRA las 4 tablas con el sufijo
--   _retirada_20261018 (no hay DELETE físico; los datos quedan para auditoría).
--   Quita el índice extra de registros_costo_ia y la fila del historial.
-- ⚠ Antes: el backend debe dejar de llamar a fn_ia_gasto_hoy, o fallará cerrado
--   (sin IA) si así está programado. Coordinar con Backend.
-- =====================================================
BEGIN;

-- Bloque 1: funciones y trigger.
DROP TRIGGER IF EXISTS trg_canales_ia_tope_por_defecto ON public.canales_ia;
DROP FUNCTION IF EXISTS public.fn_ia_tope_por_defecto();
DROP FUNCTION IF EXISTS public.fn_ia_actualizar_tope(text, numeric, integer, uuid);
DROP FUNCTION IF EXISTS public.fn_ia_registrar_alerta_gasto(text);
DROP FUNCTION IF EXISTS public.fn_ia_gasto_hoy(text);
DROP FUNCTION IF EXISTS public.fn_ia_registrar_precio(text, text, numeric, numeric, text, text, uuid);
DROP FUNCTION IF EXISTS public.fn_ia_precio_vigente(text, text);

-- Bloque 2: índice extra sobre la tabla de Backend (la tabla no se toca).
DROP INDEX IF EXISTS public.idx_registros_costo_ia_canal_creado;

-- Bloque 3: renombrar tablas en lugar de borrarlas (solo si existen y no se renombraron ya).
DO $$
DECLARE t text; i text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bitacora_topes_gasto_ia', 'alertas_gasto_ia', 'precios_modelo_ia', 'topes_gasto_ia'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL AND to_regclass('public.' || t || '_retirada_20261018') IS NULL THEN
      -- 3.1 Primero los índices (pkey, unique, etc.): si conservan su nombre, reaplicar
      --     la migración chocaría o se saltaría el índice por el IF NOT EXISTS.
      FOR i IN SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = t LOOP
        EXECUTE format('ALTER INDEX public.%I RENAME TO %I', i, left(i, 40) || '_ret20261018');
      END LOOP;
      EXECUTE format('ALTER TABLE public.%I RENAME TO %I', t, t || '_retirada_20261018');
    END IF;
  END LOOP;
END $$;

-- Bloque 4: sacar la migración del historial para poder reaplicarla.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261018140000';

COMMIT;
