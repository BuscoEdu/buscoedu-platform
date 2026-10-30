-- v6e_07 · E-AG1 Agenda A0: tablas + RLS/RPC expandir/guardar/archivar/excepcion + cruce BD
-- (también cableado en familia_rpc_crear_tarea). Comentarios en español por bloque.
-- Decisiones Jhon t799u: recordatorios solo hijo; padre no crea (sí edita/borra);
-- archivar = corta futuras, conserva pasado.

-- ========== 1) Tablas ==========
CREATE TABLE IF NOT EXISTS public.familia_agenda_actividades (
  id bigserial PRIMARY KEY,
  miembro_id integer NOT NULL REFERENCES public.familia_miembros(id),
  titulo text NOT NULL CHECK (char_length(trim(titulo)) BETWEEN 1 AND 40),
  descripcion text CHECK (descripcion IS NULL OR char_length(descripcion) <= 300),
  categoria text NOT NULL CHECK (categoria IN ('escolar','deportivo','academico','ludico','otros')),
  hora_inicio time NOT NULL,
  duracion_min integer NOT NULL CHECK (duracion_min BETWEEN 15 AND 72*60),
  recurrencia text NOT NULL CHECK (recurrencia IN ('once','daily','weekly','monthly')),
  dias_semana char(7) NOT NULL DEFAULT '0000000' CHECK (dias_semana ~ '^[01]{7}$'),
  mensual_dia smallint CHECK (mensual_dia IS NULL OR mensual_dia BETWEEN 1 AND 30),
  desde_fecha date NOT NULL,
  hasta_fecha date,
  zona text NOT NULL DEFAULT 'Europe/Madrid',
  recordar_min_antes integer NOT NULL DEFAULT 30
    CHECK (recordar_min_antes IN (0,5,10,15,30,60,120,1440)),
  creada_por integer NOT NULL REFERENCES public.familia_miembros(id),
  actualizada_por integer REFERENCES public.familia_miembros(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  archivada_en timestamptz,
  client_req_id text UNIQUE
);

CREATE INDEX IF NOT EXISTS familia_agenda_act_miembro_activo
  ON public.familia_agenda_actividades (miembro_id)
  WHERE archivada_en IS NULL;

CREATE INDEX IF NOT EXISTS familia_agenda_act_rango
  ON public.familia_agenda_actividades (miembro_id, desde_fecha, hasta_fecha)
  WHERE archivada_en IS NULL;

CREATE TABLE IF NOT EXISTS public.familia_agenda_excepciones (
  id bigserial PRIMARY KEY,
  actividad_id bigint NOT NULL REFERENCES public.familia_agenda_actividades(id) ON DELETE CASCADE,
  dia_original date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('omitir','mover')),
  nuevo_inicio timestamptz,
  nueva_duracion_min integer CHECK (nueva_duracion_min IS NULL OR nueva_duracion_min BETWEEN 15 AND 72*60),
  creado_por integer NOT NULL REFERENCES public.familia_miembros(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actividad_id, dia_original)
);

CREATE INDEX IF NOT EXISTS familia_agenda_exc_act
  ON public.familia_agenda_excepciones (actividad_id);

-- Deep-link opcional en notifs (A2)
ALTER TABLE public.familia_notificaciones
  ADD COLUMN IF NOT EXISTS actividad_id bigint;

-- RLS refuerzo (escrituras reales van por RPC DEFINER)
ALTER TABLE public.familia_agenda_actividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.familia_agenda_excepciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS familia_agenda_act_select ON public.familia_agenda_actividades;
DROP POLICY IF EXISTS familia_agenda_act_write ON public.familia_agenda_actividades;
DROP POLICY IF EXISTS familia_agenda_exc_all ON public.familia_agenda_excepciones;
-- Sin policies abiertas a anon: solo service/DEFINER. Lectura FE vía RPC.

