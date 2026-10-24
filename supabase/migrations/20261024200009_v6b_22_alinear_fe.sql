-- =====================================================================
-- v6b_22 · Alineación con el contrato FE (20:08). Idempotente. BD bot.
-- B18: nombres max_por_dia / intervalo_min_min; RPC familia_rpc_cupo_plantilla (reemplaza familia_rpc_frecuencia_estado,
--      creada en v6b_18 hace minutos y sin uso). B20: familia_rpc_guardar_tema. B7: proxima_liberacion_ts / fecha_liberacion_ts.
-- =====================================================================
-- Bloque 1: renombrar columnas B18 (aún sin uso por FE)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='familia_plantillas_tareas' AND column_name='max_dia') THEN
    ALTER TABLE public.familia_plantillas_tareas RENAME COLUMN max_dia TO max_por_dia; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='familia_plantillas_tareas' AND column_name='intervalo_min') THEN
    ALTER TABLE public.familia_plantillas_tareas RENAME COLUMN intervalo_min TO intervalo_min_min; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='familia_tareas' AND column_name='max_dia') THEN
    ALTER TABLE public.familia_tareas RENAME COLUMN max_dia TO max_por_dia; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='familia_tareas' AND column_name='intervalo_min') THEN
    ALTER TABLE public.familia_tareas RENAME COLUMN intervalo_min TO intervalo_min_min; END IF;
END $$;

-- Bloque 2: trigger B18 con los nombres nuevos (misma lógica)
CREATE OR REPLACE FUNCTION public.familia_trg_v6b_frecuencia()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE p public.familia_plantillas_tareas%ROWTYPE; v_ref timestamptz; v_dia date; n int; v_ult timestamptz; v_prox timestamptz;
BEGIN
  IF NEW.plantilla_id IS NULL OR NEW.asignada_a IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO p FROM public.familia_plantillas_tareas WHERE id = NEW.plantilla_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  NEW.max_por_dia := coalesce(NEW.max_por_dia, p.max_por_dia);
  NEW.intervalo_min_min := coalesce(NEW.intervalo_min_min, p.intervalo_min_min);
  IF NEW.estado = 'borrador' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('familia_b18:'||NEW.plantilla_id||':'||NEW.asignada_a));
  v_ref := coalesce(NEW.habilita_en, now());
  v_dia := public.familia_v6b_dia(v_ref);
  SELECT count(*), max(coalesce(t.habilita_en, t.creado_en)) INTO n, v_ult
    FROM public.familia_tareas t
   WHERE t.plantilla_id = NEW.plantilla_id AND t.asignada_a = NEW.asignada_a
     AND t.archivada_en IS NULL AND coalesce(t.estado,'') NOT IN ('cancelada','borrador')
     AND NOT (t.estado = 'rechazada' AND t.marcada_en IS NULL AND t.habilita_en IS NULL)
     AND public.familia_v6b_dia(coalesce(t.habilita_en, t.creado_en)) = v_dia;
  IF n >= p.max_por_dia THEN
    RAISE EXCEPTION 'Ya se hizo hoy (%/%). Vuelve mañana después de las 3:00', n, p.max_por_dia
      USING HINT = 'b18_cupo', DETAIL = json_build_object('usadas',n,'max',p.max_por_dia)::text;
  END IF;
  IF p.intervalo_min_min > 0 AND v_ult IS NOT NULL THEN
    v_prox := v_ult + make_interval(mins => p.intervalo_min_min);
    IF v_ref < v_prox THEN
      RAISE EXCEPTION 'Podrás volver a hacerla a las %', to_char(v_prox AT TIME ZONE 'Europe/Madrid','HH24:MI')
        USING HINT = 'b18_intervalo', DETAIL = json_build_object('proxima_hora', v_prox)::text;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Bloque 3: RPC de lectura del cupo (contrato FE)
