-- v6e_05 · E-FI1 fix zona/duración por día en series + E-PR1 guarda canje en RPC.
-- Comentarios en español: cada bloque indica el ítem.

-- 1) Premios: el canje falla si asignado_a apunta a otro hijo.
CREATE OR REPLACE FUNCTION public.familia_rpc_canjear_premio(p_solicitud_id bigint, p_actor_id integer)
RETURNS jsonb
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE s public.familia_solicitudes_premios%ROWTYPE; r public.familia_premios%ROWTYPE;
  k public.familia_miembros%ROWTYPE; v_costo numeric; v_sal jsonb;
BEGIN
  SELECT * INTO s FROM public.familia_solicitudes_premios WHERE id=p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'solicitud % no existe', p_solicitud_id; END IF;
  IF s.estado='aprobado' THEN RETURN jsonb_build_object('ok',true,'idempotente',true); END IF;
  IF s.estado<>'pendiente' THEN RAISE EXCEPTION 'solicitud ya resuelta: %', s.estado; END IF;
  SELECT * INTO k FROM public.familia_miembros WHERE id=s.miembro_id FOR UPDATE;
  SELECT * INTO r FROM public.familia_premios WHERE id=s.premio_id FOR UPDATE;
  IF k.id IS NULL OR public.familia_es_admin(k) OR r.id IS NULL OR coalesce(r.tipo,'hijo')='padre' THEN
    RAISE EXCEPTION 'no se puede aprobar este premio'; END IF;
  -- v6e E-PR1: premio de un hijo concreto solo lo canjea ese hijo.
  IF r.asignado_a IS NOT NULL AND r.asignado_a <> k.id THEN
    RAISE EXCEPTION 'este premio no es para este hijo' USING HINT='v6e_premio_ajeno'; END IF;
  v_costo := coalesce(r.costo,0);
  IF coalesce(k.puntos,0) < v_costo THEN RAISE EXCEPTION 'puntos insuficientes'; END IF;
  v_sal := public.familia_rpc_mesada_saldo(k.id);
  IF (v_sal->>'disponible')::numeric < v_costo THEN
    RAISE EXCEPTION 'puntos insuficientes: % disponibles para premios; % de mesada se liberan el %',
      v_sal->>'disponible', v_sal->>'bloqueada', coalesce(to_char((v_sal->>'proxima_liberacion')::date,'DD/MM'),'-'); END IF;
  IF r.activo IS FALSE OR r.stock=0 THEN RAISE EXCEPTION 'premio no disponible'; END IF;
  UPDATE public.familia_solicitudes_premios SET estado='aprobado' WHERE id=p_solicitud_id;
  UPDATE public.familia_miembros SET puntos=coalesce(puntos,0)-v_costo WHERE id=k.id;
  IF r.stock > 0 THEN UPDATE public.familia_premios SET stock=stock-1 WHERE id=r.id; END IF;
  INSERT INTO public.familia_historial(miembro_id,texto,tipo,pts,premio_id,actor_id,version_regla)
  VALUES (k.id,format('Canjeó: %s (-%s pts)',r.nombre,v_costo),'canje',-v_costo,r.id,p_actor_id,1);
  INSERT INTO public.familia_notificaciones(para_id,tipo,solicitud_id,texto)
  VALUES (k.id,'premio',p_solicitud_id,format('Aprobaron tu premio: %s (-%s pts)',r.nombre,v_costo));
  RETURN jsonb_build_object('ok',true,'pts',-v_costo,'saldo',coalesce(k.puntos,0)-v_costo);
END $function$;

CREATE OR REPLACE FUNCTION public.familia_v6d_base_canjear_premio_por_hijo(p_premio_id integer, p_miembro_id integer, p_actor_id integer, p_client_req_id text)
RETURNS jsonb
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE r public.familia_premios%ROWTYPE; u public.familia_miembros%ROWTYPE; k public.familia_miembros%ROWTYPE;
  h public.familia_historial%ROWTYPE; v_costo numeric; v_hid bigint; v_sal jsonb;
