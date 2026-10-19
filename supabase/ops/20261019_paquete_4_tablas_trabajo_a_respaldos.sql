-- =====================================================================
-- Paquete prod 20261019 · Bloque 4 · Sacar de public las 3 tablas de trabajo de la carga
-- Autor: Base de datos BuscoEdu · 2026-10-19 · NO aplicado en prod (espera OK).
-- Por qué: public.carga_aliadas_20261019, _respaldo y _demo_previo quedaron en el schema
--   expuesto por la API (RLS activo sin policies ⇒ el advisor las marca y cualquiera ve que existen).
--   Son la base de los deshacer del 19/10, así que NO se borran: se MUEVEN a un schema
--   privado `respaldos` (no expuesto por PostgREST, sin permisos para anon/authenticated).
-- Antes: correr 20261019_paquete_4_tablas_trabajo_exportar.sql y guardar la salida.
-- Idempotente: CREATE SCHEMA IF NOT EXISTS; ALTER TABLE IF EXISTS ... SET SCHEMA solo si la tabla
--   sigue en public; si ya está en respaldos no hace nada. Aborta si existe en los dos lados.
-- Después: los deshacer 20261019_carga_aliadas_{3,4,5}_*_deshacer.sql ya apuntan a respaldos.*.
-- Deshacer: ..._deshacer.sql (las devuelve a public).
-- =====================================================================
BEGIN;

-- Bloque 1 · Schema privado
CREATE SCHEMA IF NOT EXISTS respaldos;
COMMENT ON SCHEMA respaldos IS 'Tablas de trabajo y respaldos de operaciones de BD. No expuesto por la API.';
REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;

-- Bloque 2 · Mover las 3 tablas (con guarda contra duplicados)
DO $m$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['carga_aliadas_20261019','carga_aliadas_20261019_respaldo','carga_aliadas_20261019_demo_previo'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL AND to_regclass('respaldos.' || t) IS NOT NULL THEN
      RAISE EXCEPTION 'ABORTADO: % existe en public y en respaldos; revisar a mano.', t;
    END IF;
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA respaldos', t);
    END IF;
    IF to_regclass('respaldos.' || t) IS NULL THEN
      RAISE EXCEPTION 'ABORTADO: % no está ni en public ni en respaldos.', t;
    END IF;
    EXECUTE format('REVOKE ALL ON TABLE respaldos.%I FROM PUBLIC, anon, authenticated', t);
  END LOOP;
END $m$;

-- Bloque 3 · Control de conteos (mismos que la carga: staging 331 · respaldo con filas (10 IES previas) · demo_previo 500)
DO $c$
BEGIN
  IF (SELECT count(*) FROM respaldos.carga_aliadas_20261019) <> 331
     OR (SELECT count(*) FROM respaldos.carga_aliadas_20261019_demo_previo) <> 500
     OR (SELECT count(*) FROM respaldos.carga_aliadas_20261019_respaldo) = 0 THEN
    RAISE EXCEPTION 'ABORTADO: los conteos de las tablas movidas no cuadran.';
  END IF;
END $c$;

COMMIT;