REVOKE ALL ON public.familia_agenda_actividades FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.familia_agenda_excepciones FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.familia_agenda_actividades TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.familia_agenda_excepciones TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.familia_agenda_actividades_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.familia_agenda_excepciones_id_seq TO service_role;

-- ========== 2) Helpers de autorización / color ==========
CREATE OR REPLACE FUNCTION public.familia_agenda_puede_ver(p_actor_id integer, p_miembro_id integer)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.familia_miembros%ROWTYPE; m public.familia_miembros%ROWTYPE; v_rol text;
BEGIN
  SELECT * INTO a FROM public.familia_miembros WHERE id = p_actor_id;
  SELECT * INTO m FROM public.familia_miembros WHERE id = p_miembro_id;
  IF a.id IS NULL OR m.id IS NULL THEN RETURN false; END IF;
  v_rol := coalesce(a.rol_v6d, CASE WHEN a.es_admin THEN 'padre_admin' ELSE CASE WHEN public.familia_es_admin(a) THEN 'padre' ELSE 'hijo' END END);
  IF v_rol IN ('padre_admin','padre') THEN RETURN true; END IF; -- padres/admin ven hijos
  RETURN a.id = m.id; -- hijo solo la suya
END $$;

CREATE OR REPLACE FUNCTION public.familia_agenda_color(p_cat text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_cat
    WHEN 'escolar' THEN '#2563eb'
    WHEN 'deportivo' THEN '#16a34a'
    WHEN 'academico' THEN '#7c3aed'
    WHEN 'ludico' THEN '#ea580c'
    ELSE '#64748b' END;
$$;

-- ========== 3) Cruce BD (tareas + agenda) ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_agenda_cruce(
  p_miembro_id integer,
  p_inicio timestamptz,
  p_fin timestamptz,
  p_excluir_tarea_id bigint DEFAULT NULL,
  p_excluir_actividad_id bigint DEFAULT NULL,
  p_excluir_dia date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; v_ini timestamptz; v_fin timestamptz; v_d date; v_zona text := 'Europe/Madrid';
  v_exc record; v_from date; v_to date; a public.familia_agenda_actividades%ROWTYPE;
BEGIN
  IF p_miembro_id IS NULL OR p_inicio IS NULL OR p_fin IS NULL OR p_fin <= p_inicio THEN
    RETURN NULL;
  END IF;

  -- Tareas del mismo hijo que solapan
  SELECT t.id, t.titulo, t.habilita_en, t.fecha_limite
    INTO r
    FROM public.familia_tareas t
   WHERE t.asignada_a = p_miembro_id
     AND t.archivada_en IS NULL
     AND t.estado NOT IN ('completada','no_terminada')
     AND t.habilita_en IS NOT NULL AND t.fecha_limite IS NOT NULL
     AND t.habilita_en < p_fin AND t.fecha_limite > p_inicio
     AND (p_excluir_tarea_id IS NULL OR t.id <> p_excluir_tarea_id)
   ORDER BY t.habilita_en
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'origen','tarea','id',r.id,'titulo',r.titulo,
      'inicio',r.habilita_en,'fin',r.fecha_limite);
  END IF;

  -- Compromisos: expandir reglas activas en el rango del cruce (±1 día margen)
  v_from := (timezone(v_zona, p_inicio))::date - 1;
  v_to   := (timezone(v_zona, p_fin))::date + 1;
  FOR a IN
    SELECT * FROM public.familia_agenda_actividades x
     WHERE x.miembro_id = p_miembro_id
       AND x.archivada_en IS NULL
       AND (p_excluir_actividad_id IS NULL OR x.id <> p_excluir_actividad_id)
       AND x.desde_fecha <= v_to
       AND (x.hasta_fecha IS NULL OR x.hasta_fecha >= v_from)
  LOOP
    v_d := GREATEST(a.desde_fecha, v_from);
    WHILE v_d <= LEAST(coalesce(a.hasta_fecha, v_to), v_to) LOOP
      IF (a.recurrencia = 'once' AND v_d = a.desde_fecha)
         OR (a.recurrencia = 'daily')
         OR (a.recurrencia = 'weekly' AND substring(a.dias_semana from ((EXTRACT(ISODOW FROM v_d)::int))) = '1')
         OR (a.recurrencia = 'monthly' AND EXTRACT(DAY FROM v_d)::int = coalesce(a.mensual_dia, EXTRACT(DAY FROM a.desde_fecha)::int)
             AND EXTRACT(DAY FROM v_d)::int <= 30)
      THEN
        SELECT * INTO v_exc FROM public.familia_agenda_excepciones e
         WHERE e.actividad_id = a.id AND e.dia_original = v_d;
        IF FOUND AND v_exc.tipo = 'omitir' THEN
          NULL; -- skip
        ELSIF FOUND AND v_exc.tipo = 'mover' AND v_exc.nuevo_inicio IS NOT NULL THEN
          v_ini := v_exc.nuevo_inicio;
          v_fin := v_ini + make_interval(mins => coalesce(v_exc.nueva_duracion_min, a.duracion_min));
        ELSE
          v_ini := timezone(a.zona, (v_d::text || ' ' || a.hora_inicio::text)::timestamp);
          v_fin := v_ini + make_interval(mins => a.duracion_min);
        END IF;
        IF v_ini < p_fin AND v_fin > p_inicio THEN
          IF p_excluir_actividad_id IS NOT NULL AND a.id = p_excluir_actividad_id
             AND (p_excluir_dia IS NULL OR v_d = p_excluir_dia) THEN
            NULL;
          ELSE
            RETURN jsonb_build_object(
              'origen','agenda','id',a.id,'titulo',a.titulo,
              'inicio',v_ini,'fin',v_fin,'categoria',a.categoria);
          END IF;
        END IF;
      END IF;
      v_d := v_d + 1;
    END LOOP;
  END LOOP;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.familia_rpc_agenda_cruce(integer,timestamptz,timestamptz,bigint,bigint,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_agenda_cruce(integer,timestamptz,timestamptz,bigint,bigint,date) TO anon, authenticated, service_role;

-- ========== 4) Expandir agenda (compromisos + tareas) ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_expandir_agenda(
  p_actor_id integer,
  p_miembro_id integer,
  p_desde timestamptz,
  p_hasta timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  outj jsonb := '[]'::jsonb;
  a public.familia_agenda_actividades%ROWTYPE;
  v_d date; v_from date; v_to date; v_ini timestamptz; v_fin timestamptz;
  v_exc record; n int := 0; r record;
  v_editable boolean;
  v_rol text;
BEGIN
  IF p_desde IS NULL OR p_hasta IS NULL OR p_hasta <= p_desde THEN
    RAISE EXCEPTION 'rango inválido';
  END IF;
  IF (p_hasta::date - p_desde::date) > 62 THEN
    RAISE EXCEPTION 'rango máximo 62 días';
  END IF;
  IF NOT public.familia_agenda_puede_ver(p_actor_id, p_miembro_id) THEN
    RAISE EXCEPTION 'sin permiso para ver esta agenda' USING HINT='v6e_agenda_perm';
  END IF;
  SELECT coalesce(rol_v6d, CASE WHEN es_admin THEN 'padre_admin' ELSE 'hijo' END)
    INTO v_rol FROM public.familia_miembros WHERE id = p_actor_id;
  -- editable: dueño hijo o padre/admin
  v_editable := (p_actor_id = p_miembro_id) OR (v_rol IN ('padre_admin','padre'));

  v_from := (timezone('Europe/Madrid', p_desde))::date;
  v_to   := (timezone('Europe/Madrid', p_hasta))::date;

  FOR a IN
    SELECT * FROM public.familia_agenda_actividades x
     WHERE x.miembro_id = p_miembro_id
       AND x.archivada_en IS NULL
       AND x.desde_fecha <= v_to
       AND (x.hasta_fecha IS NULL OR x.hasta_fecha >= v_from)
     ORDER BY x.id
  LOOP
    v_d := GREATEST(a.desde_fecha, v_from);
    WHILE v_d <= LEAST(coalesce(a.hasta_fecha, v_to), v_to) LOOP
      IF (a.recurrencia = 'once' AND v_d = a.desde_fecha)
         OR (a.recurrencia = 'daily')
         OR (a.recurrencia = 'weekly' AND substring(a.dias_semana from ((EXTRACT(ISODOW FROM v_d)::int))) = '1')
         OR (a.recurrencia = 'monthly' AND EXTRACT(DAY FROM v_d)::int = coalesce(a.mensual_dia, EXTRACT(DAY FROM a.desde_fecha)::int))
      THEN
        SELECT * INTO v_exc FROM public.familia_agenda_excepciones e
         WHERE e.actividad_id = a.id AND e.dia_original = v_d;
        IF FOUND AND v_exc.tipo = 'omitir' THEN
          NULL;
        ELSIF FOUND AND v_exc.tipo = 'mover' AND v_exc.nuevo_inicio IS NOT NULL THEN
          v_ini := v_exc.nuevo_inicio;
          v_fin := v_ini + make_interval(mins => coalesce(v_exc.nueva_duracion_min, a.duracion_min));
        ELSE
          v_ini := timezone(a.zona, (v_d::text || ' ' || a.hora_inicio::text)::timestamp);
          v_fin := v_ini + make_interval(mins => a.duracion_min);
        END IF;
        IF v_ini < p_hasta AND v_fin > p_desde THEN
          outj := outj || jsonb_build_array(jsonb_build_object(
            'origen','agenda','id','a'||a.id||':'||v_d::text,
            'titulo',a.titulo,'categoria',a.categoria,
            'color', public.familia_agenda_color(a.categoria),
            'inicio',v_ini,'fin',v_fin,
            'actividad_id',a.id,'dia',v_d,
            'descripcion',a.descripcion,
            'recurrencia',a.recurrencia,
            'recordar_min_antes',a.recordar_min_antes,
            'editable', v_editable
          ));
          n := n + 1;
          IF n >= 500 THEN RETURN outj; END IF;
        END IF;
      END IF;
      v_d := v_d + 1;
    END LOOP;
  END LOOP;

  -- Tareas / deberes del hijo en el rango (solo lectura desde agenda)
  FOR r IN
    SELECT t.id, t.titulo, t.habilita_en, t.fecha_limite, t.clase, t.tipo, t.estado
      FROM public.familia_tareas t
     WHERE t.asignada_a = p_miembro_id
       AND t.archivada_en IS NULL
       AND t.habilita_en IS NOT NULL AND t.fecha_limite IS NOT NULL
       AND t.habilita_en < p_hasta AND t.fecha_limite > p_desde
     ORDER BY t.habilita_en
     LIMIT GREATEST(0, 500 - n)
  LOOP
    outj := outj || jsonb_build_array(jsonb_build_object(
      'origen','tarea','id','t'||r.id,
      'titulo',r.titulo,'categoria',NULL,
      'color','#0f766e',
      'inicio',r.habilita_en,'fin',r.fecha_limite,
      'tarea_id',r.id,'clase',coalesce(r.clase,r.tipo),'estado',r.estado,
      'editable', false
    ));
  END LOOP;

  RETURN outj;
END $$;

REVOKE ALL ON FUNCTION public.familia_rpc_expandir_agenda(integer,integer,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_expandir_agenda(integer,integer,timestamptz,timestamptz) TO anon, authenticated, service_role;

-- ========== 5) Guardar (crear/editar). Padre NO crea; sí edita. ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_agenda_guardar(
  p_actor_id integer,
  p_id bigint DEFAULT NULL,
  p_miembro_id integer DEFAULT NULL,
  p_titulo text DEFAULT NULL,
  p_descripcion text DEFAULT NULL,
  p_categoria text DEFAULT 'otros',
  p_hora_inicio time DEFAULT NULL,
  p_duracion_min integer DEFAULT 60,
  p_recurrencia text DEFAULT 'once',
  p_dias_semana text DEFAULT '0000000',
  p_mensual_dia smallint DEFAULT NULL,
  p_desde_fecha date DEFAULT NULL,
  p_hasta_fecha date DEFAULT NULL,
  p_recordar_min_antes integer DEFAULT 30,
  p_client_req_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  a public.familia_miembros%ROWTYPE;
  cur public.familia_agenda_actividades%ROWTYPE;
  v_rol text; v_id bigint; v_mid integer;
  v_cruza jsonb; v_ini timestamptz; v_fin timestamptz;
  v_cnt int;
BEGIN
  SELECT * INTO a FROM public.familia_miembros WHERE id = p_actor_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'actor inválido'; END IF;
  v_rol := coalesce(a.rol_v6d, CASE WHEN a.es_admin THEN 'padre_admin' ELSE CASE WHEN public.familia_es_admin(a) THEN 'padre' ELSE 'hijo' END END);

  IF p_id IS NOT NULL THEN
    SELECT * INTO cur FROM public.familia_agenda_actividades WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR cur.archivada_en IS NOT NULL THEN RAISE EXCEPTION 'actividad no encontrada'; END IF;
    IF NOT public.familia_agenda_puede_ver(p_actor_id, cur.miembro_id) THEN
      RAISE EXCEPTION 'sin permiso' USING HINT='v6e_agenda_perm';
    END IF;
    -- editar: dueño o padre/admin
    IF v_rol = 'hijo' AND p_actor_id <> cur.miembro_id THEN
      RAISE EXCEPTION 'no puedes editar la agenda de otro' USING HINT='v6e_agenda_perm';
    END IF;
    v_mid := cur.miembro_id;
  ELSE
    -- crear: SOLO el hijo en su propia agenda (decisión Jhon)
    IF v_rol IN ('padre_admin','padre') THEN
      RAISE EXCEPTION 'el padre no crea compromisos; el hijo los crea' USING HINT='v6e_agenda_padre_no_crea';
    END IF;
    v_mid := coalesce(p_miembro_id, p_actor_id);
    IF v_mid <> p_actor_id THEN
      RAISE EXCEPTION 'solo puedes crear en tu agenda' USING HINT='v6e_agenda_perm';
    END IF;
    SELECT count(*) INTO v_cnt FROM public.familia_agenda_actividades
     WHERE miembro_id = v_mid AND archivada_en IS NULL
       AND (hasta_fecha IS NULL OR hasta_fecha >= (timezone('Europe/Madrid', now()))::date);
    IF v_cnt >= 40 THEN RAISE EXCEPTION 'límite 40 actividades activas por hijo'; END IF;
    IF p_client_req_id IS NOT NULL THEN
      SELECT id INTO v_id FROM public.familia_agenda_actividades WHERE client_req_id = p_client_req_id;
      IF v_id IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'id',v_id,'idempotente',true); END IF;
    END IF;
  END IF;

  IF p_titulo IS NULL OR char_length(trim(p_titulo)) < 1 THEN RAISE EXCEPTION 'título obligatorio'; END IF;
  IF p_hora_inicio IS NULL OR p_desde_fecha IS NULL THEN RAISE EXCEPTION 'inicio y fecha obligatorios'; END IF;
  IF p_duracion_min < 15 OR p_duracion_min > 72*60 THEN RAISE EXCEPTION 'duración fuera de rango'; END IF;
  IF p_recurrencia NOT IN ('once','daily','weekly','monthly') THEN RAISE EXCEPTION 'recurrencia inválida'; END IF;

  -- Cruce de la primera ocurrencia (guarda BD)
  v_ini := timezone('Europe/Madrid', (p_desde_fecha::text || ' ' || p_hora_inicio::text)::timestamp);
  v_fin := v_ini + make_interval(mins => p_duracion_min);
  v_cruza := public.familia_rpc_agenda_cruce(v_mid, v_ini, v_fin, NULL, p_id, p_desde_fecha);
  IF v_cruza IS NOT NULL THEN
    RAISE EXCEPTION 'En ese horario no es posible: se cruza con % (%)',
      v_cruza->>'titulo',
      to_char(timezone('Europe/Madrid', (v_cruza->>'inicio')::timestamptz), 'HH24:MI')
      USING HINT='v6e_agenda_cruce';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.familia_agenda_actividades(
      miembro_id, titulo, descripcion, categoria, hora_inicio, duracion_min,
      recurrencia, dias_semana, mensual_dia, desde_fecha, hasta_fecha,
      recordar_min_antes, creada_por, actualizada_por, client_req_id)
    VALUES (
      v_mid, trim(p_titulo), nullif(trim(coalesce(p_descripcion,'')),''), coalesce(p_categoria,'otros'),
      p_hora_inicio, p_duracion_min, p_recurrencia,
      coalesce(nullif(p_dias_semana,''),'0000000'),
      CASE WHEN p_recurrencia='monthly' THEN coalesce(p_mensual_dia, EXTRACT(DAY FROM p_desde_fecha)::int) ELSE NULL END,
      p_desde_fecha, p_hasta_fecha, coalesce(p_recordar_min_antes,30),
      p_actor_id, p_actor_id, p_client_req_id)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.familia_agenda_actividades SET
      titulo = trim(p_titulo),
      descripcion = nullif(trim(coalesce(p_descripcion,'')),''),
      categoria = coalesce(p_categoria,'otros'),
      hora_inicio = p_hora_inicio,
      duracion_min = p_duracion_min,
      recurrencia = p_recurrencia,
      dias_semana = coalesce(nullif(p_dias_semana,''),'0000000'),
      mensual_dia = CASE WHEN p_recurrencia='monthly' THEN coalesce(p_mensual_dia, EXTRACT(DAY FROM p_desde_fecha)::int) ELSE NULL END,
      desde_fecha = p_desde_fecha,
      hasta_fecha = p_hasta_fecha,
      recordar_min_antes = coalesce(p_recordar_min_antes,30),
      actualizada_por = p_actor_id,
      actualizado_en = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

REVOKE ALL ON FUNCTION public.familia_rpc_agenda_guardar(integer,bigint,integer,text,text,text,time,integer,text,text,smallint,date,date,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_agenda_guardar(integer,bigint,integer,text,text,text,time,integer,text,text,smallint,date,date,integer,text) TO anon, authenticated, service_role;

-- ========== 6) Archivar = corta próximas; conserva pasado ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_agenda_archivar(
  p_actor_id integer,
  p_actividad_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE cur public.familia_agenda_actividades%ROWTYPE; v_rol text; v_corte date;
BEGIN
  SELECT * INTO cur FROM public.familia_agenda_actividades WHERE id = p_actividad_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'actividad no encontrada'; END IF;
  IF NOT public.familia_agenda_puede_ver(p_actor_id, cur.miembro_id) THEN
    RAISE EXCEPTION 'sin permiso' USING HINT='v6e_agenda_perm';
  END IF;
  SELECT coalesce(rol_v6d, CASE WHEN es_admin THEN 'padre_admin' ELSE 'hijo' END)
    INTO v_rol FROM public.familia_miembros WHERE id = p_actor_id;
  IF v_rol = 'hijo' AND p_actor_id <> cur.miembro_id THEN
    RAISE EXCEPTION 'sin permiso' USING HINT='v6e_agenda_perm';
  END IF;
  v_corte := (timezone('Europe/Madrid', now()))::date - 1;
  -- Corta futuras; si once ya pasó o no quedan días, marca archivada_en
  UPDATE public.familia_agenda_actividades SET
    hasta_fecha = LEAST(coalesce(hasta_fecha, v_corte), v_corte),
    actualizada_por = p_actor_id,
    actualizado_en = now(),
    archivada_en = CASE
      WHEN recurrencia = 'once' AND desde_fecha <= v_corte THEN now()
      WHEN desde_fecha > v_corte THEN now()  -- aún no empezó: archivar del todo
      ELSE archivada_en END
  WHERE id = p_actividad_id;
  RETURN jsonb_build_object('ok', true, 'hasta_fecha', v_corte);
END $$;

REVOKE ALL ON FUNCTION public.familia_rpc_agenda_archivar(integer,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_agenda_archivar(integer,bigint) TO anon, authenticated, service_role;

-- ========== 7) Excepción omitir/mover ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_agenda_excepcion(
  p_actor_id integer,
  p_actividad_id bigint,
  p_dia date,
  p_tipo text,
  p_nuevo_inicio timestamptz DEFAULT NULL,
  p_nueva_duracion_min integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE cur public.familia_agenda_actividades%ROWTYPE; v_rol text; v_cnt int; v_cruza jsonb; v_fin timestamptz;
BEGIN
  SELECT * INTO cur FROM public.familia_agenda_actividades WHERE id = p_actividad_id FOR UPDATE;
  IF NOT FOUND OR cur.archivada_en IS NOT NULL THEN RAISE EXCEPTION 'actividad no encontrada'; END IF;
  IF NOT public.familia_agenda_puede_ver(p_actor_id, cur.miembro_id) THEN
    RAISE EXCEPTION 'sin permiso' USING HINT='v6e_agenda_perm';
  END IF;
  SELECT coalesce(rol_v6d, CASE WHEN es_admin THEN 'padre_admin' ELSE 'hijo' END)
    INTO v_rol FROM public.familia_miembros WHERE id = p_actor_id;
  IF v_rol = 'hijo' AND p_actor_id <> cur.miembro_id THEN
    RAISE EXCEPTION 'sin permiso' USING HINT='v6e_agenda_perm';
  END IF;
  IF p_tipo NOT IN ('omitir','mover') THEN RAISE EXCEPTION 'tipo inválido'; END IF;
  SELECT count(*) INTO v_cnt FROM public.familia_agenda_excepciones WHERE actividad_id = p_actividad_id;
  IF v_cnt >= 200 THEN RAISE EXCEPTION 'límite 200 excepciones'; END IF;
  IF p_tipo = 'mover' THEN
    IF p_nuevo_inicio IS NULL THEN RAISE EXCEPTION 'nuevo_inicio obligatorio'; END IF;
    v_fin := p_nuevo_inicio + make_interval(mins => coalesce(p_nueva_duracion_min, cur.duracion_min));
    v_cruza := public.familia_rpc_agenda_cruce(cur.miembro_id, p_nuevo_inicio, v_fin, NULL, p_actividad_id, p_dia);
    IF v_cruza IS NOT NULL THEN
      RAISE EXCEPTION 'En ese horario no es posible: se cruza con % (%)',
        v_cruza->>'titulo',
        to_char(timezone('Europe/Madrid', (v_cruza->>'inicio')::timestamptz), 'HH24:MI')
        USING HINT='v6e_agenda_cruce';
    END IF;
  END IF;
  INSERT INTO public.familia_agenda_excepciones(actividad_id, dia_original, tipo, nuevo_inicio, nueva_duracion_min, creado_por)
  VALUES (p_actividad_id, p_dia, p_tipo,
    CASE WHEN p_tipo='mover' THEN p_nuevo_inicio ELSE NULL END,
    CASE WHEN p_tipo='mover' THEN p_nueva_duracion_min ELSE NULL END,
    p_actor_id)
  ON CONFLICT (actividad_id, dia_original) DO UPDATE SET
    tipo = EXCLUDED.tipo,
    nuevo_inicio = EXCLUDED.nuevo_inicio,
    nueva_duracion_min = EXCLUDED.nueva_duracion_min,
    creado_por = EXCLUDED.creado_por,
    creado_en = now();
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.familia_rpc_agenda_excepcion(integer,bigint,date,text,timestamptz,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_agenda_excepcion(integer,bigint,date,text,timestamptz,integer) TO anon, authenticated, service_role;

-- ========== 8) Cablear cruce en crear_tarea (tarea↔tarea y tarea↔agenda) ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_crear_tarea(p_titulo text, p_creada_por integer, p_asignada_a integer, p_client_req_id text, p_puntos integer DEFAULT 0, p_clase text DEFAULT 'tarea'::text, p_tipo text DEFAULT 'tarea'::text, p_estado text DEFAULT 'pendiente'::text, p_icono text DEFAULT NULL::text, p_recurrencia text DEFAULT 'once'::text, p_inmediata boolean DEFAULT false, p_habilita_en timestamp with time zone DEFAULT now(), p_fecha_limite timestamp with time zone DEFAULT NULL::timestamp with time zone, p_ventana_min integer DEFAULT NULL::integer, p_pierde_pts integer DEFAULT NULL::integer, p_conjunto_con integer DEFAULT NULL::integer, p_duplicada_de bigint DEFAULT NULL::bigint, p_descripcion text DEFAULT NULL::text, p_plantilla_id integer DEFAULT NULL::integer, p_exige_foto boolean DEFAULT false, p_confirmar_pasado boolean DEFAULT false)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_rol text; v_id bigint; v_pl public.familia_plantillas_tareas%ROWTYPE; v_existe boolean;
  v_fin timestamptz; v_cruza jsonb;
BEGIN
  v_existe := EXISTS (SELECT 1 FROM public.familia_tareas WHERE client_req_id=p_client_req_id);
  v_rol := public.familia_v6d_actor(p_creada_por, NULL);
  IF NOT v_existe THEN
    IF v_rol='hijo' THEN
      IF p_estado <> 'borrador' THEN RAISE EXCEPTION 'Un hijo solo puede proponer tareas (quedan por activar)' USING HINT='d6_permiso:crear_asignar'; END IF;
    ELSE
      PERFORM public.familia_v6d_actor(p_creada_por, 'crear_asignar');
      IF v_rol='padre' THEN
        SELECT * INTO v_pl FROM public.familia_plantillas_tareas WHERE id=p_plantilla_id;
        IF v_pl.id IS NULL OR coalesce(p_puntos,0) <> coalesce(v_pl.puntos,0) THEN
          RAISE EXCEPTION 'Solo el padre admin cambia los puntos: elige una plantilla' USING HINT='d6_permiso:cambiar_puntos'; END IF;
      END IF;
    END IF;
    PERFORM public.familia_v6d_validar(p_titulo, p_habilita_en,
      coalesce(p_fecha_limite, p_habilita_en + make_interval(mins=>p_ventana_min)), p_ventana_min, p_confirmar_pasado OR coalesce(p_inmediata,false));
    -- v6e E-AG1: cruce BD con otras tareas y compromisos del hijo
    IF p_asignada_a IS NOT NULL AND p_habilita_en IS NOT NULL THEN
      v_fin := coalesce(p_fecha_limite, p_habilita_en + make_interval(mins=>coalesce(p_ventana_min,60)));
      IF v_fin > p_habilita_en THEN
        v_cruza := public.familia_rpc_agenda_cruce(p_asignada_a, p_habilita_en, v_fin, NULL, NULL, NULL);
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
  IF coalesce(p_exige_foto,false) AND NOT v_existe THEN UPDATE public.familia_tareas SET exige_foto=true WHERE id=v_id; END IF;
  RETURN v_id;
END $function$;

REVOKE ALL ON FUNCTION public.familia_rpc_crear_tarea(text,integer,integer,text,integer,text,text,text,text,text,boolean,timestamptz,timestamptz,integer,integer,integer,bigint,text,integer,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_crear_tarea(text,integer,integer,text,integer,text,text,text,text,text,boolean,timestamptz,timestamptz,integer,integer,integer,bigint,text,integer,boolean,boolean) TO anon, authenticated, service_role;
