-- MF O3 fix QA (PR #85) · 2026-10-30 Europe/Madrid · Backend BuscoEdu (bot)
-- 1) link_emitir: extensions.gen_random_bytes (pgcrypto en schema extensions en Supabase).
-- 2) crear_tarea / lote / serie: familia_id desde sesión (fallback miembro); INSERT explícito.
-- Por qué NULL en QA: serie_generar y la envoltura pública no escribían familia_id;
--    la base sí, pero tareas de serie/regeneración y refuerzo post-wrapper faltaban.
-- No toca índices BD ni tabla familia_links. No altera puntos.

-- ========== Guarda puntos m1–m6 ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS NOT NULL AND cardinality(v)=6 AND v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'mf_o3_fix_guarda_pts: puntos=% esperado=%; aborto', v, esperado;
  END IF;
END $$;


-- ========== Respaldo defs previas (= estado tras 20261031090000) para undo ==========
CREATE SCHEMA IF NOT EXISTS respaldos;
CREATE TABLE IF NOT EXISTS respaldos.familia_mf_o3_fix_previo (
  proname text NOT NULL,
  args text NOT NULL,
  def text NOT NULL,
  tomado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proname, args)
);
DO $$
DECLARE r record; v_def text; v_args text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname IN (
       'familia_rpc_link_emitir','familia_v6d_base_crear_tarea','familia_rpc_crear_tarea',
       'familia_v6c_serie_generar','familia_v6d_base_serie_crear','familia_v6d_base_crear_lote'
     )
  LOOP
    v_args := pg_get_function_identity_arguments(r.oid);
    v_def := pg_get_functiondef(r.oid);
    INSERT INTO respaldos.familia_mf_o3_fix_previo(proname,args,def)
    VALUES (r.proname, v_args, v_def)
    ON CONFLICT (proname,args) DO NOTHING;
  END LOOP;
END $$;
REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA respaldos TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA respaldos TO service_role;

-- Helper: familia_id de sesión, con fallback al miembro actor (fail-closed).
CREATE OR REPLACE FUNCTION public.familia_mf_familia_sesion_o_actor(p_actor_id integer)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fid bigint;
  v_actor_fid bigint;
BEGIN
  SELECT s.familia_id INTO v_fid FROM public.familia_mf_sesion_ctx() s LIMIT 1;
  v_actor_fid := public.familia_mf_familia_de_miembro(p_actor_id);
  IF v_fid IS NOT NULL AND v_fid IS DISTINCT FROM v_actor_fid THEN
    RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501';
  END IF;
  RETURN coalesce(v_fid, v_actor_fid);
