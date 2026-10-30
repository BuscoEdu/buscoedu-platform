-- v6e_02 · E-VA1/E-DU1: Fin > Inicio también en INSERT; duración 1..72 h.
CREATE OR REPLACE FUNCTION public.familia_trg_v6e_horario()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  -- Si hay duración, recalcula fin = inicio + duración (E-DU1).
  IF NEW.duracion_min IS NOT NULL THEN
    IF NEW.duracion_min < 1 OR NEW.duracion_min > 72*60 THEN
      RAISE EXCEPTION 'La duración debe estar entre 1 minuto y 72 horas' USING HINT='v6e_duracion';
    END IF;
    IF NEW.habilita_en IS NOT NULL THEN
      NEW.fecha_limite := NEW.habilita_en + make_interval(mins => NEW.duracion_min);
      NEW.ventana_min := NEW.duracion_min;
    END IF;
  END IF;
  IF NEW.ventana_min IS NOT NULL AND NEW.ventana_min <= 0 THEN
    RAISE EXCEPTION 'La ventana no puede ser 0' USING HINT='d16_ventana';
  END IF;
  IF NEW.habilita_en IS NOT NULL AND NEW.fecha_limite IS NOT NULL AND NEW.fecha_limite <= NEW.habilita_en THEN
    RAISE EXCEPTION 'La hora fin debe ser posterior a la de inicio' USING HINT='d16_fin';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS familia_tareas_v6e_horario ON public.familia_tareas;
CREATE TRIGGER familia_tareas_v6e_horario
  BEFORE INSERT OR UPDATE OF habilita_en, fecha_limite, ventana_min, duracion_min
  ON public.familia_tareas
  FOR EACH ROW EXECUTE FUNCTION public.familia_trg_v6e_horario();

-- Amplía el trigger v6d para no chocar: se deja; v6e cubre INSERT.
