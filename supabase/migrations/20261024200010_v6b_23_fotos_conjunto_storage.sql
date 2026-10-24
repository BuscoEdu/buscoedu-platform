-- =====================================================================
-- v6b_23 · B19 (2) fotos del compañero de conjunto + (5) borrado en Storage. Idempotente. BD bot 2026-10-24.
-- Hallazgo (solo SELECT, 20:13): hoy NO hay fotos de familia en Storage (único bucket: logos-aliadas;
-- foto_path/foto_2_path vacíos). Las fotos se guardan como data URL en la propia fila, así que poner la
-- columna a NULL YA borra la foto. Además Supabase bloquea DELETE directo en storage.objects
-- (trigger storage.protect_delete) → el borrado de objetos debe hacerse por la API de Storage.
-- Diseño seguro: la limpieza 24 h ENCOLA (bucket, path) de cada foto vencida que viva en Storage en
-- familia_fotos_storage_borrar; un worker con la API de Storage (Edge Function, pendiente de OK) los borra
-- y marca borrado_en. Solo se encolan filas con foto_vence_at <= now() (nunca fotos no vencidas).
-- =====================================================================
-- Bloque 0: respaldo de definiciones vigentes
CREATE TABLE IF NOT EXISTS respaldos.familia_v6b_23_previo_fn AS
  SELECT p.oid::regprocedure::text AS objeto, pg_get_functiondef(p.oid) AS definicion, now() AS tomado_en
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('familia_trg_v6b_fotos','familia_trg_foto_vence',
    'familia_limpiar_fotos_vencidas','familia_limpiar_fotos_vencidas_local');
REVOKE ALL ON respaldos.familia_v6b_23_previo_fn FROM anon, authenticated;

-- Bloque 1: columnas del compañero (≤3)
ALTER TABLE public.familia_tareas
  ADD COLUMN IF NOT EXISTS fotos_2 text[],
  ADD COLUMN IF NOT EXISTS fotos_2_anterior text[];
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='familia_tareas_fotos_2_max3_chk') THEN
    ALTER TABLE public.familia_tareas ADD CONSTRAINT familia_tareas_fotos_2_max3_chk
      CHECK (coalesce(cardinality(fotos_2),0) <= 3 AND coalesce(cardinality(fotos_2_anterior),0) <= 3); END IF;
END $$;

-- Bloque 2: cola de borrado en Storage (sin acceso por API; solo service_role / cron)
CREATE TABLE IF NOT EXISTS public.familia_fotos_storage_borrar (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  path text NOT NULL,
  tarea_id integer,
  encolado_en timestamptz NOT NULL DEFAULT now(),
  borrado_en timestamptz,
  error text,
  UNIQUE (bucket, path));
ALTER TABLE public.familia_fotos_storage_borrar ENABLE ROW LEVEL SECURITY;   -- sin políticas: anon/authenticated no ven nada
REVOKE ALL ON public.familia_fotos_storage_borrar FROM anon, authenticated;

-- Bloque 3: extraer (bucket, path) de una URL de Storage de Supabase; NULL si no lo es (data URL, etc.)
CREATE OR REPLACE FUNCTION public.familia_v6b_storage_ref(p_url text)
RETURNS TABLE(bucket text, path text) LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT m[1], m[2] FROM regexp_match(p_url, '/storage/v1/object/(?:public|sign|authenticated)/([^/]+)/([^?#]+)') m
  WHERE m IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.familia_v6b_storage_ref(text) FROM PUBLIC, anon, authenticated;

-- Bloque 4: encolar los objetos de Storage de las tareas con fotos VENCIDAS (foto_vence_at <= now()).
-- foto_path/foto_2_path se interpretan como rutas del bucket 'familia-fotos' si no traen URL (convención FE pendiente).
CREATE OR REPLACE FUNCTION public.familia_v6b_encolar_storage(p_ids integer[])
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  INSERT INTO public.familia_fotos_storage_borrar(bucket, path, tarea_id)
  SELECT DISTINCT r.bucket, r.path, x.id
  FROM (SELECT t.id, u FROM public.familia_tareas t,
          LATERAL unnest(array[t.foto_url, t.foto_2, t.foto_anterior, t.foto_2_anterior]
                         || coalesce(t.fotos,'{}') || coalesce(t.fotos_anterior,'{}')
                         || coalesce(t.fotos_2,'{}') || coalesce(t.fotos_2_anterior,'{}')) u
        WHERE t.id = ANY(p_ids) AND t.foto_vence_at <= now() AND u IS NOT NULL) x,
       LATERAL public.familia_v6b_storage_ref(x.u) r
  UNION
  SELECT 'familia-fotos', p, t.id FROM public.familia_tareas t, LATERAL unnest(array[t.foto_path, t.foto_2_path]) p
   WHERE t.id = ANY(p_ids) AND t.foto_vence_at <= now() AND p IS NOT NULL AND p NOT LIKE 'http%'
  ON CONFLICT (bucket, path) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.familia_v6b_encolar_storage(integer[]) FROM PUBLIC, anon, authenticated;