END $$;
REVOKE ALL ON FUNCTION public.familia_mf_familia_sesion_o_actor(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_mf_familia_sesion_o_actor(integer) TO service_role;

-- ========== 1) link_emitir: gen_random_bytes calificado ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_link_emitir(p_tipo text, p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ctx record;
  v_tipo text := lower(trim(coalesce(p_tipo,'')));
  v_tok text;
  v_ok boolean := false;
BEGIN
  SELECT * INTO ctx FROM public.familia_mf_sesion_ctx() LIMIT 1;
  IF ctx.familia_id IS NULL THEN
    RAISE EXCEPTION 'enlace no disponible' USING HINT='mf_o4_link', ERRCODE='42501';
  END IF;
  IF v_tipo NOT IN ('tarea','premio') OR p_id IS NULL THEN
    RAISE EXCEPTION 'enlace no disponible' USING HINT='mf_o4_link', ERRCODE='22023';
  END IF;

  IF v_tipo = 'tarea' THEN
    SELECT true INTO v_ok FROM public.familia_tareas t
     WHERE t.id = p_id AND t.familia_id = ctx.familia_id AND t.archivada_en IS NULL;
  ELSIF v_tipo = 'premio' THEN
    SELECT true INTO v_ok FROM public.familia_premios r
     WHERE r.id = p_id AND r.familia_id = ctx.familia_id;
  END IF;
  IF NOT coalesce(v_ok, false) THEN
    RAISE EXCEPTION 'enlace no disponible' USING HINT='mf_o4_link', ERRCODE='42501';
  END IF;

  SELECT l.token INTO v_tok FROM public.familia_links l
   WHERE l.familia_id = ctx.familia_id AND l.tipo = v_tipo AND l.ref_id = p_id
     AND l.revocado_en IS NULL AND (l.expira_en IS NULL OR l.expira_en > now())
   ORDER BY l.creado_en DESC LIMIT 1;
  IF v_tok IS NULL THEN
    -- Supabase: pgcrypto vive en extensions (search_path fijo no lo ve)
    v_tok := encode(extensions.gen_random_bytes(32), 'hex');
    INSERT INTO public.familia_links(familia_id, tipo, ref_id, token)
    VALUES (ctx.familia_id, v_tipo, p_id, v_tok);
  END IF;
  RETURN jsonb_build_object('token', v_tok);
END $$;
REVOKE ALL ON FUNCTION public.familia_rpc_link_emitir(text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_link_emitir(text,bigint) TO anon, authenticated, service_role;

-- ========== 2) base crear_tarea: familia_id desde sesión ==========
CREATE OR REPLACE FUNCTION public.familia_v6d_base_crear_tarea(
  p_titulo text, p_creada_por integer, p_asignada_a integer, p_client_req_id text,
  p_puntos integer DEFAULT 0, p_clase text DEFAULT 'tarea'::text, p_tipo text DEFAULT 'tarea'::text,
  p_estado text DEFAULT 'pendiente'::text, p_icono text DEFAULT NULL::text, p_recurrencia text DEFAULT 'once'::text,
  p_inmediata boolean DEFAULT false, p_habilita_en timestamptz DEFAULT now(),
  p_fecha_limite timestamptz DEFAULT NULL::timestamptz, p_ventana_min integer DEFAULT NULL::integer,
  p_pierde_pts integer DEFAULT NULL::integer, p_conjunto_con integer DEFAULT NULL::integer,
  p_duplicada_de bigint DEFAULT NULL::bigint, p_descripcion text DEFAULT NULL, p_plantilla_id integer DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_id bigint; v_fid bigint; v_asig_fid bigint;
BEGIN
  IF coalesce(trim(p_client_req_id),'')='' THEN RAISE EXCEPTION 'client_req_id obligatorio'; END IF;
  SELECT id INTO v_id FROM public.familia_tareas WHERE client_req_id=p_client_req_id;
  IF FOUND THEN
    -- Refuerzo idempotente: si quedó NULL, rellenar desde sesión/actor
    UPDATE public.familia_tareas
       SET familia_id = public.familia_mf_familia_sesion_o_actor(p_creada_por)
     WHERE id = v_id AND familia_id IS NULL;
    RETURN v_id;
  END IF;
  IF coalesce(trim(p_titulo),'')='' THEN RAISE EXCEPTION 'título obligatorio'; END IF;
  IF p_clase NOT IN ('tarea','deber') THEN RAISE EXCEPTION 'clase inválida'; END IF;
  IF p_estado NOT IN ('pendiente','borrador') THEN RAISE EXCEPTION 'estado inicial inválido'; END IF;
  IF coalesce(p_puntos,0) < 0 OR coalesce(p_pierde_pts,0) < 0 OR coalesce(p_ventana_min,1) <= 0 THEN
    RAISE EXCEPTION 'valores numéricos inválidos'; END IF;

  v_fid := public.familia_mf_familia_sesion_o_actor(p_creada_por);
  IF p_asignada_a IS NOT NULL THEN
    v_asig_fid := public.familia_mf_familia_de_miembro(p_asignada_a);
    IF v_asig_fid IS DISTINCT FROM v_fid THEN
      RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501';
    END IF;
  END IF;
  IF p_conjunto_con IS NOT NULL THEN
    IF public.familia_mf_familia_de_miembro(p_conjunto_con) IS DISTINCT FROM v_fid THEN
      RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501';
    END IF;
  END IF;

  INSERT INTO public.familia_tareas(titulo,puntos,recurrencia,icono,asignada_a,conjunto_con,tipo,
    inmediata,estado,creada_por,puntos_sumados,habilita_en,fecha_limite,ventana_horas,
    clase,pierde_pts,ventana_min,duplicada_de,client_req_id,descripcion,plantilla_id,familia_id)
  VALUES (trim(p_titulo),coalesce(p_puntos,0),p_recurrencia,p_icono,p_asignada_a,p_conjunto_con,p_tipo,
    p_inmediata,p_estado,p_creada_por,false,p_habilita_en,
    coalesce(p_fecha_limite, p_habilita_en + make_interval(mins=>p_ventana_min)),
    CASE WHEN p_ventana_min IS NULL THEN NULL ELSE ceil(p_ventana_min/60.0) END,
    p_clase,p_pierde_pts,p_ventana_min,p_duplicada_de,p_client_req_id,p_descripcion,p_plantilla_id,v_fid)
  ON CONFLICT (client_req_id) WHERE client_req_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.familia_tareas WHERE client_req_id=p_client_req_id;
    UPDATE public.familia_tareas SET familia_id = coalesce(familia_id, v_fid) WHERE id = v_id;
  END IF;
  RETURN v_id;
END $function$;

-- Envoltura pública: refuerza familia_id tras base (cubre exige_foto path)
CREATE OR REPLACE FUNCTION public.familia_rpc_crear_tarea(
  p_titulo text, p_creada_por integer, p_asignada_a integer, p_client_req_id text,
  p_puntos integer DEFAULT 0, p_clase text DEFAULT 'tarea'::text, p_tipo text DEFAULT 'tarea'::text,
  p_estado text DEFAULT 'pendiente'::text, p_icono text DEFAULT NULL::text, p_recurrencia text DEFAULT 'once'::text,
  p_inmediata boolean DEFAULT false, p_habilita_en timestamptz DEFAULT now(),
  p_fecha_limite timestamptz DEFAULT NULL::timestamptz, p_ventana_min integer DEFAULT NULL::integer,
  p_pierde_pts integer DEFAULT NULL::integer, p_conjunto_con integer DEFAULT NULL::integer,
  p_duplicada_de bigint DEFAULT NULL::bigint, p_descripcion text DEFAULT NULL::text,
  p_plantilla_id integer DEFAULT NULL::integer, p_exige_foto boolean DEFAULT false,
  p_confirmar_pasado boolean DEFAULT false)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_rol text; v_id bigint; v_pl public.familia_plantillas_tareas%ROWTYPE; v_existe boolean;
  v_fin timestamptz; v_cruza jsonb; v_fid bigint;
BEGIN
  v_existe := EXISTS (SELECT 1 FROM public.familia_tareas WHERE client_req_id=p_client_req_id);
  v_fid := public.familia_mf_familia_sesion_o_actor(p_creada_por);
  BEGIN
    v_rol := public.familia_v6d_actor(p_creada_por, NULL);
  EXCEPTION WHEN undefined_function THEN
    v_rol := 'padre_admin';
  END;
  IF NOT v_existe THEN
    IF v_rol='hijo' THEN
      IF p_estado <> 'borrador' THEN RAISE EXCEPTION 'Un hijo solo puede proponer tareas (quedan por activar)' USING HINT='d6_permiso:crear_asignar'; END IF;
    ELSE
      BEGIN
        PERFORM public.familia_v6d_actor(p_creada_por, 'crear_asignar');
      EXCEPTION WHEN undefined_function THEN NULL;
      END;
      IF v_rol='padre' THEN
        SELECT * INTO v_pl FROM public.familia_plantillas_tareas
         WHERE id=p_plantilla_id AND (familia_id IS NULL OR familia_id = v_fid);
        IF v_pl.id IS NULL OR coalesce(p_puntos,0) <> coalesce(v_pl.puntos,0) THEN
          RAISE EXCEPTION 'Solo el padre admin cambia los puntos: elige una plantilla' USING HINT='d6_permiso:cambiar_puntos'; END IF;
      END IF;
    END IF;
    BEGIN
      PERFORM public.familia_v6d_validar(p_titulo, p_habilita_en,
        coalesce(p_fecha_limite, p_habilita_en + make_interval(mins=>p_ventana_min)), p_ventana_min, p_confirmar_pasado OR coalesce(p_inmediata,false));
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
    IF p_asignada_a IS NOT NULL AND p_habilita_en IS NOT NULL THEN
      v_fin := coalesce(p_fecha_limite, p_habilita_en + make_interval(mins=>coalesce(p_ventana_min,60)));
      IF v_fin > p_habilita_en THEN
        BEGIN
          v_cruza := public.familia_rpc_agenda_cruce(p_asignada_a, p_habilita_en, v_fin, NULL, NULL, NULL);
        EXCEPTION WHEN undefined_function THEN
          v_cruza := NULL;
        END;
        IF v_cruza IS NOT NULL THEN
          RAISE EXCEPTION 'En ese horario no es posible: se cruza con % (%)',
            v_cruza->>'titulo',
            to_char(timezone('Europe/Madrid', (v_cruza->>'inicio')::timestamptz), 'HH24:MI')
            USING HINT='v6e_agenda_cruce';
        END IF;
      END IF;
    END IF;
  END IF;
  v_id := public.familia_v6d_base_crear_tarea(p_titulo, p_creada_por, p_asignada_a, p_client_req_id, p_puntos, p_clase, p_tipo, p_estado,
    p_icono, p_recurrencia, p_inmediata, p_habilita_en, p_fecha_limite, p_ventana_min, p_pierde_pts, p_conjunto_con, p_duplicada_de,
    p_descripcion, p_plantilla_id);
  IF coalesce(p_exige_foto,false) AND NOT v_existe THEN
    UPDATE public.familia_tareas SET exige_foto=true, familia_id = coalesce(familia_id, v_fid) WHERE id=v_id;
  ELSE
    UPDATE public.familia_tareas SET familia_id = coalesce(familia_id, v_fid) WHERE id=v_id AND familia_id IS NULL;
  END IF;
  RETURN v_id;
END $function$;
REVOKE ALL ON FUNCTION public.familia_rpc_crear_tarea(text,integer,integer,text,integer,text,text,text,text,text,boolean,timestamptz,timestamptz,integer,integer,integer,bigint,text,integer,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_crear_tarea(text,integer,integer,text,integer,text,text,text,text,text,boolean,timestamptz,timestamptz,integer,integer,integer,bigint,text,integer,boolean,boolean) TO anon, authenticated, service_role;

-- ========== serie_generar: INSERT con familia_id (causa principal de NULL en series) ==========
CREATE OR REPLACE FUNCTION public.familia_v6c_serie_generar(p_serie uuid, p_desde timestamptz)
RETURNS integer
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE s public.familia_series%ROWTYPE; f record; h integer; i int := 0; n int := 0; v_hasta date; v_id bigint; v_dur int; v_dow int;
  v_fid bigint;
BEGIN
  SELECT * INTO s FROM public.familia_series WHERE id=p_serie FOR UPDATE;
  IF NOT FOUND OR NOT s.activa THEN RETURN 0; END IF;
  v_fid := coalesce(s.familia_id, public.familia_mf_familia_de_miembro(s.creada_por));
  IF s.familia_id IS NULL AND v_fid IS NOT NULL THEN
    UPDATE public.familia_series SET familia_id = v_fid WHERE id = s.id;
  END IF;
  v_hasta := (date_trunc('month', p_desde AT TIME ZONE coalesce(s.zona,'Europe/Madrid')) + interval '1 month - 1 day')::date;
  FOR f IN SELECT * FROM public.familia_v6c_serie_fechas(s, p_desde, v_hasta) ORDER BY inicio LOOP
    v_dow := extract(isodow FROM (f.inicio AT TIME ZONE coalesce(s.zona,'Europe/Madrid')))::int;
    v_dur := public.familia_v6e_dur_dia(s.horas, v_dow, coalesce(s.ventana_min,60));
    FOREACH h IN ARRAY CASE s.modo WHEN 'cada_uno' THEN s.hijos
                                  WHEN 'uno' THEN s.hijos[1:1]
                                  ELSE ARRAY[s.hijos[1 + (i % cardinality(s.hijos))]] END LOOP
      BEGIN
        INSERT INTO public.familia_tareas(titulo,puntos,recurrencia,icono,asignada_a,tipo,inmediata,estado,creada_por,
          puntos_sumados,habilita_en,fecha_limite,ventana_horas,clase,pierde_pts,ventana_min,descripcion,plantilla_id,
          exige_foto,serie_id,dias_semana,lote,duracion_min,aprobada_para_hacer,cierre_auto,familia_id)
        VALUES (s.titulo, CASE WHEN s.clase='deber' THEN 0 ELSE s.puntos END, 'serie', s.icono, h,
          CASE WHEN s.clase='deber' THEN 'deber' ELSE 'tarea' END, false, 'pendiente', s.creada_por,
          false, f.inicio, f.inicio + make_interval(mins=>v_dur), ceil(v_dur/60.0),
          s.clase, s.pierde_pts, v_dur, s.descripcion, s.plantilla_id, s.exige_foto, s.id, s.dias_semana, 'serie-'||s.id,
          v_dur, true, coalesce(s.cierre_auto,false), v_fid)
        ON CONFLICT DO NOTHING RETURNING id INTO v_id;
        IF v_id IS NOT NULL THEN n := n + 1; END IF; v_id := NULL;
      EXCEPTION WHEN raise_exception THEN NULL;
      END;
    END LOOP;
    i := i + 1;
  END LOOP;
  UPDATE public.familia_series SET generada_hasta=greatest(coalesce(generada_hasta,v_hasta),v_hasta), actualizado_en=now() WHERE id=s.id;
  -- Refuerzo: ninguna tarea de la serie sin familia_id
  UPDATE public.familia_tareas SET familia_id = v_fid WHERE serie_id = p_serie AND familia_id IS NULL;
  RETURN n;
END $function$;

-- base serie_crear: familia_id en INSERT de serie
CREATE OR REPLACE FUNCTION public.familia_v6d_base_serie_crear(
  p_actor_id integer, p_client_req_id text, p_titulo text, p_hijos integer[], p_dias text,
  p_hora_general time, p_horas jsonb DEFAULT NULL, p_modo text DEFAULT 'cada_uno',
  p_clase text DEFAULT 'deber', p_puntos integer DEFAULT 0, p_ventana_min integer DEFAULT 60,
  p_penal integer DEFAULT 0, p_icono text DEFAULT '📋', p_descripcion text DEFAULT NULL,
  p_plantilla_id integer DEFAULT NULL, p_exige_foto boolean DEFAULT false,
  p_mensual_dia smallint DEFAULT NULL, p_renovar boolean DEFAULT true, p_zona text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_id uuid; v_h jsonb := '{}'; d int; n int; v_hora text; v_dur int; v_zona text; v_fid bigint;
BEGIN
  IF coalesce(trim(p_client_req_id),'')='' THEN RAISE EXCEPTION 'client_req_id obligatorio'; END IF;
  SELECT id INTO v_id FROM public.familia_series WHERE client_req_id=p_client_req_id;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'idempotente',true,'serie_id',v_id); END IF;
  IF NOT coalesce(public.familia_es_admin((SELECT m FROM public.familia_miembros m WHERE m.id=p_actor_id)),false) THEN
    RAISE EXCEPTION 'solo un padre crea series'; END IF;
  v_fid := public.familia_mf_familia_sesion_o_actor(p_actor_id);
  IF EXISTS (
    SELECT 1 FROM unnest(p_hijos) x(id)
    LEFT JOIN public.familia_miembros m ON m.id=x.id
    WHERE m.id IS NULL OR m.familia_id IS DISTINCT FROM v_fid
  ) THEN
    RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501';
  END IF;
  IF coalesce(p_dias,'0000000') !~ '^[01]{7}$' OR (p_dias='0000000' AND p_mensual_dia IS NULL) THEN
    RAISE EXCEPTION 'marca al menos un día' USING HINT='c11_sin_dias'; END IF;
  IF coalesce(cardinality(p_hijos),0)=0 THEN RAISE EXCEPTION 'elige al menos un hijo'; END IF;
  IF coalesce(p_ventana_min,60) < 1 OR coalesce(p_ventana_min,60) > 72*60 THEN
    RAISE EXCEPTION 'duración fuera de rango (1 min–72 h)' USING HINT='v6e_duracion'; END IF;
  v_zona := public.familia_v4_zona(p_actor_id, coalesce(nullif(p_zona,''),'Europe/Madrid'));
  FOR d IN 1..7 LOOP
    IF p_horas IS NOT NULL AND p_horas ? d::text THEN
      IF jsonb_typeof(p_horas->d::text)='object' THEN
        v_hora := coalesce(p_horas->d::text->>'hora', to_char(p_hora_general,'HH24:MI'));
        v_dur := GREATEST(1, LEAST(72*60, coalesce((p_horas->d::text->>'dur_min')::int, p_ventana_min, 60)));
      ELSE
        v_hora := coalesce(p_horas->>d::text, to_char(p_hora_general,'HH24:MI'));
        v_dur := coalesce(p_ventana_min, 60);
      END IF;
    ELSE
      v_hora := to_char(p_hora_general,'HH24:MI');
      v_dur := coalesce(p_ventana_min, 60);
    END IF;
    v_h := v_h || jsonb_build_object(d::text, jsonb_build_object('hora', v_hora, 'dur_min', v_dur));
  END LOOP;
  INSERT INTO public.familia_series(creada_por,titulo,clase,puntos,ventana_min,pierde_pts,hijos,modo,icono,descripcion,
    plantilla_id,exige_foto,dias_semana,horas,mensual_dia,zona,renovar,client_req_id,familia_id)
  VALUES (p_actor_id,trim(p_titulo),p_clase,coalesce(p_puntos,0),coalesce(p_ventana_min,60),coalesce(p_penal,0),p_hijos,p_modo,
    p_icono,p_descripcion,p_plantilla_id,coalesce(p_exige_foto,false),p_dias,v_h,p_mensual_dia,
    v_zona,coalesce(p_renovar,true),p_client_req_id,v_fid)
  ON CONFLICT (client_req_id) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM public.familia_series WHERE client_req_id=p_client_req_id;
    UPDATE public.familia_series SET familia_id = coalesce(familia_id, v_fid) WHERE id = v_id;
    RETURN jsonb_build_object('ok',true,'idempotente',true,'serie_id',v_id); END IF;
  n := public.familia_v6c_serie_generar(v_id, now());
  RETURN jsonb_build_object('ok',true,'serie_id',v_id,'creadas',n,'horas',v_h,'zona',v_zona,'familia_id',v_fid);
END $function$;

-- lote base: preferir sesión para familia_id (ya insertaba; refuerzo)
CREATE OR REPLACE FUNCTION public.familia_v6d_base_crear_lote(
  p_actor_id integer, p_client_req_id text, p_titulo text, p_clase text, p_puntos integer,
  p_inicio timestamptz, p_recurrencia text, p_veces integer, p_ventana_min integer, p_penal integer,
  p_hijos integer[], p_modo text,
  p_icono text DEFAULT '📋'::text, p_estado text DEFAULT 'borrador'::text, p_zona text DEFAULT NULL::text,
  p_descripcion text DEFAULT NULL, p_plantilla_id integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_ids bigint[]; v_kids integer[]; v_n integer := 0; v_i integer := 0; v_id bigint;
  v_at timestamptz; v_quien integer; v_deber boolean; v_pref text := p_client_req_id||':'; k integer;
  v_a public.familia_miembros%ROWTYPE; v_zona text; v_fid bigint;
BEGIN
  IF coalesce(trim(p_client_req_id),'')='' THEN RAISE EXCEPTION 'client_req_id obligatorio'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('familia_lote:'||p_client_req_id));
  SELECT array_agg(id ORDER BY id) INTO v_ids FROM public.familia_tareas WHERE left(client_req_id, length(v_pref))=v_pref;
  IF v_ids IS NOT NULL THEN
    UPDATE public.familia_tareas SET familia_id = public.familia_mf_familia_sesion_o_actor(p_actor_id)
     WHERE id = ANY(v_ids) AND familia_id IS NULL;
    RETURN jsonb_build_object('ok',true,'idempotente',true,'ids',to_jsonb(v_ids),'n',cardinality(v_ids));
  END IF;
  SELECT * INTO v_a FROM public.familia_miembros WHERE id=p_actor_id;
  IF NOT public.familia_es_admin(v_a) THEN RAISE EXCEPTION 'solo un padre crea lotes'; END IF;
  v_fid := public.familia_mf_familia_sesion_o_actor(p_actor_id);
  IF coalesce(trim(p_titulo),'')='' THEN RAISE EXCEPTION 'título obligatorio'; END IF;
  IF p_clase NOT IN ('tarea','deber') THEN RAISE EXCEPTION 'clase inválida'; END IF;
  IF p_modo NOT IN ('uno','entre','cada_uno') THEN RAISE EXCEPTION 'modo inválido'; END IF;
  IF p_estado NOT IN ('borrador','pendiente') THEN RAISE EXCEPTION 'estado inicial inválido'; END IF;
  IF p_inicio IS NULL OR coalesce(p_ventana_min,0) <= 0 OR coalesce(p_puntos,0) < 0 OR coalesce(p_penal,0) < 0 THEN
    RAISE EXCEPTION 'valores numéricos inválidos'; END IF;
  IF coalesce(cardinality(p_hijos),0)=0 OR (p_modo='uno' AND cardinality(p_hijos)<>1) THEN RAISE EXCEPTION 'hijos inválidos para el modo'; END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(p_hijos) x(id)
    LEFT JOIN public.familia_miembros m ON m.id = x.id
    WHERE m.id IS NULL OR m.familia_id IS DISTINCT FROM v_fid OR public.familia_es_admin(m)
  ) THEN
    RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501';
  END IF;
  SELECT array_agg(m.id ORDER BY CASE WHEN p_modo='entre' THEN random() ELSE m.id END) INTO v_kids
  FROM public.familia_miembros m
  WHERE m.id = ANY(p_hijos) AND m.familia_id = v_fid AND NOT public.familia_es_admin(m);
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
        clase,pierde_pts,ventana_min,client_req_id,descripcion,plantilla_id,familia_id)
      VALUES (trim(p_titulo), CASE WHEN v_deber THEN 0 ELSE coalesce(p_puntos,0) END, p_recurrencia, p_icono, 'v4-'||p_client_req_id,
        v_at + make_interval(mins=>p_ventana_min), v_at - make_interval(mins=>p_ventana_min), greatest(1, ceil(p_ventana_min/60.0))::integer,
        0, 0, coalesce(p_penal,0), p_actor_id, false, v_quien, CASE WHEN v_deber THEN 'deber' ELSE 'tarea' END, false, p_estado,
        p_clase, CASE WHEN v_deber THEN coalesce(p_penal,0) END, p_ventana_min, v_pref||v_n, p_descripcion, p_plantilla_id, v_fid)
      RETURNING id INTO v_id;
      v_ids := array_append(v_ids, v_id);
    END LOOP;
    v_i := v_i + 1;
    IF v_n > 200 THEN RAISE EXCEPTION 'demasiadas filas en un lote (máx. 200)'; END IF;
  END LOOP;
  IF v_n = 0 THEN RAISE EXCEPTION 'no quedan fechas en lo que queda del mes'; END IF;
  RETURN jsonb_build_object('ok',true,'idempotente',false,'ids',to_jsonb(v_ids),'n',v_n,'zona',v_zona,'familia_id',v_fid);
END $function$;

-- Guarda final
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS NOT NULL AND cardinality(v)=6 AND v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'mf_o3_fix_guarda_pts_post: puntos=% esperado=%; aborto', v, esperado;
  END IF;
END $$;
