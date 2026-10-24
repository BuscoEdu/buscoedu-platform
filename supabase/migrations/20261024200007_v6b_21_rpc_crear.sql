-- =====================================================================
-- v6b_21 · RPC de creación: + p_descripcion y p_plantilla_id (B15/B18). CAMBIO DE FIRMA ADITIVO:
-- dos parámetros nuevos AL FINAL con DEFAULT NULL → las llamadas actuales (por nombre) siguen funcionando.
-- Se hace DROP + CREATE (no se puede añadir parámetros con CREATE OR REPLACE) y se re-otorgan los mismos grants.
-- Misma lógica, mismo search_path, sin SECURITY DEFINER (invoker, como antes). Idempotente.
-- =====================================================================
DROP FUNCTION IF EXISTS public.familia_rpc_crear_tarea(text,integer,integer,text,integer,text,text,text,text,text,boolean,timestamptz,timestamptz,integer,integer,integer,bigint);
CREATE OR REPLACE FUNCTION public.familia_rpc_crear_tarea(p_titulo text, p_creada_por integer, p_asignada_a integer, p_client_req_id text,
  p_puntos integer DEFAULT 0, p_clase text DEFAULT 'tarea'::text, p_tipo text DEFAULT 'tarea'::text, p_estado text DEFAULT 'pendiente'::text,
  p_icono text DEFAULT NULL::text, p_recurrencia text DEFAULT 'once'::text, p_inmediata boolean DEFAULT false,
  p_habilita_en timestamptz DEFAULT now(), p_fecha_limite timestamptz DEFAULT NULL::timestamptz, p_ventana_min integer DEFAULT NULL::integer,
  p_pierde_pts integer DEFAULT NULL::integer, p_conjunto_con integer DEFAULT NULL::integer, p_duplicada_de bigint DEFAULT NULL::bigint,
  p_descripcion text DEFAULT NULL, p_plantilla_id integer DEFAULT NULL)                     -- v6b
 RETURNS bigint LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_id bigint;
BEGIN
  IF coalesce(trim(p_client_req_id),'')='' THEN RAISE EXCEPTION 'client_req_id obligatorio'; END IF;
  SELECT id INTO v_id FROM public.familia_tareas WHERE client_req_id=p_client_req_id;
  IF FOUND THEN RETURN v_id; END IF;
  IF coalesce(trim(p_titulo),'')='' THEN RAISE EXCEPTION 'título obligatorio'; END IF;
  IF p_clase NOT IN ('tarea','deber') THEN RAISE EXCEPTION 'clase inválida'; END IF;
  IF p_estado NOT IN ('pendiente','borrador') THEN RAISE EXCEPTION 'estado inicial inválido'; END IF;
  IF coalesce(p_puntos,0) < 0 OR coalesce(p_pierde_pts,0) < 0 OR coalesce(p_ventana_min,1) <= 0 THEN
    RAISE EXCEPTION 'valores numéricos inválidos'; END IF;
  PERFORM 1 FROM public.familia_miembros WHERE id=p_asignada_a;
  IF NOT FOUND THEN RAISE EXCEPTION 'miembro asignado % no existe', p_asignada_a; END IF;
  INSERT INTO public.familia_tareas(titulo,puntos,recurrencia,icono,asignada_a,conjunto_con,tipo,
    inmediata,estado,creada_por,puntos_sumados,habilita_en,fecha_limite,ventana_horas,
    clase,pierde_pts,ventana_min,duplicada_de,client_req_id,descripcion,plantilla_id)
  VALUES (trim(p_titulo),coalesce(p_puntos,0),p_recurrencia,p_icono,p_asignada_a,p_conjunto_con,p_tipo,
    p_inmediata,p_estado,p_creada_por,false,p_habilita_en,
    coalesce(p_fecha_limite, p_habilita_en + make_interval(mins=>p_ventana_min)),
    CASE WHEN p_ventana_min IS NULL THEN NULL ELSE ceil(p_ventana_min/60.0) END,
    p_clase,p_pierde_pts,p_ventana_min,p_duplicada_de,p_client_req_id,p_descripcion,p_plantilla_id)
  ON CONFLICT (client_req_id) WHERE client_req_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM public.familia_tareas WHERE client_req_id=p_client_req_id; END IF;
  RETURN v_id;