DROP FUNCTION IF EXISTS public.familia_rpc_frecuencia_estado(integer,integer);
CREATE OR REPLACE FUNCTION public.familia_rpc_cupo_plantilla(p_plantilla_id integer, p_miembro_id integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  WITH p AS (SELECT * FROM public.familia_plantillas_tareas WHERE id = p_plantilla_id),
  c AS (SELECT count(*)::int n, max(coalesce(t.habilita_en,t.creado_en)) ult FROM public.familia_tareas t
         WHERE t.plantilla_id = p_plantilla_id AND t.asignada_a = p_miembro_id AND t.archivada_en IS NULL
           AND coalesce(t.estado,'') NOT IN ('cancelada','borrador')
           AND NOT (t.estado='rechazada' AND t.marcada_en IS NULL AND t.habilita_en IS NULL)
           AND public.familia_v6b_dia(coalesce(t.habilita_en,t.creado_en)) = public.familia_v6b_dia(now()))
  SELECT jsonb_build_object('usadas',c.n,'max',p.max_por_dia,'intervalo_min_min',p.intervalo_min_min,
    -- proxima_hora: cuándo se podrá de nuevo (null = ya se puede). Cupo lleno → próximo reinicio 03:00 Madrid.
    'proxima_hora', CASE
       WHEN c.n >= p.max_por_dia THEN ((public.familia_v6b_dia(now()) + 1)::timestamp + interval '3 hours') AT TIME ZONE 'Europe/Madrid'
       WHEN p.intervalo_min_min > 0 AND c.ult IS NOT NULL AND now() < c.ult + make_interval(mins=>p.intervalo_min_min)
         THEN c.ult + make_interval(mins=>p.intervalo_min_min) END)
  FROM p, c;
$$;
REVOKE ALL ON FUNCTION public.familia_rpc_cupo_plantilla(integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_cupo_plantilla(integer,integer) TO anon, authenticated, service_role;

-- Bloque 4: B20 guardar tema (cualquier miembro guarda el suyo; «Ver como» no debe llamarlo). NULL = azul.
CREATE OR REPLACE FUNCTION public.familia_rpc_guardar_tema(p_actor_id integer, p_tema text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v text := nullif(lower(btrim(coalesce(p_tema,''))),'');
BEGIN
  IF v IS NOT NULL AND v NOT IN ('azul','verde','morado','naranja','rosa') THEN RAISE EXCEPTION 'tema inválido'; END IF;
  UPDATE public.familia_miembros SET tema = v WHERE id = p_actor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'miembro % no existe', p_actor_id; END IF;
  RETURN jsonb_build_object('ok',true,'tema',coalesce(v,'azul'));
END $$;
COMMENT ON FUNCTION public.familia_rpc_guardar_tema(integer,text) IS '⚠ v6b: p_actor_id llega del cliente y NO se verifica hasta F6.';
REVOKE ALL ON FUNCTION public.familia_rpc_guardar_tema(integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_guardar_tema(integer,text) TO anon, authenticated, service_role;

-- Bloque 5: B7 · hora de liberación (timestamptz) además de la fecha (se mantiene la fecha por compatibilidad)
CREATE OR REPLACE FUNCTION public.familia_rpc_mesada_saldo(p_miembro_id integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('miembro_id',m.id,'total',coalesce(m.puntos,0),'bloqueada',coalesce(b.s,0),
    'disponible',greatest(0,coalesce(m.puntos,0)-coalesce(b.s,0)),'proxima_liberacion',b.f,
    'proxima_liberacion_ts',(b.f::timestamp AT TIME ZONE 'Europe/Madrid'))   -- v6b B7: 00:00 Madrid del día
  FROM public.familia_miembros m
  LEFT JOIN LATERAL (SELECT sum(x.monto)::integer s, min(p.fecha_liberacion) f
    FROM public.familia_mesadas x JOIN public.familia_mesada_periodos p ON p.periodo=x.periodo
    WHERE x.miembro_id=m.id AND x.estado='cargada') b ON true
  WHERE m.id=p_miembro_id;
$$;

CREATE OR REPLACE FUNCTION public.familia_rpc_mesada_estado(p_actor_id integer, p_miembro_id integer DEFAULT NULL, p_zona text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT q.j || jsonb_build_object('fecha_liberacion_ts',   -- v6b B7: 00:00 Madrid de fecha_liberacion
           ((q.j->>'fecha_liberacion')::date::timestamp AT TIME ZONE 'Europe/Madrid')) FROM (
  WITH z AS (SELECT (now() AT TIME ZONE public.familia_v4_zona(p_actor_id,p_zona))::date hoy)
  SELECT jsonb_build_object(
    'hoy', (SELECT hoy FROM z),
    'config', (SELECT jsonb_build_object('modo',mesada_modo,'dia_liberacion',mesada_dia_liberacion,
       'bono_activo',mesada_bono_activo,'bono_pct',mesada_bono_pct,'proxima_fecha_guardada',mesada_proxima_fecha)
       FROM public.familia_config ORDER BY id LIMIT 1),
    -- Fecha principal para el FE: periodo pendiente más antiguo › fecha guardada › día por defecto del próximo corte.
    'fecha_liberacion', coalesce(
       (SELECT min(fecha_liberacion) FROM public.familia_mesada_periodos WHERE liberado_en IS NULL),
       (SELECT mesada_proxima_fecha FROM public.familia_config ORDER BY id LIMIT 1),
       (SELECT ((date_trunc('month',hoy) + interval '2 month')::date + (coalesce(c.mesada_dia_liberacion,1)-1))
          FROM z, public.familia_config c ORDER BY c.id LIMIT 1)),
    'periodos_pendientes', (SELECT coalesce(jsonb_agg(jsonb_build_object('periodo',p.periodo,'fecha_liberacion',p.fecha_liberacion,
       'dias_para_liberar',p.fecha_liberacion-(SELECT hoy FROM z),'puede_liberar',(SELECT hoy FROM z)>=p.fecha_liberacion,
       'recordatorio_enviado',p.recordatorio_en IS NOT NULL) ORDER BY p.periodo),'[]'::jsonb)
       FROM public.familia_mesada_periodos p WHERE p.liberado_en IS NULL),
    'hijos', (SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',m.nombre,'monto',m.mesada_monto,'pausada',m.mesada_pausada)
       || public.familia_rpc_mesada_saldo(m.id) ORDER BY m.id),'[]'::jsonb)
       FROM public.familia_miembros m WHERE NOT public.familia_es_admin(m) AND (p_miembro_id IS NULL OR m.id=p_miembro_id))) AS j) q;
$$;