-- Bloque 5: espejos foto_url ← fotos[1] y foto_2 ← fotos_2[1]
CREATE OR REPLACE FUNCTION public.familia_trg_v6b_fotos()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.fotos IS NOT NULL AND cardinality(NEW.fotos) = 0 THEN NEW.fotos := NULL; END IF;
  IF NEW.fotos_2 IS NOT NULL AND cardinality(NEW.fotos_2) = 0 THEN NEW.fotos_2 := NULL; END IF;
  IF NEW.fotos IS NOT NULL AND (TG_OP='INSERT' OR NEW.fotos IS DISTINCT FROM OLD.fotos) THEN
    NEW.foto_url := NEW.fotos[1];
  END IF;
  IF NEW.fotos_2 IS NOT NULL AND (TG_OP='INSERT' OR NEW.fotos_2 IS DISTINCT FROM OLD.fotos_2) THEN
    NEW.foto_2 := NEW.fotos_2[1];
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS familia_tareas_v6b_b19 ON public.familia_tareas;
CREATE TRIGGER familia_tareas_v6b_b19 BEFORE INSERT OR UPDATE OF fotos, fotos_2 ON public.familia_tareas
  FOR EACH ROW EXECUTE FUNCTION public.familia_trg_v6b_fotos();

-- Bloque 6: vencimiento (incluye arrays del compañero)
CREATE OR REPLACE FUNCTION public.familia_trg_foto_vence()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
BEGIN
  IF NEW.estado = 'esperando_aprobacion' THEN
    NEW.foto_vence_at := NULL;
  ELSIF OLD.estado = 'esperando_aprobacion'
        AND NEW.estado IS DISTINCT FROM 'esperando_aprobacion'
        AND (coalesce(NEW.foto_url, NEW.foto_2, NEW.foto_anterior, NEW.foto_2_anterior, NEW.foto_path, NEW.foto_2_path) IS NOT NULL
             OR NEW.fotos IS NOT NULL OR NEW.fotos_anterior IS NOT NULL OR NEW.fotos_2 IS NOT NULL OR NEW.fotos_2_anterior IS NOT NULL)
        AND NEW.foto_vence_at IS NULL THEN
    NEW.foto_vence_at := now() + interval '24 hours';
  END IF;
  RETURN NEW;
END $function$;

-- Bloque 7: limpieza 24 h: encola Storage, luego anula TODAS las columnas de foto (incl. *_path y arrays)
CREATE OR REPLACE FUNCTION public.familia_limpiar_fotos_vencidas()
 RETURNS integer LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE n integer; v_ids integer[];
BEGIN
  SELECT array_agg(id) INTO v_ids FROM public.familia_tareas
   WHERE foto_vence_at <= now()
     AND (coalesce(foto_url, foto_2, foto_anterior, foto_2_anterior, foto_path, foto_2_path) IS NOT NULL
          OR fotos IS NOT NULL OR fotos_anterior IS NOT NULL OR fotos_2 IS NOT NULL OR fotos_2_anterior IS NOT NULL);
  IF v_ids IS NULL THEN RETURN 0; END IF;
  PERFORM public.familia_v6b_encolar_storage(v_ids);
  WITH v AS (
    UPDATE public.familia_tareas
       SET foto_url = NULL, foto_2 = NULL, foto_anterior = NULL, foto_2_anterior = NULL, foto_path = NULL, foto_2_path = NULL,
           fotos = NULL, fotos_anterior = NULL, fotos_2 = NULL, fotos_2_anterior = NULL
     WHERE id = ANY(v_ids)
    RETURNING id, titulo, asignada_a)
  INSERT INTO public.familia_historial(miembro_id, texto, tarea_id, tipo, pts, version_regla)
  SELECT asignada_a, format('Foto borrada a las 24 h: %s', titulo), id, 'ajuste', 0, 1 FROM v;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;

CREATE OR REPLACE FUNCTION public.familia_limpiar_fotos_vencidas_local()
 RETURNS integer LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE n integer; v_cfg text; v_ids integer[];
BEGIN
  SELECT c.zona_horaria INTO v_cfg FROM public.familia_config c
   WHERE EXISTS (SELECT 1 FROM pg_timezone_names z WHERE z.name = c.zona_horaria) LIMIT 1;
  v_cfg := coalesce(v_cfg, 'Europe/Madrid');
  SELECT array_agg(t.id) INTO v_ids FROM public.familia_tareas t
    LEFT JOIN public.familia_miembros m ON m.id = t.asignada_a
    LEFT JOIN pg_timezone_names z ON z.name = m.zona_horaria
   WHERE t.foto_vence_at <= now()
     AND (coalesce(t.foto_url, t.foto_2, t.foto_anterior, t.foto_2_anterior, t.foto_path, t.foto_2_path) IS NOT NULL
          OR t.fotos IS NOT NULL OR t.fotos_anterior IS NOT NULL OR t.fotos_2 IS NOT NULL OR t.fotos_2_anterior IS NOT NULL)
     AND extract(hour FROM now() AT TIME ZONE coalesce(z.name, v_cfg)) = 3;
  IF v_ids IS NULL THEN RETURN 0; END IF;
  PERFORM public.familia_v6b_encolar_storage(v_ids);
  WITH v AS (
    UPDATE public.familia_tareas t
       SET foto_url = NULL, foto_2 = NULL, foto_anterior = NULL, foto_2_anterior = NULL, foto_path = NULL, foto_2_path = NULL,
           fotos = NULL, fotos_anterior = NULL, fotos_2 = NULL, fotos_2_anterior = NULL
     WHERE t.id = ANY(v_ids)
    RETURNING t.id, t.titulo, t.asignada_a)
  INSERT INTO public.familia_historial(miembro_id, texto, tarea_id, tipo, pts, version_regla)
  SELECT asignada_a, format('Foto borrada a las 24 h: %s', titulo), id, 'ajuste', 0, 1 FROM v;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $function$;
