-- =====================================================================
-- v6b_16 · B16 Los padres no tienen deberes. Idempotente.
-- Diagnóstico (solo SELECT, 20:05): 0 deberes (clase o tipo 'deber') asignados a padres, en cualquier estado.
-- Causa de fondo: no hay validación en servidor: familia_rpc_crear_tarea y los INSERT directos de la v1/v3
-- aceptan clase='deber' para un padre (solo crear_lote filtra «solo hijos»).
-- =====================================================================
-- Bloque 1: convertir deberes PENDIENTES de padres a tarea (respaldo en v6b_00). Guarda de conteo exacto.
DO $$ DECLARE n_esp int; n int; BEGIN
  SELECT count(*) INTO n_esp FROM respaldos.familia_v6b_previo_b16;
  UPDATE public.familia_tareas t SET clase='tarea', tipo='tarea'
   WHERE t.id IN (SELECT id FROM respaldos.familia_v6b_previo_b16) AND t.estado='pendiente'
     AND (t.clase='deber' OR t.tipo='deber');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> n_esp AND n <> 0 THEN RAISE EXCEPTION 'B16: se esperaban % filas y se actualizaron %', n_esp, n; END IF;
END $$;
-- Bloque 2: validación en servidor (INSERT, o UPDATE que cambie clase/tipo/asignado). Los cerrados no se tocan.
CREATE OR REPLACE FUNCTION public.familia_trg_v6b_padre_sin_deber()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE m public.familia_miembros%ROWTYPE;
BEGIN
  IF NOT (NEW.clase = 'deber' OR NEW.tipo = 'deber') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.clase IS NOT DISTINCT FROM OLD.clase AND NEW.tipo IS NOT DISTINCT FROM OLD.tipo
     AND NEW.asignada_a IS NOT DISTINCT FROM OLD.asignada_a THEN RETURN NEW; END IF;
  SELECT * INTO m FROM public.familia_miembros WHERE id = NEW.asignada_a;
  IF public.familia_es_admin(m) THEN
    RAISE EXCEPTION 'Los padres no tienen deberes' USING HINT = 'b16_padre_sin_deber';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.familia_trg_v6b_padre_sin_deber() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS familia_tareas_v6b_b16 ON public.familia_tareas;
CREATE TRIGGER familia_tareas_v6b_b16 BEFORE INSERT OR UPDATE OF clase, tipo, asignada_a ON public.familia_tareas
  FOR EACH ROW EXECUTE FUNCTION public.familia_trg_v6b_padre_sin_deber();
