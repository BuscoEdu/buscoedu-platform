-- =====================================================================
-- Ola 8 · red de seguridad familia_id en familia_tareas
-- Autor: BD BuscoEdu (bot) · 2026-10-31 · GO Orq / Jhon t920u
-- Idempotente. ✗ DELETE. Deshacer: 20261031124500_famly_o8_tareas_familia_id_deshacer.sql
-- =====================================================================
BEGIN;

-- Bloque 1: respaldo de las filas con familia_id NULL (antes del backfill)
CREATE TABLE IF NOT EXISTS respaldos.familia_o8_tareas_fid_null_previo AS
  SELECT id, familia_id, asignada_a, creada_por, now() AS respaldado_en
    FROM public.familia_tareas WHERE familia_id IS NULL;
REVOKE ALL ON respaldos.familia_o8_tareas_fid_null_previo FROM anon, authenticated;

-- Bloque 2: función del trigger. Si llega NULL, toma la familia de asignada_a
-- y, si no, la de creada_por. Si ninguna existe, deja NULL (no inventa).
CREATE OR REPLACE FUNCTION public.familia_tareas_o8_familia_id()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
BEGIN
  IF NEW.familia_id IS NULL THEN
    SELECT m.familia_id INTO NEW.familia_id
      FROM public.familia_miembros m
     WHERE m.id = coalesce(NEW.asignada_a, NEW.creada_por);
    IF NEW.familia_id IS NULL AND NEW.creada_por IS NOT NULL THEN
      SELECT m.familia_id INTO NEW.familia_id
        FROM public.familia_miembros m WHERE m.id = NEW.creada_por;
    END IF;
  END IF;
  RETURN NEW;
END $f$;

-- Bloque 3: trigger BEFORE INSERT (prefijo "a_" para correr antes que los v6*)
DROP TRIGGER IF EXISTS a_familia_tareas_o8_familia_id ON public.familia_tareas;
CREATE TRIGGER a_familia_tareas_o8_familia_id
  BEFORE INSERT ON public.familia_tareas
  FOR EACH ROW EXECUTE FUNCTION public.familia_tareas_o8_familia_id();

-- Bloque 4: backfill de los NULL con la misma regla (solo si ambas familias coinciden o una sola existe)
UPDATE public.familia_tareas t
   SET familia_id = coalesce(ma.familia_id, mc.familia_id)
  FROM public.familia_tareas x
  LEFT JOIN public.familia_miembros ma ON ma.id = x.asignada_a
  LEFT JOIN public.familia_miembros mc ON mc.id = x.creada_por
 WHERE t.id = x.id AND t.familia_id IS NULL
   AND coalesce(ma.familia_id, mc.familia_id) IS NOT NULL
   AND (ma.familia_id IS NULL OR mc.familia_id IS NULL OR ma.familia_id = mc.familia_id);

COMMIT;
