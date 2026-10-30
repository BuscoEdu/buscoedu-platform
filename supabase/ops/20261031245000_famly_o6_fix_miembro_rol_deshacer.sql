-- DESHACER · FAMLY O6 fix miembro.rol (restaura funciones a acd5e37)
-- Fecha: 2026-10-31 Europe/Madrid · Quién: Backend BuscoEdu (bot)
-- Vuelve a la versión acd5e37 (INSERT sin columna rol → 23502 en prod).
-- NO toca datos ni CHECK/NOT NULL de columnas.

DROP FUNCTION IF EXISTS public.familia_mf_o6_rol_etiqueta(text);

CREATE OR REPLACE FUNCTION public.familia_rpc_admin_registrar(
  p_token text,
  p_email text,
  p_clave text,
  p_nick text,
  p_nombre_familia text DEFAULT NULL,
  p_alias_admin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
  v_nick text;
  v_alias text;
  v_nombre text;
  v_hash text;
  v_cons jsonb;
  v_inv_id bigint;
  v_fid bigint;
  v_admin_id bigint;
  v_mid integer;
  v_tok uuid;
  v_link text;
  v_sug text;
  v_vin jsonb;
BEGIN
  -- Email
  v_email := lower(trim(coalesce(p_email, '')));
  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object(
      'ok', false, 'hint', 'email_fmt',
      'mensaje', 'Revisa el correo e inténtalo de nuevo.'
    );
  END IF;

  -- I5: 1 email = 1 familia (mensaje exacto)
  IF EXISTS (
    SELECT 1 FROM public.familia_admins
     WHERE email = v_email::extensions.citext AND activo IS TRUE
  ) THEN
    RETURN jsonb_build_object(
      'ok', false, 'hint', 'email_dueño',
      'mensaje', 'Este correo ya tiene una familia. Inicia sesión.'
    );
  END IF;

  -- I4: clave ≥8 + letra + número (helper BD)
  IF NOT public.familia_mf_clave_ok(p_clave) THEN
    RETURN jsonb_build_object(
      'ok', false, 'hint', 'clave',
      'mensaje', 'La clave debe tener al menos 8 caracteres, con una letra y un número.'
    );
  END IF;

  -- Nick O1: validar SIN lower previo (mayúsculas → nick_fmt; regex ya exige a-z)
  v_nick := trim(coalesce(p_nick, ''));
  IF NOT public.familia_mf_o6_nick_ok(v_nick) THEN
    RETURN jsonb_build_object(
      'ok', false, 'hint', 'nick_fmt',
      'mensaje', 'El apodo debe tener de 5 a 20 caracteres: solo minúsculas, números, guion bajo o guion medio.'
    );
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.familia_familias WHERE lower(nickname) = v_nick
  ) THEN
    v_sug := public.familia_rpc_nick_sugerir(v_nick)->>'nick';
    RETURN jsonb_build_object(
      'ok', false, 'hint', 'nick_dup',
      'mensaje', 'Ese apodo ya existe. Prueba con este: ' || coalesce(v_sug, ''),
      'sugerencia', v_sug
    );
  END IF;

  v_nombre := nullif(trim(coalesce(p_nombre_familia, '')), '');
  IF v_nombre IS NULL THEN
    v_nombre := initcap(replace(v_nick, '_', ' '));
  END IF;

  v_alias := lower(regexp_replace(
    coalesce(nullif(trim(p_alias_admin), ''), 'admin'),
    '[^a-z0-9_]+', '', 'g'
  ));
  IF char_length(v_alias) < 2 THEN v_alias := 'admin'; END IF;
  IF char_length(v_alias) > 16 THEN v_alias := substr(v_alias, 1, 16); END IF;

  -- Token vacío / corto → genérico I2 (sin quemar)
  IF coalesce(p_token, '') = '' OR char_length(p_token) < 32 THEN
    RETURN jsonb_build_object(
      'ok', false, 'hint', 'no_disponible',
      'mensaje', 'Este enlace no está disponible.'
    );
  END IF;

  -- Consumir (BD helper FOR UPDATE). Solo tras validar inputs (I12).
  v_hash := public.familia_invitacion_hash(trim(p_token));
  v_cons := public.familia_invitacion_consumir(v_hash);
  IF coalesce((v_cons->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false, 'hint', 'no_disponible',
      'mensaje', 'Este enlace no está disponible.'
    );
  END IF;
  v_inv_id := nullif(v_cons->>'invitacion_id', '')::bigint;

  v_link := encode(extensions.gen_random_bytes(12), 'hex');

  INSERT INTO public.familia_familias(nombre_visible, nickname, link_token, estado)
  VALUES (v_nombre, v_nick, v_link, 'activa')
  RETURNING id INTO v_fid;

  INSERT INTO public.familia_admins(familia_id, email, clave_hash, activo)
  VALUES (
    v_fid,
    v_email::extensions.citext,
    public.familia_mf_clave_hash(p_clave),
    true
  )
  RETURNING id INTO v_admin_id;

  -- Miembro admin (cuenta en tope 10)
  BEGIN
    INSERT INTO public.familia_miembros(
      nombre, puntos, pin, alias_entrada, es_admin, rol_v6d, familia_id, activo
    ) VALUES (
      coalesce(nullif(trim(p_alias_admin), ''), 'Admin'),
      0, NULL, v_alias, true, 'padre_admin', v_fid, true
    )
    RETURNING id INTO v_mid;
  EXCEPTION
    WHEN not_null_violation OR check_violation THEN
      v_mid := public.familia_mf_o6_next_miembro_id();
      INSERT INTO public.familia_miembros(
        id, nombre, puntos, pin, alias_entrada, es_admin, rol_v6d, familia_id, activo
      ) VALUES (
        v_mid,
        coalesce(nullif(trim(p_alias_admin), ''), 'Admin'),
        0, NULL, v_alias, true, 'padre_admin', v_fid, true
      );
  END;

  IF v_mid IS NULL THEN
    v_mid := public.familia_mf_o6_next_miembro_id();
    INSERT INTO public.familia_miembros(
      id, nombre, puntos, pin, alias_entrada, es_admin, rol_v6d, familia_id, activo
    ) VALUES (
      v_mid,
      coalesce(nullif(trim(p_alias_admin), ''), 'Admin'),
      0, NULL, v_alias, true, 'padre_admin', v_fid, true
    );
  END IF;

  -- Vincular invitación → familia (helper BD)
  IF v_inv_id IS NOT NULL THEN
    v_vin := public.familia_invitacion_vincular_familia(v_inv_id, v_fid);
    IF coalesce((v_vin->>'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'o6_vincular_fallo'
        USING ERRCODE = 'P0001', HINT = 'o6_vincular';
    END IF;
  END IF;

  v_tok := gen_random_uuid();
  INSERT INTO public.familia_sesiones(token, miembro_id, familia_id, creado_en, expira_en)
  VALUES (v_tok, v_mid, v_fid, now(), now() + interval '30 days');

  RETURN jsonb_build_object(
    'ok', true,
    'token', v_tok,
    'familia_id', v_fid,
    'admin_id', v_admin_id,
    'miembro_id', v_mid,
    'nick', v_nick,
    'alias', v_alias,
    'nombre_familia', v_nombre
  );
EXCEPTION
  WHEN unique_violation THEN
    IF SQLERRM ILIKE '%email%' OR SQLERRM ILIKE '%admins%' THEN
      RETURN jsonb_build_object(
        'ok', false, 'hint', 'email_dueño',
        'mensaje', 'Este correo ya tiene una familia. Inicia sesión.'
      );
    END IF;
    v_sug := public.familia_rpc_nick_sugerir(coalesce(v_nick, 'casa'))->>'nick';
    RETURN jsonb_build_object(
      'ok', false, 'hint', 'nick_dup',
      'mensaje', 'Ese apodo ya existe. Prueba con este: ' || coalesce(v_sug, ''),
      'sugerencia', v_sug
    );
END;
$$;
COMMENT ON FUNCTION public.familia_rpc_admin_registrar(text, text, text, text, text, text) IS
  'O6: alta admin por invitación (consumir+vincular). Sin correo. Clave bcrypt. Sesión x-familia-token.';
REVOKE ALL ON FUNCTION public.familia_rpc_admin_registrar(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_admin_registrar(text, text, text, text, text, text)
  TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.familia_rpc_miembro_crear(
  p_nombre text,
  p_alias text DEFAULT NULL,
  p_rol text DEFAULT 'hijo',
  p_pin text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ctx record;
  v_rol text := lower(trim(coalesce(p_rol, 'hijo')));
  v_alias text;
  v_cnt int;
  v_mid integer;
  v_es_admin boolean := false;
  v_nombre text := nullif(trim(coalesce(p_nombre, '')), '');
BEGIN
  SELECT * INTO ctx FROM public.familia_mf_o6_exige_admin() LIMIT 1;

  IF v_nombre IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'datos',
      'mensaje', 'Escribe el nombre de la persona.');
  END IF;

  SELECT count(*)::int INTO v_cnt
    FROM public.familia_miembros
   WHERE familia_id = ctx.familia_id
     AND coalesce(activo, true) IS TRUE;
  IF v_cnt >= 10 THEN
    RETURN jsonb_build_object(
      'ok', false, 'hint', 'tope_miembros',
      'mensaje', 'Puedes tener hasta 10 personas en tu familia.'
    );
  END IF;

  IF v_rol NOT IN ('padre', 'hijo') THEN
    -- No permitir crear otro padre_admin
    RETURN jsonb_build_object('ok', false, 'hint', 'rol',
      'mensaje', 'Rol no válido.');
  END IF;
  v_es_admin := (v_rol = 'padre');

  IF p_pin IS NOT NULL AND p_pin <> '' AND NOT public.familia_mf_pin_seguro(p_pin) THEN
    RETURN jsonb_build_object(
      'ok', false, 'hint', 'c4_pin',
      'mensaje', 'Elige un PIN de 4 a 8 caracteres. No uses 0000, 1111 ni 1234.'
    );
  END IF;

  v_alias := lower(regexp_replace(
    coalesce(nullif(trim(p_alias), ''), coalesce(p_nombre, 'm')),
    '[^a-z0-9_]+', '', 'g'
  ));
  IF char_length(v_alias) < 2 THEN
    v_alias := 'm' || (v_cnt + 1)::text;
  END IF;
  IF char_length(v_alias) > 16 THEN
    v_alias := substr(v_alias, 1, 16);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.familia_miembros
     WHERE familia_id = ctx.familia_id
       AND lower(alias_entrada) = v_alias
       AND coalesce(activo, true) IS TRUE
  ) THEN
    v_alias := substr(v_alias, 1, 12) || (v_cnt + 1)::text;
  END IF;

  BEGIN
    INSERT INTO public.familia_miembros(
      nombre, puntos, pin, alias_entrada, es_admin, rol_v6d, familia_id, activo
    ) VALUES (
      v_nombre, 0, nullif(p_pin, ''), v_alias, v_es_admin, v_rol, ctx.familia_id, true
    )
    RETURNING id INTO v_mid;
  EXCEPTION
    WHEN not_null_violation OR check_violation THEN
      IF SQLERRM ILIKE '%tope%' OR SQLERRM ILIKE '%máximo 10%' THEN
        RETURN jsonb_build_object(
          'ok', false, 'hint', 'tope_miembros',
          'mensaje', 'Puedes tener hasta 10 personas en tu familia.'
        );
      END IF;
      v_mid := public.familia_mf_o6_next_miembro_id();
      INSERT INTO public.familia_miembros(
        id, nombre, puntos, pin, alias_entrada, es_admin, rol_v6d, familia_id, activo
      ) VALUES (
        v_mid, v_nombre, 0, nullif(p_pin, ''), v_alias, v_es_admin, v_rol, ctx.familia_id, true
      );
  END;

  IF v_mid IS NULL THEN
    v_mid := public.familia_mf_o6_next_miembro_id();
    INSERT INTO public.familia_miembros(
      id, nombre, puntos, pin, alias_entrada, es_admin, rol_v6d, familia_id, activo
    ) VALUES (
      v_mid, v_nombre, 0, nullif(p_pin, ''), v_alias, v_es_admin, v_rol, ctx.familia_id, true
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'miembro', jsonb_build_object(
      'id', v_mid,
      'nombre', v_nombre,
      'alias', v_alias,
      'rol', v_rol,
      'activo', true
    ),
    'familia_id', ctx.familia_id
  );
END;
$$;
COMMENT ON FUNCTION public.familia_rpc_miembro_crear(text, text, text, text) IS
  'O6 I9/I20: crea miembro scoped a sesión admin; tope 10 activos; sin email propio.';
REVOKE ALL ON FUNCTION public.familia_rpc_miembro_crear(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_miembro_crear(text, text, text, text)
  TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.familia_rpc_miembro_editar(
  p_miembro_id integer,
  p_nombre text DEFAULT NULL,
  p_alias text DEFAULT NULL,
  p_rol text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ctx record;
  m public.familia_miembros%ROWTYPE;
  v_rol text;
  v_alias text;
BEGIN
  SELECT * INTO ctx FROM public.familia_mf_o6_exige_admin() LIMIT 1;

  SELECT * INTO m FROM public.familia_miembros WHERE id = p_miembro_id FOR UPDATE;
  IF NOT FOUND OR m.familia_id IS DISTINCT FROM ctx.familia_id THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'mf_o3_familia',
      'mensaje', 'No se pudo actualizar.');
  END IF;

  v_rol := coalesce(nullif(lower(trim(p_rol)), ''), m.rol_v6d, 'hijo');
  IF v_rol NOT IN ('padre_admin', 'padre', 'hijo') THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'rol', 'mensaje', 'Rol no válido.');
  END IF;
  IF coalesce(m.rol_v6d, '') = 'padre_admin' AND v_rol <> 'padre_admin' THEN
    IF (
      SELECT count(*) FROM public.familia_miembros
       WHERE familia_id = ctx.familia_id
         AND coalesce(rol_v6d, '') = 'padre_admin'
         AND coalesce(activo, true) IS TRUE
    ) <= 1 THEN
      RETURN jsonb_build_object('ok', false, 'hint', 'o6_ultimo_admin',
        'mensaje', 'Debe quedar al menos un admin.');
    END IF;
  END IF;

  v_alias := coalesce(
    nullif(lower(regexp_replace(trim(coalesce(p_alias, '')), '[^a-z0-9_]+', '', 'g')), ''),
    m.alias_entrada
  );

  UPDATE public.familia_miembros SET
    nombre = coalesce(nullif(trim(p_nombre), ''), nombre),
    rol_v6d = v_rol,
    es_admin = (v_rol IN ('padre_admin', 'padre')),
    alias_entrada = v_alias
  WHERE id = p_miembro_id;

  RETURN jsonb_build_object('ok', true, 'miembro_id', p_miembro_id);
END;
$$;
COMMENT ON FUNCTION public.familia_rpc_miembro_editar(integer, text, text, text) IS
  'O6: edita nombre/alias/rol de un miembro de la misma familia (sesión admin).';
REVOKE ALL ON FUNCTION public.familia_rpc_miembro_editar(integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_miembro_editar(integer, text, text, text)
  TO anon, authenticated, service_role;


DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  IF to_regclass('public.familia_miembros') IS NULL THEN RETURN; END IF;
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS NOT NULL AND cardinality(v)=6 AND v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'o6_fix_rol_undo_pts: %', v;
  END IF;
END $$;