BEGIN
  IF coalesce(trim(p_client_req_id),'')='' THEN RAISE EXCEPTION 'client_req_id obligatorio'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('familia_v6c_canje:'||p_miembro_id));
  SELECT * INTO h FROM public.familia_historial WHERE client_req_id=p_client_req_id;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'idempotente',true,'pts',h.pts,'premio_id',h.premio_id); END IF;
  SELECT * INTO u FROM public.familia_miembros WHERE id=p_actor_id;
  SELECT * INTO k FROM public.familia_miembros WHERE id=p_miembro_id FOR UPDATE;
  SELECT * INTO r FROM public.familia_premios WHERE id=p_premio_id FOR UPDATE;
  IF u.id IS NULL OR NOT public.familia_es_admin(u) THEN RAISE EXCEPTION 'solo un padre puede canjear por el hijo'; END IF;
  IF k.id IS NULL OR public.familia_es_admin(k) THEN RAISE EXCEPTION 'miembro inválido'; END IF;
  IF r.id IS NULL OR coalesce(r.tipo,'hijo')<>'hijo' OR r.activo IS FALSE THEN RAISE EXCEPTION 'premio no disponible'; END IF;
  -- v6e E-PR1 guarda en RPC.
  IF r.asignado_a IS NOT NULL AND r.asignado_a <> k.id THEN
    RAISE EXCEPTION 'este premio no es para este hijo' USING HINT='v6e_premio_ajeno'; END IF;
  IF r.stock=0 THEN RAISE EXCEPTION 'sin stock'; END IF;
  v_costo := coalesce(r.costo,0);
  v_sal := public.familia_rpc_mesada_saldo(k.id);
  IF (v_sal->>'disponible')::numeric < v_costo THEN
    RAISE EXCEPTION 'puntos insuficientes: % disponibles para premios; % de mesada se liberan el %',
      v_sal->>'disponible', v_sal->>'bloqueada', coalesce(to_char((v_sal->>'proxima_liberacion')::date,'DD/MM'),'-'); END IF;
  INSERT INTO public.familia_historial(miembro_id,texto,tipo,pts,premio_id,actor_id,version_regla,client_req_id)
  VALUES (k.id,format('Canjeó: %s (-%s pts) · por %s',r.nombre,v_costo,coalesce(u.nombre,'padre')),'canje',-v_costo,r.id,p_actor_id,1,p_client_req_id)
  ON CONFLICT (client_req_id) WHERE client_req_id IS NOT NULL DO NOTHING RETURNING id INTO v_hid;
  IF v_hid IS NULL THEN RETURN jsonb_build_object('ok',true,'idempotente',true,'pts',-v_costo,'premio_id',r.id); END IF;
  UPDATE public.familia_miembros SET puntos=coalesce(puntos,0)-v_costo WHERE id=k.id;
  IF r.stock > 0 THEN UPDATE public.familia_premios SET stock=stock-1 WHERE id=r.id; END IF;
  INSERT INTO public.familia_solicitudes_premios(premio_id,miembro_id,estado) VALUES (r.id,k.id,'aprobado');
  RETURN jsonb_build_object('ok',true,'pts',-v_costo,'premio_id',r.id,'saldo',coalesce(k.puntos,0)-v_costo);
END $function$;

-- 2) E-FI1: fechas de serie con zona correcta + duración por día en JSON horas.
-- Formato horas: "HH:MM" (legado) o {"hora":"HH:MM","dur_min":60}.
CREATE OR REPLACE FUNCTION public.familia_v6e_hora_dia(p_horas jsonb, p_dow int, p_fallback text DEFAULT '07:00')
RETURNS time LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce(
    CASE WHEN jsonb_typeof(p_horas->p_dow::text)='object' THEN (p_horas->p_dow::text->>'hora')::time END,
    CASE WHEN jsonb_typeof(p_horas->p_dow::text)='string' THEN (p_horas->>p_dow::text)::time END,
    p_fallback::time
  );
$$;

