-- DESHACER · public.famly_hallazgos
-- Fecha: 2026-10-31 Europe/Madrid · Quién: BD bot BuscoEdu
-- Solo DROP TABLE si está vacía o tras respaldo explícito.

DO $$
BEGIN
  IF to_regclass('public.famly_hallazgos') IS NULL THEN
    RAISE NOTICE 'famly_hallazgos ausente';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.famly_hallazgos LIMIT 1) THEN
    CREATE SCHEMA IF NOT EXISTS respaldos;
    IF to_regclass('respaldos.famly_hallazgos_antes_drop') IS NULL THEN
      CREATE TABLE respaldos.famly_hallazgos_antes_drop AS
        SELECT h.*, now() AS tomado_en FROM public.famly_hallazgos h;
      REVOKE ALL ON respaldos.famly_hallazgos_antes_drop FROM PUBLIC, anon, authenticated;
      GRANT ALL ON respaldos.famly_hallazgos_antes_drop TO service_role;
    END IF;
  END IF;
END $$;

DROP TABLE IF EXISTS public.famly_hallazgos;
