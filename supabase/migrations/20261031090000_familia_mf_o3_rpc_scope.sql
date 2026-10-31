-- MF O3+O4 · Backend: acotar RPC por familia_id + links emitir/resolver + email dueño #1
-- Fecha: 2026-10-30 (Europe/Madrid) · Quién: Backend BuscoEdu (bot)
-- Depende de: mf_o1_o2, mf_o3_db, mf_o3_links (NO crea familia_links ni índices BD).
-- Conserva firmas; SECURITY DEFINER donde el vigente/contrato lo exige; search_path fijo.
-- Todo INSERT de estas RPC escribe familia_id explícito (columna sigue nullable a propósito).
-- Email dueño: activo SOLO familia #1 beman27 (admin). Auth Supabase = pendiente (no se dispara).

-- ========== Guarda puntos m1–m6 ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS NOT NULL AND cardinality(v)=6 AND v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'mf_o3_rpc_guarda_pts: puntos=% esperado=%; aborto', v, esperado;
  END IF;
END $$;

-- ========== Respaldo defs previas (para undo) ==========
CREATE SCHEMA IF NOT EXISTS respaldos;
CREATE TABLE IF NOT EXISTS respaldos.familia_mf_o3_rpc_previo (
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
       'familia_rpc_aceptar_subasta','familia_rpc_tick_vencidas',
       'familia_rpc_agenda_tick_recordatorios','familia_rpc_crear_lote',
       'familia_rpc_crear_tarea','familia_rpc_canjear_premio',
       'familia_v6d_base_canjear_premio_por_hijo','familia_rpc_canjear_premio_por_hijo',
       'familia_rpc_serie_crear','familia_rpc_serie_cambiar','familia_rpc_serie_borrar_futuras',
       'familia_rpc_serie_previa','familia_rpc_mesada_saldo','familia_rpc_mesada_estado',
       'familia_rpc_agenda_guardar','familia_rpc_agenda_archivar','familia_rpc_agenda_excepcion',
       'familia_v6d_base_crear_lote','familia_v6d_base_crear_tarea'
     )
  LOOP
    v_args := pg_get_function_identity_arguments(r.oid);
    v_def := pg_get_functiondef(r.oid);
    INSERT INTO respaldos.familia_mf_o3_rpc_previo(proname,args,def)
    VALUES (r.proname, v_args, v_def)
    ON CONFLICT (proname,args) DO NOTHING;
  END LOOP;
END $$;
REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA respaldos TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA respaldos TO service_role;

-- ========== Email dueño (dato; sin Auth) ==========
-- Columna de contacto del admin dueño + flag de activación.
ALTER TABLE public.familia_familias
  ADD COLUMN IF NOT EXISTS admin_email text,
  ADD COLUMN IF NOT EXISTS email_dueno_activo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.familia_familias.admin_email IS
  'Email del admin dueño (1 email = 1 familia). No implica Auth hasta enlace Orq.';
COMMENT ON COLUMN public.familia_familias.email_dueno_activo IS
  'Si true, el email del dueño está habilitado en producto. Auth/confirmación = paso pendiente Orq.';

-- Solo familia #1 beman27 · rol admin (dato). Sin RAISE del email en NOTICE.
UPDATE public.familia_familias
   SET admin_email = 'jhon.bejarano@gmail.com',
       email_dueno_activo = true,
       actualizado_en = now()
 WHERE id = 1 AND lower(nickname) = 'beman27'
   AND (admin_email IS DISTINCT FROM 'jhon.bejarano@gmail.com' OR email_dueno_activo IS DISTINCT FROM true);