CREATE OR REPLACE FUNCTION public.familia_v6e_dur_dia(p_horas jsonb, p_dow int, p_fallback int DEFAULT 60)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT GREATEST(1, LEAST(72*60, coalesce(
    CASE WHEN jsonb_typeof(p_horas->p_dow::text)='object' THEN (p_horas->p_dow::text->>'dur_min')::int END,
    p_fallback, 60)));
$$;

CREATE OR REPLACE FUNCTION public.familia_v6c_serie_fechas(s familia_series, p_desde timestamptz, p_hasta date)
RETURNS TABLE(dia date, inicio timestamptz)
LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp' AS $function$
  -- v6e E-FI1: hora local de la serie → timestamptz con timezone(zona, ts) (evita desfase 1 h).
  WITH d AS (
    SELECT g::date AS dia,
           public.familia_v6e_hora_dia(s.horas, extract(isodow FROM g)::int, '07:00') AS hora
      FROM generate_series((p_desde AT TIME ZONE coalesce(s.zona,'Europe/Madrid'))::date, p_hasta, interval '1 day') g
     WHERE CASE WHEN s.mensual_dia IS NOT NULL
                THEN extract(day FROM g) = least(s.mensual_dia::int,
                       extract(day FROM (date_trunc('month', g) + interval '1 month - 1 day'))::int)
                ELSE substr(s.dias_semana, extract(isodow FROM g)::int, 1) = '1'
                     AND (s.horas ? extract(isodow FROM g)::int::text OR s.horas IS NULL OR s.horas = '{}'::jsonb
                          OR NOT EXISTS (SELECT 1 FROM jsonb_object_keys(s.horas) k LIMIT 1)) END
  )
  SELECT d.dia,
         timezone(coalesce(s.zona,'Europe/Madrid'), (d.dia::text || ' ' || d.hora::text)::timestamp)
    FROM d
   WHERE d.hora IS NOT NULL
     AND timezone(coalesce(s.zona,'Europe/Madrid'), (d.dia::text || ' ' || d.hora::text)::timestamp) >= p_desde;
$function$;

-- Generación: usa duración por día (o ventana_min de la serie).
CREATE OR REPLACE FUNCTION public.familia_v6c_serie_generar(p_serie uuid, p_desde timestamptz)
RETURNS integer
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE s public.familia_series%ROWTYPE; f record; h integer; i int := 0; n int := 0; v_hasta date; v_id bigint; v_dur int; v_dow int;
BEGIN
  SELECT * INTO s FROM public.familia_series WHERE id=p_serie FOR UPDATE;
  IF NOT FOUND OR NOT s.activa THEN RETURN 0; END IF;
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
          exige_foto,serie_id,dias_semana,lote,duracion_min,aprobada_para_hacer,cierre_auto)
        VALUES (s.titulo, CASE WHEN s.clase='deber' THEN 0 ELSE s.puntos END, 'serie', s.icono, h,
          CASE WHEN s.clase='deber' THEN 'deber' ELSE 'tarea' END, false, 'pendiente', s.creada_por,
          false, f.inicio, f.inicio + make_interval(mins=>v_dur), ceil(v_dur/60.0),
          s.clase, s.pierde_pts, v_dur, s.descripcion, s.plantilla_id, s.exige_foto, s.id, s.dias_semana, 'serie-'||s.id,
          v_dur, true, coalesce(s.cierre_auto,false))
        ON CONFLICT DO NOTHING RETURNING id INTO v_id;
        IF v_id IS NOT NULL THEN n := n + 1; END IF; v_id := NULL;
      EXCEPTION WHEN raise_exception THEN NULL;
      END;
    END LOOP;
    i := i + 1;
  END LOOP;
  UPDATE public.familia_series SET generada_hasta=greatest(coalesce(generada_hasta,v_hasta),v_hasta), actualizado_en=now() WHERE id=s.id;
  RETURN n;
END $function$;

