-- =====================================================================
-- O9b · familia_id en familia_historial (incidente Jhon t942u: los puntos «no suben»)
-- Autor: BD BuscoEdu (bot) · 2026-10-31 · PROPUESTA, ✗ aplicado (espera GO Orq)
-- Causa: el FE inserta en el historial sin familia_id y lo lee con eqFam (familia_id = fid)
-- → las filas NULL no aparecen en el historial ni en los movimientos del día.
-- Idempotente. ✗ DELETE. Deshacer: 20261031230500_famly_o9b_historial_familia_id_deshacer.sql
-- =====================================================================
BEGIN;

-- Bloque 1: respaldo de las filas con familia_id NULL (antes del backfill)
CREATE TABLE IF NOT EXISTS respaldos.familia_o9b_historial_fid_null_previo AS
  SELECT id, familia_id, miembro_id, now() AS respaldado_en
    FROM public.familia_historial WHERE familia_id IS NULL;
REVOKE ALL ON respaldos.familia_o9b_historial_fid_null_previo FROM anon, authenticated;

-- Bloque 2: función del trigger. Si llega NULL, toma la familia del miembro y, si no, la del actor.
CREATE OR REPLACE FUNCTION public.familia_historial_o9b_familia_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
BEGIN
  IF NEW.familia_id IS NULL THEN
    SELECT m.familia_id INTO NEW.familia_id FROM public.familia_miembros m
     WHERE m.id = coalesce(NEW.miembro_id, NEW.actor_id);
  END IF;
  RETURN NEW;
END $f$;

-- Bloque 3: trigger BEFORE INSERT (prefijo «a_» para que corra antes que los v6*)
DROP TRIGGER IF EXISTS a_familia_historial_o9b_familia_id ON public.familia_historial;
CREATE TRIGGER a_familia_historial_o9b_familia_id
  BEFORE INSERT ON public.familia_historial
  FOR EACH ROW EXECUTE FUNCTION public.familia_historial_o9b_familia_id();

-- Bloque 4: backfill de los NULL con la familia del miembro (hoy: 29 filas, todas de fid 1)
UPDATE public.familia_historial h
   SET familia_id = m.familia_id
  FROM public.familia_miembros m
 WHERE h.familia_id IS NULL AND m.id = h.miembro_id AND m.familia_id IS NOT NULL;

COMMIT;
