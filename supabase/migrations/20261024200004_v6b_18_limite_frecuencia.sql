-- =====================================================================
-- v6b_18 · B18 Límite de frecuencia: máx. veces por día + intervalo mínimo. Idempotente.
-- Día = 03:00–03:00 Europe/Madrid. Contador CALCULADO (sin columna contador ni cron).
-- Aplica a tareas con plantilla_id (misma plantilla + mismo hijo). Validación atómica en trigger
-- BEFORE INSERT (cubre RPC, INSERT directo de v1/v3 y solicitudes del hijo) con advisory lock.
-- =====================================================================
-- Bloque 1: columnas (plantilla = configuración; tarea = copia al crear, informativa)
ALTER TABLE public.familia_plantillas_tareas
  ADD COLUMN IF NOT EXISTS max_dia smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS intervalo_min integer NOT NULL DEFAULT 0;
ALTER TABLE public.familia_tareas
  ADD COLUMN IF NOT EXISTS max_dia smallint,
  ADD COLUMN IF NOT EXISTS intervalo_min integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='familia_plantillas_frecuencia_chk') THEN
    ALTER TABLE public.familia_plantillas_tareas ADD CONSTRAINT familia_plantillas_frecuencia_chk
      CHECK (max_dia BETWEEN 1 AND 10 AND intervalo_min IN (0,15,30,60,120,180,240,360,480)); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='familia_tareas_frecuencia_chk') THEN
    ALTER TABLE public.familia_tareas ADD CONSTRAINT familia_tareas_frecuencia_chk
      CHECK ((max_dia IS NULL OR max_dia BETWEEN 1 AND 10) AND (intervalo_min IS NULL OR intervalo_min IN (0,15,30,60,120,180,240,360,480))); END IF;
END $$;
-- Bloque 2: default de lo existente (plantillas ya quedan 1/0 por DEFAULT); tareas existentes → 1/0 (ids respaldados en v6b_00)
UPDATE public.familia_tareas SET max_dia=1, intervalo_min=0
 WHERE max_dia IS NULL AND id IN (SELECT id FROM respaldos.familia_v6b_previo_tareas_ids);

-- Bloque 3: inicio del «día» (03:00 Madrid) de un instante
CREATE OR REPLACE FUNCTION public.familia_v6b_dia(p_ts timestamptz)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT ((p_ts AT TIME ZONE 'Europe/Madrid') - interval '3 hours')::date;
$$;
GRANT EXECUTE ON FUNCTION public.familia_v6b_dia(timestamptz) TO anon, authenticated, service_role;

-- Bloque 4: validación. Cuenta = tareas de la misma plantilla y hijo en el mismo día (por hora de referencia
-- = habilita_en o, si no hay, creación), excepto solicitud negada (rechazada sin haber abierto), cancelada o archivada.
CREATE OR REPLACE FUNCTION public.familia_trg_v6b_frecuencia()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE p public.familia_plantillas_tareas%ROWTYPE; v_ref timestamptz; v_dia date; n int; v_ult timestamptz; v_prox timestamptz;
BEGIN
  IF NEW.plantilla_id IS NULL OR NEW.asignada_a IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO p FROM public.familia_plantillas_tareas WHERE id = NEW.plantilla_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  NEW.max_dia := coalesce(NEW.max_dia, p.max_dia);
  NEW.intervalo_min := coalesce(NEW.intervalo_min, p.intervalo_min);
  IF NEW.estado = 'borrador' THEN RETURN NEW; END IF;      -- borradores de lote no consumen cupo hasta publicarse
  PERFORM pg_advisory_xact_lock(hashtext('familia_b18:'||NEW.plantilla_id||':'||NEW.asignada_a));
  v_ref := coalesce(NEW.habilita_en, now());
  v_dia := public.familia_v6b_dia(v_ref);
  SELECT count(*), max(coalesce(t.habilita_en, t.creado_en)) INTO n, v_ult
    FROM public.familia_tareas t
   WHERE t.plantilla_id = NEW.plantilla_id AND t.asignada_a = NEW.asignada_a
     AND t.archivada_en IS NULL AND coalesce(t.estado,'') NOT IN ('cancelada','borrador')
     AND NOT (t.estado = 'rechazada' AND t.marcada_en IS NULL AND t.habilita_en IS NULL)   -- solicitud negada
     AND public.familia_v6b_dia(coalesce(t.habilita_en, t.creado_en)) = v_dia;
  IF n >= p.max_dia THEN
    RAISE EXCEPTION 'Ya se hizo hoy (%/%). Vuelve mañana después de las 3:00', n, p.max_dia
      USING HINT = 'b18_cupo', DETAIL = json_build_object('hechas',n,'max',p.max_dia)::text;
  END IF;
  IF p.intervalo_min > 0 AND v_ult IS NOT NULL THEN
    v_prox := v_ult + make_interval(mins => p.intervalo_min);
    IF v_ref < v_prox THEN
      RAISE EXCEPTION 'Podrás volver a hacerla a las %', to_char(v_prox AT TIME ZONE 'Europe/Madrid','HH24:MI')
        USING HINT = 'b18_intervalo', DETAIL = json_build_object('proxima', v_prox)::text;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.familia_trg_v6b_frecuencia() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS familia_tareas_v6b_b18 ON public.familia_tareas;
CREATE TRIGGER familia_tareas_v6b_b18 BEFORE INSERT ON public.familia_tareas
  FOR EACH ROW EXECUTE FUNCTION public.familia_trg_v6b_frecuencia();

-- Bloque 5: lectura para el FE (cupo actual de una plantilla para un hijo)
CREATE OR REPLACE FUNCTION public.familia_rpc_frecuencia_estado(p_plantilla_id integer, p_miembro_id integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  WITH p AS (SELECT * FROM public.familia_plantillas_tareas WHERE id = p_plantilla_id),
  c AS (SELECT count(*) n, max(coalesce(t.habilita_en,t.creado_en)) ult FROM public.familia_tareas t
         WHERE t.plantilla_id = p_plantilla_id AND t.asignada_a = p_miembro_id AND t.archivada_en IS NULL
           AND coalesce(t.estado,'') NOT IN ('cancelada','borrador')
           AND NOT (t.estado='rechazada' AND t.marcada_en IS NULL AND t.habilita_en IS NULL)
           AND public.familia_v6b_dia(coalesce(t.habilita_en,t.creado_en)) = public.familia_v6b_dia(now()))
  SELECT jsonb_build_object('max_dia',p.max_dia,'intervalo_min',p.intervalo_min,'hechas_hoy',c.n,
    'puede', c.n < p.max_dia AND (p.intervalo_min=0 OR c.ult IS NULL OR now() >= c.ult + make_interval(mins=>p.intervalo_min)),
    'proxima', CASE WHEN p.intervalo_min>0 AND c.ult IS NOT NULL THEN c.ult + make_interval(mins=>p.intervalo_min) END,
    'reinicio', ((public.familia_v6b_dia(now()) + 1)::timestamp + interval '3 hours') AT TIME ZONE 'Europe/Madrid')
  FROM p, c;
$$;
REVOKE ALL ON FUNCTION public.familia_rpc_frecuencia_estado(integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_frecuencia_estado(integer,integer) TO anon, authenticated, service_role;