-- Lectura segura del email (solo si activo). Nunca envía correo ni llama Auth.
CREATE OR REPLACE FUNCTION public.familia_mf_email_dueno(p_familia_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE f public.familia_familias%ROWTYPE;
BEGIN
  IF p_familia_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'familia');
  END IF;
  SELECT * INTO f FROM public.familia_familias WHERE id = p_familia_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'familia');
  END IF;
  IF NOT coalesce(f.email_dueno_activo, false) OR coalesce(f.admin_email,'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'inactivo');
  END IF;
  -- Pendiente Orq: ligar admin_auth_user_id vía Supabase Auth + confirmación por correo.
  -- Esta función NO dispara Auth ni envía email.
  RETURN jsonb_build_object(
    'ok', true,
    'familia_id', f.id,
    'activo', true,
    'auth_pendiente', f.admin_auth_user_id IS NULL
  );
END $$;
REVOKE ALL ON FUNCTION public.familia_mf_email_dueno(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_mf_email_dueno(bigint) TO service_role;

-- ========== Helpers de sesión / familia ==========
-- Sesión: header x-familia-token (mismo patrón v6d) o GUC app.familia_session / app.familia_id (tests).
CREATE OR REPLACE FUNCTION public.familia_mf_sesion_ctx()
RETURNS TABLE(familia_id bigint, miembro_id integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tok text;
  v_fid bigint;
  v_mid integer;
  v_exp timestamptz;
  v_cerr timestamptz;
BEGIN
  -- 1) GUC de prueba / operador
  BEGIN
    v_fid := nullif(current_setting('app.familia_id', true), '')::bigint;
    v_mid := nullif(current_setting('app.miembro_id', true), '')::integer;
  EXCEPTION WHEN others THEN
    v_fid := NULL; v_mid := NULL;
  END;
  IF v_fid IS NOT NULL THEN
    familia_id := v_fid; miembro_id := v_mid; RETURN NEXT; RETURN;
  END IF;

  -- 2) Token de sesión (header PostgREST o GUC)
  BEGIN
    v_tok := nullif(current_setting('request.headers', true), '')::json->>'x-familia-token';
  EXCEPTION WHEN others THEN
    v_tok := NULL;
  END;
  IF v_tok IS NULL OR v_tok = '' THEN
    BEGIN
      v_tok := nullif(current_setting('app.familia_session', true), '');
    EXCEPTION WHEN others THEN
      v_tok := NULL;
    END;
  END IF;
  IF v_tok IS NULL OR v_tok = '' THEN
    RETURN; -- sin sesión
  END IF;

  SELECT s.familia_id, s.miembro_id INTO v_fid, v_mid
    FROM public.familia_sesiones s
   WHERE s.token::text = v_tok
   LIMIT 1;
  IF v_fid IS NULL THEN
    RETURN;
  END IF;
  -- Si existen columnas de caducidad/cierre, respetarlas (fail-closed)
  BEGIN
    EXECUTE $q$SELECT expira_en, cerrada_en FROM public.familia_sesiones WHERE token::text = $1$q$
      INTO v_exp, v_cerr USING v_tok;
    IF v_cerr IS NOT NULL THEN RETURN; END IF;
    IF v_exp IS NOT NULL AND v_exp <= now() THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL; -- esquema mínimo sin esas columnas
  END;
  familia_id := v_fid; miembro_id := v_mid; RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.familia_mf_sesion_ctx() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_mf_sesion_ctx() TO service_role;

CREATE OR REPLACE FUNCTION public.familia_mf_familia_de_miembro(p_miembro_id integer)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v bigint;
BEGIN
  IF p_miembro_id IS NULL THEN
    RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501';
  END IF;
  SELECT m.familia_id INTO v FROM public.familia_miembros m WHERE m.id = p_miembro_id;
  IF v IS NULL THEN
    RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501';
  END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.familia_mf_familia_de_miembro(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_mf_familia_de_miembro(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.familia_mf_assert_misma_familia(p_a integer, p_b integer)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE fa bigint; fb bigint;
BEGIN
  fa := public.familia_mf_familia_de_miembro(p_a);
  IF p_b IS NOT NULL THEN
    fb := public.familia_mf_familia_de_miembro(p_b);
    IF fa IS DISTINCT FROM fb THEN
      RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501';
    END IF;
  END IF;
  RETURN fa;
END $$;
REVOKE ALL ON FUNCTION public.familia_mf_assert_misma_familia(integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_mf_assert_misma_familia(integer,integer) TO service_role;

-- ========== Links opacos (tabla ya creada por mf_o3_links) ==========
-- Contrato FE: emitir → {token}; resolver → {tipo,id} o error genérico.
-- SECURITY DEFINER: RLS sin policies + REVOKE a anon.

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

  -- Reutilizar token activo del mismo recurso si existe
  SELECT l.token INTO v_tok FROM public.familia_links l
   WHERE l.familia_id = ctx.familia_id AND l.tipo = v_tipo AND l.ref_id = p_id
     AND l.revocado_en IS NULL AND (l.expira_en IS NULL OR l.expira_en > now())
   ORDER BY l.creado_en DESC LIMIT 1;
  IF v_tok IS NULL THEN
    v_tok := encode(gen_random_bytes(32), 'hex');
    INSERT INTO public.familia_links(familia_id, tipo, ref_id, token)
    VALUES (ctx.familia_id, v_tipo, p_id, v_tok);
  END IF;
  RETURN jsonb_build_object('token', v_tok);
END $$;

CREATE OR REPLACE FUNCTION public.familia_rpc_link_resolver(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ctx record;
  l public.familia_links%ROWTYPE;
  v_tok text := trim(coalesce(p_token,''));
BEGIN
  SELECT * INTO ctx FROM public.familia_mf_sesion_ctx() LIMIT 1;
  -- Mismo error genérico en todos los fallos (no filtrar existencia en otra casa)
  IF ctx.familia_id IS NULL OR char_length(v_tok) < 43 THEN
    RAISE EXCEPTION 'enlace no disponible' USING HINT='mf_o4_link', ERRCODE='42501';
  END IF;
  SELECT * INTO l FROM public.familia_links
   WHERE token = v_tok
     AND revocado_en IS NULL
     AND (expira_en IS NULL OR expira_en > now())
   LIMIT 1;
  IF NOT FOUND OR l.familia_id IS DISTINCT FROM ctx.familia_id THEN
    RAISE EXCEPTION 'enlace no disponible' USING HINT='mf_o4_link', ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('tipo', l.tipo, 'id', l.ref_id);
END $$;

REVOKE ALL ON FUNCTION public.familia_rpc_link_emitir(text,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.familia_rpc_link_resolver(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_link_emitir(text,bigint) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_rpc_link_resolver(text) TO anon, authenticated, service_role;

-- ========== Subasta: avisos solo hijos de la misma familia ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_aceptar_subasta(p_tarea_id bigint, p_actor_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  t public.familia_tareas%ROWTYPE;
  v_nombre text;
  v_fid bigint;
  v_actor_fid bigint;
BEGIN
  -- Actor válido (si existe v6d_actor)
  BEGIN
    PERFORM public.familia_v6d_actor(p_actor_id, NULL);
  EXCEPTION WHEN undefined_function THEN
    PERFORM 1 FROM public.familia_miembros WHERE id = p_actor_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Usuario no válido'; END IF;
  END;

  v_actor_fid := public.familia_mf_familia_de_miembro(p_actor_id);
  SELECT * INTO t FROM public.familia_tareas WHERE id = p_tarea_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tarea no encontrada'; END IF;
  v_fid := coalesce(t.familia_id, v_actor_fid);
  IF t.familia_id IS NOT NULL AND t.familia_id IS DISTINCT FROM v_actor_fid THEN
    RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501';
  END IF;
  IF NOT t.en_subasta OR t.archivada_en IS NOT NULL THEN RAISE EXCEPTION 'esta tarea no está en subasta'; END IF;
  IF t.asignada_a IS NOT NULL THEN
    SELECT nombre INTO v_nombre FROM public.familia_miembros WHERE id = t.asignada_a;
    RETURN jsonb_build_object('ok', false, 'tomada_por', coalesce(v_nombre,'otro'), 'hint', 'ya_tomada');
  END IF;
  IF t.subasta_vence_en IS NOT NULL AND t.subasta_vence_en < now() THEN
    RAISE EXCEPTION 'la subasta ya cerró'; END IF;

  UPDATE public.familia_tareas SET
    asignada_a = p_actor_id,
    en_subasta = false,
    aprobada_para_hacer = true,
    estado = 'pendiente',
    familia_id = coalesce(familia_id, v_fid)
  WHERE id = p_tarea_id AND asignada_a IS NULL;
  IF NOT FOUND THEN
    SELECT nombre INTO v_nombre FROM public.familia_miembros m
      JOIN public.familia_tareas x ON x.asignada_a=m.id WHERE x.id=p_tarea_id;
    RETURN jsonb_build_object('ok', false, 'tomada_por', coalesce(v_nombre,'otro'), 'hint', 'ya_tomada');
  END IF;

  SELECT nombre INTO v_nombre FROM public.familia_miembros WHERE id = p_actor_id;
  INSERT INTO public.familia_historial(miembro_id, texto, tarea_id, tipo, actor_id, pts, familia_id)
  VALUES (p_actor_id, 'Aceptó subasta: '||coalesce(t.titulo,'tarea'), t.id, 'tarea', p_actor_id, 0, v_fid);

  -- Solo hijos de la misma familia (fail-closed)
  INSERT INTO public.familia_notificaciones(para_id, tipo, tarea_id, texto, familia_id)
  SELECT m.id, 'tarea', t.id,
         'Ya la tomó '||coalesce(v_nombre,'un hermano')||': '||coalesce(t.titulo,'tarea'),
         v_fid
    FROM public.familia_miembros m
   WHERE m.familia_id = v_fid
     AND coalesce(m.rol_v6d,'hijo') = 'hijo'
     AND m.id <> p_actor_id;

  RETURN jsonb_build_object('ok', true, 'asignada_a', p_actor_id);
END $function$;
REVOKE ALL ON FUNCTION public.familia_rpc_aceptar_subasta(bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_aceptar_subasta(bigint, integer) TO anon, authenticated, service_role;

-- ========== Tick vencidas: padres/hijos por familia_id de la fila ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_agenda_tick_recordatorios()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  a public.familia_agenda_actividades%ROWTYPE;
  v_d date; v_from date; v_to date; v_ini timestamptz;
  v_exc record; n int := 0; v_texto text; v_aviso timestamptz;
  v_now timestamptz := now();
  v_fid bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('familia_agenda_tick_recordatorios'));
  v_from := (timezone('Europe/Madrid', v_now - interval '1 day'))::date;
  v_to   := (timezone('Europe/Madrid', v_now + interval '2 days'))::date;

  FOR a IN
    SELECT * FROM public.familia_agenda_actividades x
     WHERE x.archivada_en IS NULL
       AND x.recordar_min_antes > 0
       AND x.desde_fecha <= v_to
       AND (x.hasta_fecha IS NULL OR x.hasta_fecha >= v_from)
  LOOP
    v_fid := coalesce(a.familia_id, public.familia_mf_familia_de_miembro(a.miembro_id));
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
        ELSE
          v_ini := timezone(a.zona, (v_d::text || ' ' || a.hora_inicio::text)::timestamp);
        END IF;
        v_aviso := v_ini - make_interval(mins => a.recordar_min_antes);
        IF v_aviso <= v_now + interval '3 minutes' AND v_aviso > v_now - interval '8 minutes' THEN
          v_texto := 'Agenda: '||coalesce(a.titulo,'compromiso')||' a las '||to_char(timezone('Europe/Madrid', v_ini),'HH24:MI');
          IF NOT EXISTS (
            SELECT 1 FROM public.familia_notificaciones n
             WHERE n.para_id = a.miembro_id
               AND n.tipo = 'agenda'
               AND n.actividad_id = a.id
               AND n.creado_en > v_now - interval '12 hours'
               AND n.texto = v_texto
          ) THEN
            INSERT INTO public.familia_notificaciones(para_id, tipo, texto, actividad_id, familia_id)
            VALUES (a.miembro_id, 'agenda', v_texto, a.id, v_fid);
            n := n + 1;
          END IF;
        END IF;
      END IF;
      v_d := v_d + 1;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'enviados', n);
END $$;
REVOKE ALL ON FUNCTION public.familia_rpc_agenda_tick_recordatorios() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_agenda_tick_recordatorios() TO service_role;

CREATE OR REPLACE FUNCTION public.familia_rpc_tick_vencidas()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  r record; n int := 0; v_loss int;
  v_ag jsonb; v_ar jsonb;
  v_fid bigint;
  v_nombre text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('familia_v6e_tick_vencidas'));
  FOR r IN
    SELECT t.* FROM public.familia_tareas t
     WHERE t.archivada_en IS NULL
       AND t.cierre_auto = true
       AND t.en_subasta = false
       AND t.puntos_sumados IS DISTINCT FROM true
       AND t.fecha_limite IS NOT NULL AND t.fecha_limite < now()
       AND t.estado IN ('pendiente','borrador')
       AND t.comentario_completado IS NULL
       AND coalesce(t.evidencia_2,'') = ''
     FOR UPDATE SKIP LOCKED
  LOOP
    v_fid := coalesce(r.familia_id,
      CASE WHEN r.asignada_a IS NOT NULL THEN public.familia_mf_familia_de_miembro(r.asignada_a) END,
      CASE WHEN r.creada_por IS NOT NULL THEN public.familia_mf_familia_de_miembro(r.creada_por) END);
    v_loss := GREATEST(0, coalesce(r.pierde_pts, r.puntos_penalizacion_dia, 0));
    UPDATE public.familia_tareas SET
      estado = 'completada',
      estado_vencida = CASE WHEN v_loss > 0 THEN 'descontada' ELSE 'perdonada' END,
      puntos_sumados = true,
      puntos_aplicados = -v_loss,
      cerrado_en = now(),
      vencida_origen = 'cierre_auto',
      familia_id = coalesce(familia_id, v_fid)
    WHERE id = r.id;
    IF v_loss > 0 AND r.asignada_a IS NOT NULL THEN
      UPDATE public.familia_miembros SET puntos = puntos - v_loss WHERE id = r.asignada_a;
    END IF;
    INSERT INTO public.familia_historial(miembro_id, texto, tarea_id, tipo, actor_id, actor_rol, pts, familia_id)
    VALUES (r.asignada_a,
      'Cierre automático: '||coalesce(r.titulo,'tarea')||' ('||(-v_loss)||' pts)',
      r.id, CASE WHEN v_loss>0 THEN 'descuento' ELSE 'perdon' END, NULL, 'sistema', -v_loss, v_fid);
    IF r.asignada_a IS NOT NULL THEN
      INSERT INTO public.familia_notificaciones(para_id, tipo, tarea_id, texto, familia_id)
      VALUES (r.asignada_a, 'tarea', r.id,
        'Vencida (auto): '||coalesce(r.titulo,'tarea')||CASE WHEN v_loss>0 THEN ' (−'||v_loss||' pts)' ELSE '' END,
        v_fid);
    END IF;
    SELECT nombre INTO v_nombre FROM public.familia_miembros WHERE id = r.asignada_a;
    INSERT INTO public.familia_notificaciones(para_id, tipo, tarea_id, texto, familia_id)
    SELECT m.id, 'tarea', r.id,
           'Vencida (auto): '||coalesce(r.titulo,'tarea')||' de '||coalesce(v_nombre,'hijo'),
           v_fid
      FROM public.familia_miembros m
     WHERE m.familia_id = v_fid
       AND coalesce(m.rol_v6d, CASE WHEN m.es_admin THEN 'padre_admin' ELSE 'hijo' END) IN ('padre_admin','padre');
    n := n + 1;
  END LOOP;

  UPDATE public.familia_tareas t SET
    archivada_en = now(),
    estado = 'completada',
    cerrado_en = now(),
    en_subasta = false
  WHERE t.en_subasta AND t.asignada_a IS NULL AND t.archivada_en IS NULL
    AND t.subasta_vence_en IS NOT NULL AND t.subasta_vence_en < now();

  BEGIN
    v_ag := public.familia_rpc_agenda_tick_recordatorios();
  EXCEPTION WHEN OTHERS THEN
    v_ag := jsonb_build_object('ok', false, 'error', SQLERRM);
  END;
  BEGIN
    v_ar := public.familia_rpc_agenda_archivo_90d();
  EXCEPTION WHEN undefined_function THEN
    v_ar := jsonb_build_object('ok', false, 'hint', 'sin_archivo_90d');
  WHEN OTHERS THEN
    v_ar := jsonb_build_object('ok', false, 'error', SQLERRM);
  END;

  RETURN jsonb_build_object('ok', true, 'cerradas', n, 'agenda_recordatorios', v_ag, 'agenda_archivo', v_ar);
END $$;
REVOKE ALL ON FUNCTION public.familia_rpc_tick_vencidas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_tick_vencidas() TO service_role;


-- ========== crear_lote: hijos solo de la familia del actor; INSERT con familia_id ==========
-- Reemplaza la base v6d (si existe) y refuerza la envoltura pública.

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
  IF v_ids IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'idempotente',true,'ids',to_jsonb(v_ids),'n',cardinality(v_ids)); END IF;
  SELECT * INTO v_a FROM public.familia_miembros WHERE id=p_actor_id;
  IF NOT public.familia_es_admin(v_a) THEN RAISE EXCEPTION 'solo un padre crea lotes'; END IF;
  v_fid := public.familia_mf_familia_de_miembro(p_actor_id);
  IF coalesce(trim(p_titulo),'')='' THEN RAISE EXCEPTION 'título obligatorio'; END IF;
  IF p_clase NOT IN ('tarea','deber') THEN RAISE EXCEPTION 'clase inválida'; END IF;
  IF p_modo NOT IN ('uno','entre','cada_uno') THEN RAISE EXCEPTION 'modo inválido'; END IF;
  IF p_estado NOT IN ('borrador','pendiente') THEN RAISE EXCEPTION 'estado inicial inválido'; END IF;
  IF p_inicio IS NULL OR coalesce(p_ventana_min,0) <= 0 OR coalesce(p_puntos,0) < 0 OR coalesce(p_penal,0) < 0 THEN
    RAISE EXCEPTION 'valores numéricos inválidos'; END IF;
  IF coalesce(cardinality(p_hijos),0)=0 OR (p_modo='uno' AND cardinality(p_hijos)<>1) THEN RAISE EXCEPTION 'hijos inválidos para el modo'; END IF;
  -- Fail-closed: todos los hijos de p_hijos deben ser de la misma familia
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

-- Envoltura pública (firma v6d con exige_foto/confirmar_pasado) si ya existía; si no, alias a la base.
DO $$
BEGIN
  IF to_regprocedure('public.familia_rpc_crear_lote(integer,text,text,text,integer,timestamptz,text,integer,integer,integer,integer[],text,text,text,text,text,integer,boolean,boolean)') IS NOT NULL
     OR to_regprocedure('public.familia_rpc_crear_lote(integer,text,text,text,integer,timestamptz,text,integer,integer,integer,integer[],text,text,text,text,text,integer)') IS NOT NULL THEN
    -- Recrear envoltura v6d completa
    EXECUTE $w$
CREATE OR REPLACE FUNCTION public.familia_rpc_crear_lote(p_actor_id integer, p_client_req_id text, p_titulo text, p_clase text, p_puntos integer,
  p_inicio timestamptz, p_recurrencia text, p_veces integer, p_ventana_min integer, p_penal integer, p_hijos integer[], p_modo text,
  p_icono text DEFAULT '📋', p_estado text DEFAULT 'pendiente', p_zona text DEFAULT NULL, p_descripcion text DEFAULT NULL,
  p_plantilla_id integer DEFAULT NULL, p_exige_foto boolean DEFAULT false, p_confirmar_pasado boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_rol text; r jsonb; v_pl public.familia_plantillas_tareas%ROWTYPE; v_ids bigint[]; v_fid bigint;
BEGIN
  BEGIN
    v_rol := public.familia_v6d_actor(p_actor_id, 'crear_asignar');
  EXCEPTION WHEN undefined_function THEN
    v_rol := 'padre_admin';
  END;
  v_fid := public.familia_mf_familia_de_miembro(p_actor_id);
  IF EXISTS (
    SELECT 1 FROM unnest(p_hijos) x(id)
    LEFT JOIN public.familia_miembros m ON m.id=x.id
    WHERE m.id IS NULL OR m.familia_id IS DISTINCT FROM v_fid
  ) THEN
    RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501';
  END IF;
  IF v_rol='padre' THEN
    SELECT * INTO v_pl FROM public.familia_plantillas_tareas WHERE id=p_plantilla_id AND (familia_id IS NULL OR familia_id = v_fid);
    IF v_pl.id IS NULL OR coalesce(p_puntos,0) <> coalesce(v_pl.puntos,0) THEN
      RAISE EXCEPTION 'Solo el padre admin cambia los puntos: elige una plantilla' USING HINT='d6_permiso:cambiar_puntos'; END IF;
  END IF;
  BEGIN
    PERFORM public.familia_v6d_validar(p_titulo, p_inicio, p_inicio + make_interval(mins=>coalesce(p_ventana_min,0)), coalesce(p_ventana_min,0), p_confirmar_pasado);
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  r := public.familia_v6d_base_crear_lote(p_actor_id, p_client_req_id, p_titulo, p_clase, p_puntos, p_inicio, p_recurrencia, p_veces,
    p_ventana_min, p_penal, p_hijos, p_modo, p_icono, p_estado, p_zona, p_descripcion, p_plantilla_id);
  IF coalesce((r->>'idempotente')::boolean,false) THEN RETURN r; END IF;
  SELECT array_agg(x::bigint) INTO v_ids FROM jsonb_array_elements_text(r->'ids') x;
  UPDATE public.familia_tareas SET habilita_en = habilita_en + make_interval(mins=>ventana_min)
   WHERE id = ANY(v_ids) AND ventana_min > 0 AND fecha_limite - habilita_en = make_interval(mins=>2*ventana_min);
  IF coalesce(p_exige_foto,false) THEN UPDATE public.familia_tareas SET exige_foto=true WHERE id = ANY(v_ids); END IF;
  -- Refuerzo: ninguna fila del lote sin familia_id
  UPDATE public.familia_tareas SET familia_id = v_fid WHERE id = ANY(v_ids) AND familia_id IS NULL;
  RETURN r || jsonb_build_object('exige_foto', coalesce(p_exige_foto,false), 'ventana','adelante','familia_id',v_fid);
END $fn$;
$w$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.familia_rpc_crear_lote(integer,text,text,text,integer,timestamptz,text,integer,integer,integer,integer[],text,text,text,text,text,integer,boolean,boolean) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.familia_rpc_crear_lote(integer,text,text,text,integer,timestamptz,text,integer,integer,integer,integer[],text,text,text,text,text,integer,boolean,boolean) TO anon, authenticated, service_role';
  ELSE
    -- Sin envoltura previa: exponer la base con nombre público (firma corta)
    EXECUTE $w$
CREATE OR REPLACE FUNCTION public.familia_rpc_crear_lote(p_actor_id integer, p_client_req_id text, p_titulo text, p_clase text, p_puntos integer,
  p_inicio timestamptz, p_recurrencia text, p_veces integer, p_ventana_min integer, p_penal integer, p_hijos integer[], p_modo text,
  p_icono text DEFAULT '📋'::text, p_estado text DEFAULT 'borrador'::text, p_zona text DEFAULT NULL::text,
  p_descripcion text DEFAULT NULL, p_plantilla_id integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  RETURN public.familia_v6d_base_crear_lote(p_actor_id,p_client_req_id,p_titulo,p_clase,p_puntos,p_inicio,p_recurrencia,p_veces,p_ventana_min,p_penal,p_hijos,p_modo,p_icono,p_estado,p_zona,p_descripcion,p_plantilla_id);
END $fn$;
$w$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.familia_rpc_crear_lote(integer,text,text,text,integer,timestamptz,text,integer,integer,integer,integer[],text,text,text,text,text,integer) FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.familia_rpc_crear_lote(integer,text,text,text,integer,timestamptz,text,integer,integer,integer,integer[],text,text,text,text,text,integer) TO anon, authenticated, service_role';
  END IF;
END $$;

-- ========== crear_tarea: misma familia actor/asignado; INSERT con familia_id ==========
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
DECLARE v_id bigint; v_fid bigint;
BEGIN
  IF coalesce(trim(p_client_req_id),'')='' THEN RAISE EXCEPTION 'client_req_id obligatorio'; END IF;
  SELECT id INTO v_id FROM public.familia_tareas WHERE client_req_id=p_client_req_id;
  IF FOUND THEN RETURN v_id; END IF;
  IF coalesce(trim(p_titulo),'')='' THEN RAISE EXCEPTION 'título obligatorio'; END IF;
  IF p_clase NOT IN ('tarea','deber') THEN RAISE EXCEPTION 'clase inválida'; END IF;
  IF p_estado NOT IN ('pendiente','borrador') THEN RAISE EXCEPTION 'estado inicial inválido'; END IF;
  IF coalesce(p_puntos,0) < 0 OR coalesce(p_pierde_pts,0) < 0 OR coalesce(p_ventana_min,1) <= 0 THEN
    RAISE EXCEPTION 'valores numéricos inválidos'; END IF;
  v_fid := public.familia_mf_assert_misma_familia(p_creada_por, p_asignada_a);
  IF p_conjunto_con IS NOT NULL THEN
    PERFORM public.familia_mf_assert_misma_familia(p_creada_por, p_conjunto_con);
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
  IF v_id IS NULL THEN SELECT id INTO v_id FROM public.familia_tareas WHERE client_req_id=p_client_req_id; END IF;
  RETURN v_id;
END $function$;

-- ========== canjear premio: misma familia; INSERT historial/notifs con familia_id ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_canjear_premio(p_solicitud_id bigint, p_actor_id integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE s public.familia_solicitudes_premios%ROWTYPE; r public.familia_premios%ROWTYPE;
  k public.familia_miembros%ROWTYPE; v_costo numeric; v_sal jsonb; v_fid bigint;
BEGIN
  v_fid := public.familia_mf_familia_de_miembro(p_actor_id);
  SELECT * INTO s FROM public.familia_solicitudes_premios WHERE id=p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'solicitud % no existe', p_solicitud_id; END IF;
  IF coalesce(s.familia_id, v_fid) IS DISTINCT FROM v_fid THEN
    RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501'; END IF;
  IF s.estado='aprobado' THEN RETURN jsonb_build_object('ok',true,'idempotente',true); END IF;
  IF s.estado<>'pendiente' THEN RAISE EXCEPTION 'solicitud ya resuelta: %', s.estado; END IF;
  SELECT * INTO k FROM public.familia_miembros WHERE id=s.miembro_id FOR UPDATE;
  SELECT * INTO r FROM public.familia_premios WHERE id=s.premio_id FOR UPDATE;
  IF k.id IS NULL OR public.familia_es_admin(k) OR r.id IS NULL OR coalesce(r.tipo,'hijo')='padre' THEN
    RAISE EXCEPTION 'no se puede aprobar este premio'; END IF;
  IF k.familia_id IS DISTINCT FROM v_fid OR coalesce(r.familia_id, v_fid) IS DISTINCT FROM v_fid THEN
    RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501'; END IF;
  IF r.asignado_a IS NOT NULL AND r.asignado_a <> k.id THEN
    RAISE EXCEPTION 'este premio no es para este hijo' USING HINT='v6e_premio_ajeno'; END IF;
  v_costo := coalesce(r.costo,0);
  IF coalesce(k.puntos,0) < v_costo THEN RAISE EXCEPTION 'puntos insuficientes'; END IF;
  BEGIN
    v_sal := public.familia_rpc_mesada_saldo(k.id);
    IF (v_sal->>'disponible')::numeric < v_costo THEN
      RAISE EXCEPTION 'puntos insuficientes: % disponibles para premios; % de mesada se liberan el %',
        v_sal->>'disponible', v_sal->>'bloqueada', coalesce(to_char((v_sal->>'proxima_liberacion')::date,'DD/MM'),'-'); END IF;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  IF r.activo IS FALSE OR r.stock=0 THEN RAISE EXCEPTION 'premio no disponible'; END IF;
  UPDATE public.familia_solicitudes_premios SET estado='aprobado', familia_id = coalesce(familia_id, v_fid) WHERE id=p_solicitud_id;
  UPDATE public.familia_miembros SET puntos=coalesce(puntos,0)-v_costo WHERE id=k.id;
  IF r.stock > 0 THEN UPDATE public.familia_premios SET stock=stock-1 WHERE id=r.id; END IF;
  INSERT INTO public.familia_historial(miembro_id,texto,tipo,pts,premio_id,actor_id,version_regla,familia_id)
  VALUES (k.id,format('Canjeó: %s (-%s pts)',r.nombre,v_costo),'canje',-v_costo,r.id,p_actor_id,1,v_fid);
  INSERT INTO public.familia_notificaciones(para_id,tipo,solicitud_id,texto,familia_id)
  VALUES (k.id,'premio',p_solicitud_id,format('Aprobaron tu premio: %s (-%s pts)',r.nombre,v_costo),v_fid);
  RETURN jsonb_build_object('ok',true,'pts',-v_costo,'saldo',coalesce(k.puntos,0)-v_costo);
END $function$;
REVOKE ALL ON FUNCTION public.familia_rpc_canjear_premio(bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_canjear_premio(bigint,integer) TO anon, authenticated, service_role;

-- canje por hijo (base + wrapper): guarda familia
CREATE OR REPLACE FUNCTION public.familia_v6d_base_canjear_premio_por_hijo(
  p_premio_id integer, p_miembro_id integer, p_actor_id integer, p_client_req_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE r public.familia_premios%ROWTYPE; u public.familia_miembros%ROWTYPE; k public.familia_miembros%ROWTYPE;
  h public.familia_historial%ROWTYPE; v_costo numeric; v_hid bigint; v_sal jsonb; v_fid bigint;
BEGIN
  IF coalesce(trim(p_client_req_id),'')='' THEN RAISE EXCEPTION 'client_req_id obligatorio'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('familia_v6c_canje:'||p_miembro_id));
  SELECT * INTO h FROM public.familia_historial WHERE client_req_id=p_client_req_id;
  IF FOUND THEN RETURN jsonb_build_object('ok',true,'idempotente',true,'pts',h.pts,'premio_id',h.premio_id); END IF;
  v_fid := public.familia_mf_assert_misma_familia(p_actor_id, p_miembro_id);
  SELECT * INTO u FROM public.familia_miembros WHERE id=p_actor_id;
  SELECT * INTO k FROM public.familia_miembros WHERE id=p_miembro_id FOR UPDATE;
  SELECT * INTO r FROM public.familia_premios WHERE id=p_premio_id FOR UPDATE;
  IF u.id IS NULL OR NOT public.familia_es_admin(u) THEN RAISE EXCEPTION 'solo un padre puede canjear por el hijo'; END IF;
  IF k.id IS NULL OR public.familia_es_admin(k) THEN RAISE EXCEPTION 'miembro inválido'; END IF;
  IF r.id IS NULL OR coalesce(r.tipo,'hijo')<>'hijo' OR r.activo IS FALSE THEN RAISE EXCEPTION 'premio no disponible'; END IF;
  IF coalesce(r.familia_id, v_fid) IS DISTINCT FROM v_fid THEN
    RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501'; END IF;
  IF r.asignado_a IS NOT NULL AND r.asignado_a <> k.id THEN
    RAISE EXCEPTION 'este premio no es para este hijo' USING HINT='v6e_premio_ajeno'; END IF;
  IF r.stock=0 THEN RAISE EXCEPTION 'sin stock'; END IF;
  v_costo := coalesce(r.costo,0);
  BEGIN
    v_sal := public.familia_rpc_mesada_saldo(k.id);
    IF (v_sal->>'disponible')::numeric < v_costo THEN
      RAISE EXCEPTION 'puntos insuficientes: % disponibles para premios; % de mesada se liberan el %',
        v_sal->>'disponible', v_sal->>'bloqueada', coalesce(to_char((v_sal->>'proxima_liberacion')::date,'DD/MM'),'-'); END IF;
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  INSERT INTO public.familia_historial(miembro_id,texto,tipo,pts,premio_id,actor_id,version_regla,client_req_id,familia_id)
  VALUES (k.id,format('Canjeó: %s (-%s pts) · por %s',r.nombre,v_costo,coalesce(u.nombre,'padre')),'canje',-v_costo,r.id,p_actor_id,1,p_client_req_id,v_fid)
  ON CONFLICT (client_req_id) WHERE client_req_id IS NOT NULL DO NOTHING RETURNING id INTO v_hid;
  IF v_hid IS NULL THEN RETURN jsonb_build_object('ok',true,'idempotente',true,'pts',-v_costo,'premio_id',r.id); END IF;
  UPDATE public.familia_miembros SET puntos=coalesce(puntos,0)-v_costo WHERE id=k.id;
  IF r.stock > 0 THEN UPDATE public.familia_premios SET stock=stock-1 WHERE id=r.id; END IF;
  INSERT INTO public.familia_solicitudes_premios(premio_id,miembro_id,estado,familia_id) VALUES (r.id,k.id,'aprobado',v_fid);
  RETURN jsonb_build_object('ok',true,'pts',-v_costo,'premio_id',r.id,'saldo',coalesce(k.puntos,0)-v_costo);
END $function$;

CREATE OR REPLACE FUNCTION public.familia_rpc_canjear_premio_por_hijo(
  p_premio_id integer, p_miembro_id integer, p_actor_id integer, p_client_req_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  BEGIN
    PERFORM public.familia_v6d_actor(p_actor_id, 'canje_por_hijo');
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  PERFORM public.familia_mf_assert_misma_familia(p_actor_id, p_miembro_id);
  RETURN public.familia_v6d_base_canjear_premio_por_hijo(p_premio_id, p_miembro_id, p_actor_id, p_client_req_id);
END $$;
REVOKE ALL ON FUNCTION public.familia_rpc_canjear_premio_por_hijo(integer,integer,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_canjear_premio_por_hijo(integer,integer,integer,text) TO anon, authenticated, service_role;


-- ========== Series: fail-closed si serie/hijos de otra familia ==========
-- Solo refuerza envolturas públicas (bases intactas salvo familia_id en generar vía UPDATE post).

CREATE OR REPLACE FUNCTION public.familia_rpc_serie_crear(p_actor_id integer, p_client_req_id text, p_titulo text,
  p_hijos integer[], p_dias text, p_hora_general time, p_horas jsonb DEFAULT NULL, p_modo text DEFAULT 'cada_uno',
  p_clase text DEFAULT 'deber', p_puntos integer DEFAULT 0, p_ventana_min integer DEFAULT 60, p_penal integer DEFAULT 0,
  p_icono text DEFAULT '📋', p_descripcion text DEFAULT NULL, p_plantilla_id integer DEFAULT NULL,
  p_exige_foto boolean DEFAULT false, p_mensual_dia smallint DEFAULT NULL, p_renovar boolean DEFAULT true, p_zona text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r jsonb; v_fid bigint; v_serie uuid;
BEGIN
  BEGIN
    PERFORM public.familia_v6d_actor(p_actor_id, 'reglas');
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  v_fid := public.familia_mf_familia_de_miembro(p_actor_id);
  IF EXISTS (
    SELECT 1 FROM unnest(p_hijos) x(id)
    LEFT JOIN public.familia_miembros m ON m.id=x.id
    WHERE m.id IS NULL OR m.familia_id IS DISTINCT FROM v_fid
  ) THEN
    RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.familia_series WHERE client_req_id=p_client_req_id) THEN
    BEGIN
      PERFORM public.familia_v6d_validar(p_titulo, NULL, NULL, coalesce(p_ventana_min,60), true);
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
    IF p_mensual_dia IS NOT NULL THEN
      IF p_mensual_dia NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'El día del mes debe ser de 1 a 30' USING HINT='d14_dia'; END IF;
      IF coalesce(p_dias,'0000000') <> '0000000' THEN
        RAISE EXCEPTION 'Mensual no se combina con días de la semana' USING HINT='d14_mensual_dias'; END IF;
    END IF;
  END IF;
  r := public.familia_v6d_base_serie_crear(p_actor_id, p_client_req_id, p_titulo, p_hijos, coalesce(p_dias,'0000000'), p_hora_general, p_horas,
    p_modo, p_clase, p_puntos, p_ventana_min, p_penal, p_icono, p_descripcion, p_plantilla_id, p_exige_foto, p_mensual_dia, p_renovar, p_zona);
  -- Asegurar familia_id en serie y tareas generadas
  UPDATE public.familia_series SET familia_id = v_fid
   WHERE client_req_id = p_client_req_id AND familia_id IS NULL;
  SELECT id INTO v_serie FROM public.familia_series WHERE client_req_id = p_client_req_id;
  IF v_serie IS NOT NULL THEN
    UPDATE public.familia_tareas SET familia_id = v_fid WHERE serie_id = v_serie AND familia_id IS NULL;
  END IF;
  RETURN r || jsonb_build_object('familia_id', v_fid);
END $$;

CREATE OR REPLACE FUNCTION public.familia_rpc_serie_cambiar(p_actor_id integer, p_serie uuid, p_dias text DEFAULT NULL,
  p_horas jsonb DEFAULT NULL, p_titulo text DEFAULT NULL, p_ventana_min integer DEFAULT NULL, p_penal integer DEFAULT NULL,
  p_descripcion text DEFAULT NULL, p_exige_foto boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_fid bigint; s_fid bigint; r jsonb;
BEGIN
  BEGIN
    PERFORM public.familia_v6d_actor(p_actor_id, 'reglas');
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  v_fid := public.familia_mf_familia_de_miembro(p_actor_id);
  SELECT familia_id INTO s_fid FROM public.familia_series WHERE id = p_serie;
  IF s_fid IS NOT NULL AND s_fid IS DISTINCT FROM v_fid THEN
    RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501';
  END IF;
  IF p_titulo IS NOT NULL THEN
    BEGIN PERFORM public.familia_v6d_validar(p_titulo, NULL, NULL, p_ventana_min, true);
    EXCEPTION WHEN undefined_function THEN NULL; END;
  ELSIF p_ventana_min IS NOT NULL AND p_ventana_min <= 0 THEN
    RAISE EXCEPTION 'La ventana no puede ser 0' USING HINT='d16_ventana';
  END IF;
  IF p_dias IS NOT NULL AND p_dias <> '0000000' AND EXISTS (SELECT 1 FROM public.familia_series WHERE id=p_serie AND mensual_dia IS NOT NULL) THEN
    RAISE EXCEPTION 'Mensual no se combina con días de la semana' USING HINT='d14_mensual_dias';
  END IF;
  r := public.familia_v6d_base_serie_cambiar(p_actor_id, p_serie, p_dias, p_horas, p_titulo, p_ventana_min, p_penal, p_descripcion, p_exige_foto);
  UPDATE public.familia_series SET familia_id = coalesce(familia_id, v_fid) WHERE id = p_serie;
  UPDATE public.familia_tareas SET familia_id = v_fid WHERE serie_id = p_serie AND familia_id IS NULL;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.familia_rpc_serie_borrar_futuras(p_actor_id integer, p_serie uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_fid bigint; s_fid bigint;
BEGIN
  BEGIN
    PERFORM public.familia_v6d_actor(p_actor_id, 'reglas');
  EXCEPTION WHEN undefined_function THEN NULL;
  END;
  v_fid := public.familia_mf_familia_de_miembro(p_actor_id);
  SELECT familia_id INTO s_fid FROM public.familia_series WHERE id = p_serie;
  IF s_fid IS NOT NULL AND s_fid IS DISTINCT FROM v_fid THEN
    RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501';
  END IF;
  RETURN public.familia_v6d_base_serie_borrar_futuras(p_actor_id, p_serie);
END $$;

DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.familia_rpc_serie_crear(integer,text,text,integer[],text,time,jsonb,text,text,integer,integer,integer,text,text,integer,boolean,smallint,boolean,text) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.familia_rpc_serie_crear(integer,text,text,integer[],text,time,jsonb,text,text,integer,integer,integer,text,text,integer,boolean,smallint,boolean,text) TO anon, authenticated, service_role;
  REVOKE ALL ON FUNCTION public.familia_rpc_serie_cambiar(integer,uuid,text,jsonb,text,integer,integer,text,boolean) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.familia_rpc_serie_cambiar(integer,uuid,text,jsonb,text,integer,integer,text,boolean) TO anon, authenticated, service_role;
  REVOKE ALL ON FUNCTION public.familia_rpc_serie_borrar_futuras(integer,uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.familia_rpc_serie_borrar_futuras(integer,uuid) TO anon, authenticated, service_role;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ========== Mesada: saldo/estado acotados a la familia del actor ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_mesada_saldo(p_miembro_id integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('miembro_id',m.id,'total',coalesce(m.puntos,0),'bloqueada',coalesce(b.s,0),
    'disponible',greatest(0,coalesce(m.puntos,0)-coalesce(b.s,0)),'proxima_liberacion',b.f,
    'proxima_liberacion_ts',(b.f::timestamp AT TIME ZONE 'Europe/Madrid'),
    'familia_id', m.familia_id)
  FROM public.familia_miembros m
  LEFT JOIN LATERAL (SELECT sum(x.monto)::integer s, min(p.fecha_liberacion) f
    FROM public.familia_mesadas x JOIN public.familia_mesada_periodos p ON p.periodo=x.periodo
    WHERE x.miembro_id=m.id AND x.estado='cargada'
      AND (x.familia_id IS NULL OR x.familia_id = m.familia_id)) b ON true
  WHERE m.id=p_miembro_id;
$$;

CREATE OR REPLACE FUNCTION public.familia_rpc_mesada_estado(p_actor_id integer, p_miembro_id integer DEFAULT NULL, p_zona text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_fid bigint; v_hoy date; v_zona text; j jsonb;
BEGIN
  v_fid := public.familia_mf_familia_de_miembro(p_actor_id);
  IF p_miembro_id IS NOT NULL THEN
    PERFORM public.familia_mf_assert_misma_familia(p_actor_id, p_miembro_id);
  END IF;
  BEGIN
    v_zona := public.familia_v4_zona(p_actor_id, p_zona);
  EXCEPTION WHEN undefined_function THEN
    v_zona := coalesce(p_zona, 'Europe/Madrid');
  END;
  v_hoy := (now() AT TIME ZONE v_zona)::date;
  SELECT jsonb_build_object(
    'hoy', v_hoy,
    'familia_id', v_fid,
    'config', (SELECT jsonb_build_object('modo',mesada_modo,'dia_liberacion',mesada_dia_liberacion,
       'bono_activo',mesada_bono_activo,'bono_pct',mesada_bono_pct,'proxima_fecha_guardada',mesada_proxima_fecha)
       FROM public.familia_config c
      WHERE coalesce(c.familia_id, v_fid) = v_fid
      ORDER BY c.id LIMIT 1),
    'fecha_liberacion', coalesce(
       (SELECT min(fecha_liberacion) FROM public.familia_mesada_periodos p
         WHERE p.liberado_en IS NULL AND coalesce(p.familia_id, v_fid)=v_fid),
       (SELECT mesada_proxima_fecha FROM public.familia_config c
         WHERE coalesce(c.familia_id,v_fid)=v_fid ORDER BY c.id LIMIT 1),
       (SELECT ((date_trunc('month',v_hoy) + interval '2 month')::date + (coalesce(c.mesada_dia_liberacion,1)-1))
          FROM public.familia_config c WHERE coalesce(c.familia_id,v_fid)=v_fid ORDER BY c.id LIMIT 1)),
    'periodos_pendientes', (SELECT coalesce(jsonb_agg(jsonb_build_object('periodo',p.periodo,'fecha_liberacion',p.fecha_liberacion,
       'dias_para_liberar',p.fecha_liberacion-v_hoy,'puede_liberar',v_hoy>=p.fecha_liberacion,
       'recordatorio_enviado',p.recordatorio_en IS NOT NULL) ORDER BY p.periodo),'[]'::jsonb)
       FROM public.familia_mesada_periodos p
      WHERE p.liberado_en IS NULL AND coalesce(p.familia_id,v_fid)=v_fid),
    'hijos', (SELECT coalesce(jsonb_agg(jsonb_build_object('nombre',m.nombre,'monto',m.mesada_monto,'pausada',m.mesada_pausada)
       || public.familia_rpc_mesada_saldo(m.id) ORDER BY m.id),'[]'::jsonb)
       FROM public.familia_miembros m
      WHERE m.familia_id = v_fid
        AND NOT public.familia_es_admin(m)
        AND (p_miembro_id IS NULL OR m.id=p_miembro_id))
  ) INTO j;
  RETURN j || jsonb_build_object('fecha_liberacion_ts',
    ((j->>'fecha_liberacion')::date::timestamp AT TIME ZONE 'Europe/Madrid'));
END $$;
REVOKE ALL ON FUNCTION public.familia_rpc_mesada_saldo(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.familia_rpc_mesada_estado(integer,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_mesada_saldo(integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_rpc_mesada_estado(integer,integer,text) TO anon, authenticated, service_role;

-- ========== Agenda guardar: INSERT/UPDATE con familia_id de la sesión del actor ==========
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
  v_cnt int; v_fid bigint;
BEGIN
  SELECT * INTO a FROM public.familia_miembros WHERE id = p_actor_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'actor inválido'; END IF;
  v_fid := public.familia_mf_familia_de_miembro(p_actor_id);
  v_rol := coalesce(a.rol_v6d, CASE WHEN a.es_admin THEN 'padre_admin' ELSE CASE WHEN public.familia_es_admin(a) THEN 'padre' ELSE 'hijo' END END);

  IF p_id IS NOT NULL THEN
    SELECT * INTO cur FROM public.familia_agenda_actividades WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR cur.archivada_en IS NOT NULL THEN RAISE EXCEPTION 'actividad no encontrada'; END IF;
    IF coalesce(cur.familia_id, v_fid) IS DISTINCT FROM v_fid THEN
      RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501';
    END IF;
    BEGIN
      IF NOT public.familia_agenda_puede_ver(p_actor_id, cur.miembro_id) THEN
        RAISE EXCEPTION 'sin permiso' USING HINT='v6e_agenda_perm';
      END IF;
    EXCEPTION WHEN undefined_function THEN
      IF public.familia_mf_familia_de_miembro(cur.miembro_id) IS DISTINCT FROM v_fid THEN
        RAISE EXCEPTION 'sin permiso' USING HINT='v6e_agenda_perm';
      END IF;
    END;
    IF v_rol = 'hijo' AND p_actor_id <> cur.miembro_id THEN
      RAISE EXCEPTION 'no puedes editar la agenda de otro' USING HINT='v6e_agenda_perm';
    END IF;
    v_mid := cur.miembro_id;
  ELSE
    IF v_rol IN ('padre_admin','padre') THEN
      RAISE EXCEPTION 'el padre no crea compromisos; el hijo los crea' USING HINT='v6e_agenda_padre_no_crea';
    END IF;
    v_mid := coalesce(p_miembro_id, p_actor_id);
    IF v_mid <> p_actor_id THEN
      RAISE EXCEPTION 'solo puedes crear en tu agenda' USING HINT='v6e_agenda_perm';
    END IF;
    PERFORM public.familia_mf_assert_misma_familia(p_actor_id, v_mid);
    SELECT count(*) INTO v_cnt FROM public.familia_agenda_actividades
     WHERE miembro_id = v_mid AND archivada_en IS NULL
       AND coalesce(familia_id, v_fid) = v_fid
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

  v_ini := timezone('Europe/Madrid', (p_desde_fecha::text || ' ' || p_hora_inicio::text)::timestamp);
  v_fin := v_ini + make_interval(mins => p_duracion_min);
  BEGIN
    v_cruza := public.familia_rpc_agenda_cruce(v_mid, v_ini, v_fin, NULL, p_id, p_desde_fecha);
  EXCEPTION WHEN undefined_function THEN
    v_cruza := NULL;
  END;
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
      recordar_min_antes, creada_por, actualizada_por, client_req_id, familia_id)
    VALUES (
      v_mid, trim(p_titulo), nullif(trim(coalesce(p_descripcion,'')),''), coalesce(p_categoria,'otros'),
      p_hora_inicio, p_duracion_min, p_recurrencia,
      coalesce(nullif(p_dias_semana,''),'0000000'),
      CASE WHEN p_recurrencia='monthly' THEN coalesce(p_mensual_dia, EXTRACT(DAY FROM p_desde_fecha)::int) ELSE NULL END,
      p_desde_fecha, p_hasta_fecha, coalesce(p_recordar_min_antes,30),
      p_actor_id, p_actor_id, p_client_req_id, v_fid)
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
      actualizado_en = now(),
      familia_id = coalesce(familia_id, v_fid)
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'familia_id', v_fid);
END $$;
REVOKE ALL ON FUNCTION public.familia_rpc_agenda_guardar(integer,bigint,integer,text,text,text,time,integer,text,text,smallint,date,date,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_agenda_guardar(integer,bigint,integer,text,text,text,time,integer,text,text,smallint,date,date,integer,text) TO anon, authenticated, service_role;

-- Archivar / excepción: fail-closed por familia
CREATE OR REPLACE FUNCTION public.familia_rpc_agenda_archivar(p_actor_id integer, p_actividad_id bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE cur public.familia_agenda_actividades%ROWTYPE; v_fid bigint; v_hoy date;
BEGIN
  v_fid := public.familia_mf_familia_de_miembro(p_actor_id);
  SELECT * INTO cur FROM public.familia_agenda_actividades WHERE id = p_actividad_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'actividad no encontrada'; END IF;
  IF coalesce(cur.familia_id, v_fid) IS DISTINCT FROM v_fid THEN
    RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501';
  END IF;
  v_hoy := (timezone('Europe/Madrid', now()))::date;
  UPDATE public.familia_agenda_actividades SET
    archivada_en = now(),
    hasta_fecha = LEAST(coalesce(hasta_fecha, v_hoy), v_hoy),
    familia_id = coalesce(familia_id, v_fid)
  WHERE id = p_actividad_id;
  RETURN jsonb_build_object('ok', true, 'id', p_actividad_id);
END $$;
REVOKE ALL ON FUNCTION public.familia_rpc_agenda_archivar(integer,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_agenda_archivar(integer,bigint) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.familia_rpc_agenda_excepcion(
  p_actor_id integer, p_actividad_id bigint, p_dia date, p_tipo text,
  p_nuevo_inicio timestamptz DEFAULT NULL, p_nueva_duracion_min integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE cur public.familia_agenda_actividades%ROWTYPE; v_fid bigint; v_id bigint;
BEGIN
  v_fid := public.familia_mf_familia_de_miembro(p_actor_id);
  SELECT * INTO cur FROM public.familia_agenda_actividades WHERE id = p_actividad_id FOR UPDATE;
  IF NOT FOUND OR cur.archivada_en IS NOT NULL THEN RAISE EXCEPTION 'actividad no encontrada'; END IF;
  IF coalesce(cur.familia_id, v_fid) IS DISTINCT FROM v_fid THEN
    RAISE EXCEPTION 'familia no coincide' USING HINT='mf_o3_familia', ERRCODE='42501';
  END IF;
  IF p_tipo NOT IN ('omitir','mover') THEN RAISE EXCEPTION 'tipo excepción inválido'; END IF;
  INSERT INTO public.familia_agenda_excepciones(actividad_id, dia_original, tipo, nuevo_inicio, nueva_duracion_min, creado_por, familia_id)
  VALUES (p_actividad_id, p_dia, p_tipo, p_nuevo_inicio, p_nueva_duracion_min, p_actor_id, v_fid)
  ON CONFLICT (actividad_id, dia_original) DO UPDATE SET
    tipo = EXCLUDED.tipo,
    nuevo_inicio = EXCLUDED.nuevo_inicio,
    nueva_duracion_min = EXCLUDED.nueva_duracion_min,
    familia_id = coalesce(public.familia_agenda_excepciones.familia_id, v_fid)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.familia_rpc_agenda_excepcion(integer,bigint,date,text,timestamptz,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_agenda_excepcion(integer,bigint,date,text,timestamptz,integer) TO anon, authenticated, service_role;

-- ========== Ranking C13: solo hijos de la familia; Semana por fecha de la tarea ==========
-- Día B18 03:00–03:00 Europe/Madrid.
CREATE OR REPLACE FUNCTION public.familia_rpc_ranking(p_actor_id integer, p_modo text DEFAULT 'total')
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fid bigint;
  v_modo text := lower(trim(coalesce(p_modo,'total')));
  v_from timestamptz;
  v_to timestamptz;
  v_now_m timestamptz := timezone('Europe/Madrid', now());
  v_corte date;
BEGIN
  v_fid := public.familia_mf_familia_de_miembro(p_actor_id);
  -- Semana B18: cortes a las 03:00 Europe/Madrid
  IF v_modo IN ('semana','week') THEN
    v_corte := CASE WHEN (v_now_m::time >= time '03:00') THEN v_now_m::date ELSE (v_now_m::date - 1) END;
    -- lunes de la semana del corte (ISO)
    v_from := timezone('Europe/Madrid', ((v_corte - ((EXTRACT(ISODOW FROM v_corte)::int) - 1))::text || ' 03:00')::timestamp);
    v_to := v_from + interval '7 days';
  ELSE
    v_from := NULL; v_to := NULL;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'familia_id', v_fid,
    'modo', CASE WHEN v_modo IN ('semana','week') THEN 'semana' ELSE 'total' END,
    'desde', v_from,
    'hasta', v_to,
    'hijos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'miembro_id', m.id,
        'nombre', m.nombre,
        'saldo', coalesce(m.puntos,0),
        'ganados', coalesce(g.ganados,0)
      ) ORDER BY coalesce(g.ganados,0) DESC, m.id)
      FROM public.familia_miembros m
      LEFT JOIN LATERAL (
        SELECT sum(h.pts) FILTER (WHERE h.pts > 0 AND h.tipo IN ('tarea','deber','bono_excelencia')) AS ganados
          FROM public.familia_historial_v h
          LEFT JOIN public.familia_tareas t ON t.id = h.tarea_id
         WHERE h.miembro_id = m.id
           AND coalesce(h.familia_id, v_fid) = v_fid
           AND h.archivada_en IS NULL
           AND (
             v_from IS NULL
             OR coalesce(t.habilita_en, t.fecha_limite, h.creado_en) >= v_from
                AND coalesce(t.habilita_en, t.fecha_limite, h.creado_en) < v_to
           )
      ) g ON true
      WHERE m.familia_id = v_fid
        AND coalesce(m.rol_v6d, CASE WHEN m.es_admin THEN 'padre_admin' ELSE 'hijo' END) = 'hijo'
    ), '[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION public.familia_rpc_ranking(integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_ranking(integer,text) TO anon, authenticated, service_role;

-- ========== Guarda final de puntos ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS NOT NULL AND cardinality(v)=6 AND v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'mf_o3_rpc_guarda_pts_post: puntos=% esperado=%; aborto', v, esperado;
  END IF;
END $$;

-- Nota Auth: ligar admin_auth_user_id de familia #1 requiere aviso previo al Orquestador
-- (confirmación por correo Supabase Auth). No se dispara en esta migración.