-- serie_crear: acepta horas con dur_min; normaliza a objeto {hora,dur_min}.
CREATE OR REPLACE FUNCTION public.familia_v6d_base_serie_crear(
  p_actor_id integer, p_client_req_id text, p_titulo text, p_hijos integer[], p_dias text,
  p_hora_general time, p_horas jsonb DEFAULT NULL, p_modo text DEFAULT 'cada_uno',
  p_clase text DEFAULT 'deber', p_puntos integer DEFAULT 0, p_ventana_min integer DEFAULT 60,
  p_penal integer DEFAULT 0, p_icono text DEFAULT '📋', p_descripcion text DEFAULT NULL,
  p_plantilla_id integer DEFAULT NULL, p_exige_foto boolean DEFAULT false,
  p_mensual_dia smallint DEFAULT NULL, p_renovar boolean DEFAULT true, p_zona text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_id uuid; v_h jsonb := '{}'; d int; n int; v_hora text; v_dur int; v_zona text;
BEGIN
  IF coalesce(trim(p_client_req_id),'')='' THEN RAISE EXCEPTION 'client_req_id obligatorio'; END IF;
  SELECT id INTO v_id FROM public.familia_series WHERE client_req_id=p_client_req_id;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'idempotente',true,'serie_id',v_id); END IF;
  IF NOT coalesce(public.familia_es_admin((SELECT m FROM public.familia_miembros m WHERE m.id=p_actor_id)),false) THEN
    RAISE EXCEPTION 'solo un padre crea series'; END IF;
  IF coalesce(p_dias,'0000000') !~ '^[01]{7}$' OR (p_dias='0000000' AND p_mensual_dia IS NULL) THEN
    RAISE EXCEPTION 'marca al menos un día' USING HINT='c11_sin_dias'; END IF;
  IF coalesce(cardinality(p_hijos),0)=0 THEN RAISE EXCEPTION 'elige al menos un hijo'; END IF;
  IF coalesce(p_ventana_min,60) < 1 OR coalesce(p_ventana_min,60) > 72*60 THEN
    RAISE EXCEPTION 'duración fuera de rango (1 min–72 h)' USING HINT='v6e_duracion'; END IF;
  v_zona := public.familia_v4_zona(p_actor_id, coalesce(nullif(p_zona,''),'Europe/Madrid'));
  FOR d IN 1..7 LOOP
    -- Acepta string "HH:MM", objeto {hora,dur_min} o usa hora general + ventana.
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
    plantilla_id,exige_foto,dias_semana,horas,mensual_dia,zona,renovar,client_req_id)
  VALUES (p_actor_id,trim(p_titulo),p_clase,coalesce(p_puntos,0),coalesce(p_ventana_min,60),coalesce(p_penal,0),p_hijos,p_modo,
    p_icono,p_descripcion,p_plantilla_id,coalesce(p_exige_foto,false),p_dias,v_h,p_mensual_dia,
    v_zona,coalesce(p_renovar,true),p_client_req_id)
  ON CONFLICT (client_req_id) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM public.familia_series WHERE client_req_id=p_client_req_id;
    RETURN jsonb_build_object('ok',true,'idempotente',true,'serie_id',v_id); END IF;
  n := public.familia_v6c_serie_generar(v_id, now());
  RETURN jsonb_build_object('ok',true,'serie_id',v_id,'creadas',n,'horas',v_h,'zona',v_zona);
END $function$;

