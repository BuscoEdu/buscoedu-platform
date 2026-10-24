-- =====================================================================
-- v6b_19 · B19 Hasta 3 fotos por envío. Idempotente.
-- fotos text[] (máx. 3) del asignado; fotos_anterior text[] para el juego reemplazado al reenviar.
-- Compatibilidad: si llega fotos y foto_url está vacía, foto_url = fotos[1] (v1 y FE actual siguen viendo 1 foto).
-- Limpieza 24 h (familia_fotos_vencidas → familia_limpiar_fotos_vencidas_local) y el trigger de vencimiento cubren el array.
-- =====================================================================
-- Bloque 1: columnas
ALTER TABLE public.familia_tareas
  ADD COLUMN IF NOT EXISTS fotos text[],
  ADD COLUMN IF NOT EXISTS fotos_anterior text[];
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='familia_tareas_fotos_max3_chk') THEN
    ALTER TABLE public.familia_tareas ADD CONSTRAINT familia_tareas_fotos_max3_chk
      CHECK (coalesce(cardinality(fotos),0) <= 3 AND coalesce(cardinality(fotos_anterior),0) <= 3); END IF;
END $$;
-- Bloque 2: espejo foto_url ← fotos[1]; array vacío → NULL
CREATE OR REPLACE FUNCTION public.familia_trg_v6b_fotos()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.fotos IS NOT NULL AND cardinality(NEW.fotos) = 0 THEN NEW.fotos := NULL; END IF;
  IF NEW.fotos IS NOT NULL AND (TG_OP='INSERT' OR NEW.fotos IS DISTINCT FROM OLD.fotos) THEN
    NEW.foto_url := NEW.fotos[1];
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.familia_trg_v6b_fotos() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS familia_tareas_v6b_b19 ON public.familia_tareas;
CREATE TRIGGER familia_tareas_v6b_b19 BEFORE INSERT OR UPDATE OF fotos ON public.familia_tareas
  FOR EACH ROW EXECUTE FUNCTION public.familia_trg_v6b_fotos();

-- Bloque 3: vencimiento (misma lógica + fotos/fotos_anterior)
CREATE OR REPLACE FUNCTION public.familia_trg_foto_vence()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
  IF NEW.estado = 'esperando_aprobacion' THEN
    NEW.foto_vence_at := NULL;                                   -- en revisión: no vence
  ELSIF OLD.estado = 'esperando_aprobacion'
        AND NEW.estado IS DISTINCT FROM 'esperando_aprobacion'
        AND (coalesce(NEW.foto_url, NEW.foto_2, NEW.foto_anterior, NEW.foto_2_anterior) IS NOT NULL
             OR NEW.fotos IS NOT NULL OR NEW.fotos_anterior IS NOT NULL)          -- v6b B19
        AND NEW.foto_vence_at IS NULL THEN
    NEW.foto_vence_at := now() + interval '24 hours';              -- decidida: vence en 24 h
  END IF;
  RETURN NEW;
END $function$;

-- Bloque 4: limpieza (misma firma y grants; añade fotos/fotos_anterior)
CREATE OR REPLACE FUNCTION public.familia_limpiar_fotos_vencidas()
 RETURNS integer LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE n integer;
BEGIN
  WITH v AS (
    UPDATE public.familia_tareas
       SET foto_url = NULL, foto_2 = NULL, foto_anterior = NULL, foto_2_anterior = NULL, fotos = NULL, fotos_anterior = NULL
     WHERE foto_vence_at <= now()
       AND (coalesce(foto_url, foto_2, foto_anterior, foto_2_anterior) IS NOT NULL OR fotos IS NOT NULL OR fotos_anterior IS NOT NULL)
    RETURNING id, titulo, asignada_a)
  INSERT INTO public.familia_historial(miembro_id, texto, tarea_id, tipo, pts, version_regla)
  SELECT asignada_a, format('Foto borrada a las 24 h: %s', titulo), id, 'ajuste', 0, 1 FROM v;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.familia_limpiar_fotos_vencidas_local()
 RETURNS integer LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE n integer; v_cfg text;
BEGIN
  SELECT c.zona_horaria INTO v_cfg FROM public.familia_config c
   WHERE EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = c.zona_horaria) LIMIT 1;
  v_cfg := coalesce(v_cfg, 'Europe/Madrid');
  WITH objetivo AS (
    SELECT t.id FROM public.familia_tareas t
      LEFT JOIN public.familia_miembros m ON m.id = t.asignada_a
      LEFT JOIN pg_timezone_names z ON z.name = m.zona_horaria
     WHERE t.foto_vence_at <= now()
       AND (coalesce(t.foto_url, t.foto_2, t.foto_anterior, t.foto_2_anterior) IS NOT NULL
            OR t.fotos IS NOT NULL OR t.fotos_anterior IS NOT NULL)
       AND extract(hour FROM now() AT TIME ZONE coalesce(z.name, v_cfg)) = 3),
  v AS (
    UPDATE public.familia_tareas t
       SET foto_url = NULL, foto_2 = NULL, foto_anterior = NULL, foto_2_anterior = NULL, fotos = NULL, fotos_anterior = NULL
      FROM objetivo o WHERE t.id = o.id
    RETURNING t.id, t.titulo, t.asignada_a)
  INSERT INTO public.familia_historial(miembro_id, texto, tarea_id, tipo, pts, version_regla)
  SELECT asignada_a, format('Foto borrada a las 24 h: %s', titulo), id, 'ajuste', 0, 1 FROM v;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;
