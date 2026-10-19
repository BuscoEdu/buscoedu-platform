-- =====================================================================
-- Deshacer · Paquete prod 20261019 · Bloque 4
-- Devuelve las 3 tablas a public (sin tocar sus filas). No borra el schema respaldos
-- (puede tener otros objetos); si queda vacío se puede quitar a mano con DROP SCHEMA respaldos;
-- ⚠ Si se deshace, los deshacer 20261019_carga_aliadas_{3,4,5} deben volver a la versión
--   anterior (git: commit abed234) porque apuntan a respaldos.*. Idempotente.
-- =====================================================================
BEGIN;
DO $m$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['carga_aliadas_20261019','carga_aliadas_20261019_respaldo','carga_aliadas_20261019_demo_previo'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL AND to_regclass('respaldos.' || t) IS NOT NULL THEN
      RAISE EXCEPTION 'ABORTADO: % existe en public y en respaldos; revisar a mano.', t;
    END IF;
    IF to_regclass('respaldos.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE respaldos.%I SET SCHEMA public', t);
    END IF;
  END LOOP;
END $m$;
COMMIT;