-- 3) Previa y cambiar: aceptan horas con {hora,dur_min} (legado string OK).
CREATE OR REPLACE FUNCTION public.familia_rpc_serie_previa(
  p_actor_id integer, p_dias text, p_hora_general time without time zone,
  p_horas jsonb DEFAULT NULL, p_mensual_dia smallint DEFAULT NULL,
  p_zona text DEFAULT NULL, p_desde timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE s public.familia_series; v_h jsonb := '{}'; d int; v_hora text; v_dur int;
BEGIN
  FOR d IN 1..7 LOOP
    IF p_horas IS NOT NULL AND p_horas ? d::text AND jsonb_typeof(p_horas->d::text)='object' THEN
      v_hora := coalesce(p_horas->d::text->>'hora', to_char(p_hora_general,'HH24:MI'));
      v_dur := GREATEST(1, LEAST(72*60, coalesce((p_horas->d::text->>'dur_min')::int, 60)));
    ELSE
      v_hora := to_char(coalesce(
        CASE WHEN p_horas IS NOT NULL AND jsonb_typeof(p_horas->d::text)='string' THEN (p_horas->>d::text)::time END,
        p_hora_general),'HH24:MI');
      v_dur := 60;
    END IF;
    v_h := v_h || jsonb_build_object(d::text, jsonb_build_object('hora', v_hora, 'dur_min', v_dur));
  END LOOP;
  s.dias_semana := p_dias; s.horas := v_h; s.mensual_dia := p_mensual_dia;
  s.zona := public.familia_v4_zona(p_actor_id, p_zona);
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('dia',dia,'inicio',inicio) ORDER BY inicio),'[]')
            FROM public.familia_v6c_serie_fechas(s, p_desde,
              (date_trunc('month', p_desde AT TIME ZONE s.zona) + interval '1 month - 1 day')::date));
END $function$;

CREATE OR REPLACE FUNCTION public.familia_v6d_base_serie_cambiar(
  p_actor_id integer, p_serie uuid, p_dias text DEFAULT NULL, p_horas jsonb DEFAULT NULL,
  p_titulo text DEFAULT NULL, p_ventana_min integer DEFAULT NULL, p_penal integer DEFAULT NULL,
  p_descripcion text DEFAULT NULL, p_exige_foto boolean DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE na int; nc int; v_h jsonb; d int; v_hora text; v_dur int; s_win int;
BEGIN
  IF NOT coalesce(public.familia_es_admin((SELECT m FROM public.familia_miembros m WHERE m.id=p_actor_id)),false) THEN
    RAISE EXCEPTION 'solo un padre cambia series'; END IF;
  IF p_dias IS NOT NULL AND (p_dias !~ '^[01]{7}$' OR p_dias='0000000') THEN RAISE EXCEPTION 'marca al menos un día'; END IF;
  SELECT ventana_min INTO s_win FROM public.familia_series WHERE id=p_serie;
  IF p_horas IS NOT NULL THEN
    v_h := '{}';
    FOR d IN 1..7 LOOP
      IF p_horas ? d::text AND jsonb_typeof(p_horas->d::text)='object' THEN
        v_hora := coalesce(p_horas->d::text->>'hora','07:00');
        v_dur := GREATEST(1, LEAST(72*60, coalesce((p_horas->d::text->>'dur_min')::int, p_ventana_min, s_win, 60)));
      ELSIF p_horas ? d::text THEN
        v_hora := coalesce(p_horas->>d::text,'07:00');
        v_dur := coalesce(p_ventana_min, s_win, 60);
      ELSE
        CONTINUE;
      END IF;
      v_h := v_h || jsonb_build_object(d::text, jsonb_build_object('hora', v_hora, 'dur_min', v_dur));
    END LOOP;
  END IF;
  UPDATE public.familia_series SET dias_semana=coalesce(p_dias,dias_semana),
    horas=CASE WHEN v_h IS NULL THEN horas ELSE horas||v_h END,
    titulo=coalesce(nullif(trim(p_titulo),''),titulo), ventana_min=coalesce(p_ventana_min,ventana_min),
    pierde_pts=coalesce(p_penal,pierde_pts), descripcion=coalesce(p_descripcion,descripcion),
    exige_foto=coalesce(p_exige_foto,exige_foto), actualizado_en=now()
   WHERE id=p_serie AND activa;
  IF NOT FOUND THEN RAISE EXCEPTION 'serie no existe o está borrada'; END IF;
  UPDATE public.familia_tareas SET archivada_en=now()
   WHERE serie_id=p_serie AND archivada_en IS NULL AND estado IN ('pendiente','borrador') AND habilita_en > now() AND marcada_en IS NULL;
  GET DIAGNOSTICS na = ROW_COUNT;
  nc := public.familia_v6c_serie_generar(p_serie, now());
  RETURN jsonb_build_object('ok',true,'archivadas',na,'creadas',nc);
END $function$;