END $function$;
REVOKE ALL ON FUNCTION public.familia_rpc_crear_tarea(text,integer,integer,text,integer,text,text,text,text,text,boolean,timestamptz,timestamptz,integer,integer,integer,bigint,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_crear_tarea(text,integer,integer,text,integer,text,text,text,text,text,boolean,timestamptz,timestamptz,integer,integer,integer,bigint,text,integer) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.familia_rpc_crear_lote(integer,text,text,text,integer,timestamptz,text,integer,integer,integer,integer[],text,text,text,text);
CREATE OR REPLACE FUNCTION public.familia_rpc_crear_lote(p_actor_id integer, p_client_req_id text, p_titulo text, p_clase text, p_puntos integer,
  p_inicio timestamptz, p_recurrencia text, p_veces integer, p_ventana_min integer, p_penal integer, p_hijos integer[], p_modo text,
  p_icono text DEFAULT '📋'::text, p_estado text DEFAULT 'borrador'::text, p_zona text DEFAULT NULL::text,
  p_descripcion text DEFAULT NULL, p_plantilla_id integer DEFAULT NULL)                     -- v6b
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_ids bigint[]; v_kids integer[]; v_n integer := 0; v_i integer := 0; v_id bigint;
  v_at timestamptz; v_quien integer; v_deber boolean; v_pref text := p_client_req_id||':'; k integer;
  v_a public.familia_miembros%ROWTYPE; v_zona text;
BEGIN
  IF coalesce(trim(p_client_req_id),'')='' THEN RAISE EXCEPTION 'client_req_id obligatorio'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('familia_lote:'||p_client_req_id));
  SELECT array_agg(id ORDER BY id) INTO v_ids FROM public.familia_tareas WHERE left(client_req_id, length(v_pref))=v_pref;
  IF v_ids IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'idempotente',true,'ids',to_jsonb(v_ids),'n',cardinality(v_ids)); END IF;
  SELECT * INTO v_a FROM public.familia_miembros WHERE id=p_actor_id;
  IF NOT public.familia_es_admin(v_a) THEN RAISE EXCEPTION 'solo un padre crea lotes'; END IF;
  IF coalesce(trim(p_titulo),'')='' THEN RAISE EXCEPTION 'título obligatorio'; END IF;
  IF p_clase NOT IN ('tarea','deber') THEN RAISE EXCEPTION 'clase inválida'; END IF;
  IF p_modo NOT IN ('uno','entre','cada_uno') THEN RAISE EXCEPTION 'modo inválido'; END IF;
  IF p_estado NOT IN ('borrador','pendiente') THEN RAISE EXCEPTION 'estado inicial inválido'; END IF;
  IF p_inicio IS NULL OR coalesce(p_ventana_min,0) <= 0 OR coalesce(p_puntos,0) < 0 OR coalesce(p_penal,0) < 0 THEN
    RAISE EXCEPTION 'valores numéricos inválidos'; END IF;
  IF coalesce(cardinality(p_hijos),0)=0 OR (p_modo='uno' AND cardinality(p_hijos)<>1) THEN RAISE EXCEPTION 'hijos inválidos para el modo'; END IF;
  SELECT array_agg(m.id ORDER BY CASE WHEN p_modo='entre' THEN random() ELSE m.id END) INTO v_kids
  FROM public.familia_miembros m WHERE m.id = ANY(p_hijos) AND NOT public.familia_es_admin(m);
  IF coalesce(cardinality(v_kids),0) <> (SELECT count(DISTINCT x) FROM unnest(p_hijos) x) THEN
    RAISE EXCEPTION 'algún hijo no existe o es padre'; END IF;
  v_deber := p_clase='deber';
  v_zona := public.familia_v4_zona(p_actor_id, p_zona);
  FOR v_at IN SELECT f FROM public.familia_v4_fechas_lote(p_inicio,p_recurrencia,p_veces,v_zona) f ORDER BY f LOOP
    FOR k IN 1..CASE WHEN p_modo='cada_uno' THEN cardinality(v_kids) ELSE 1 END LOOP
      v_quien := CASE WHEN p_modo='cada_uno' THEN v_kids[k] ELSE v_kids[(v_i % cardinality(v_kids))+1] END;
      CONTINUE WHEN EXISTS (SELECT 1 FROM public.familia_tareas t
        WHERE (t.asignada_a=v_quien OR t.conjunto_con=v_quien) AND lower(trim(t.titulo))=lower(trim(p_titulo))
          AND t.lote IS DISTINCT FROM 'v4-'||p_client_req_id
          AND abs(extract(epoch FROM (coalesce(t.habilita_en,t.fecha_limite) - v_at))) < 12*3600);
      v_n := v_n + 1;
      INSERT INTO public.familia_tareas(titulo,puntos,recurrencia,icono,lote,fecha_limite,habilita_en,ventana_horas,
        max_negativo,resta_por_minuto,puntos_penalizacion_dia,creada_por,puntos_sumados,asignada_a,tipo,inmediata,estado,
        clase,pierde_pts,ventana_min,client_req_id,descripcion,plantilla_id)
      VALUES (trim(p_titulo), CASE WHEN v_deber THEN 0 ELSE coalesce(p_puntos,0) END, p_recurrencia, p_icono, 'v4-'||p_client_req_id,
        v_at + make_interval(mins=>p_ventana_min), v_at - make_interval(mins=>p_ventana_min), greatest(1, ceil(p_ventana_min/60.0))::integer,
        0, 0, coalesce(p_penal,0), p_actor_id, false, v_quien, CASE WHEN v_deber THEN 'deber' ELSE 'tarea' END, false, p_estado,
        p_clase, CASE WHEN v_deber THEN coalesce(p_penal,0) END, p_ventana_min, v_pref||v_n, p_descripcion, p_plantilla_id)
      RETURNING id INTO v_id;
      v_ids := array_append(v_ids, v_id);
    END LOOP;
    v_i := v_i + 1;
    IF v_n > 200 THEN RAISE EXCEPTION 'demasiadas filas en un lote (máx. 200)'; END IF;
  END LOOP;
  IF v_n = 0 THEN RAISE EXCEPTION 'no quedan fechas en lo que queda del mes'; END IF;
  RETURN jsonb_build_object('ok',true,'idempotente',false,'ids',to_jsonb(v_ids),'n',v_n,'zona',v_zona);
END $function$;
REVOKE ALL ON FUNCTION public.familia_rpc_crear_lote(integer,text,text,text,integer,timestamptz,text,integer,integer,integer,integer[],text,text,text,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_crear_lote(integer,text,text,text,integer,timestamptz,text,integer,integer,integer,integer[],text,text,text,text,text,integer) TO anon, authenticated, service_role;
