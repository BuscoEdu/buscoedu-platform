-- FAMLY O6 · RPCs admin / nick / miembros (Backend)
-- Fecha: 2026-10-30 Europe/Madrid · Quién: Backend BuscoEdu (bot)
-- Depende de: 20261031230000_famly_invitaciones (consumir/vincular/clave/rate_limit/reset).
-- NO duplica tablas ni helpers BD. Sin Auth global. Sin correos. Sin DELETE físico.
-- Criterios I1–I21 aplicables a BE + contrato-fe-o6.md (firmas definitivas en contrato-be-o6.md).

-- ========== Guarda puntos beman27 (I11) ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  IF to_regclass('public.familia_miembros') IS NULL THEN RETURN; END IF;
  SELECT array_agg(puntos ORDER BY id) INTO v
    FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS NOT NULL AND cardinality(v) = 6 AND v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'o6_admin_guarda_pts: puntos=% esperado=%; aborto', v, esperado;
  END IF;
END $$;

-- ========== Columnas aditivas si el mock/O3 no las trae ==========
DO $$
BEGIN
  IF to_regclass('public.familia_miembros') IS NOT NULL THEN
    ALTER TABLE public.familia_miembros
      ADD COLUMN IF NOT EXISTS es_admin boolean NOT NULL DEFAULT false;
    ALTER TABLE public.familia_miembros
      ADD COLUMN IF NOT EXISTS rol_v6d text;
    ALTER TABLE public.familia_miembros
      ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;
  END IF;
  IF to_regclass('public.familia_sesiones') IS NOT NULL THEN
    ALTER TABLE public.familia_sesiones
      ADD COLUMN IF NOT EXISTS creado_en timestamptz NOT NULL DEFAULT now();
    ALTER TABLE public.familia_sesiones
      ADD COLUMN IF NOT EXISTS expira_en timestamptz;
    ALTER TABLE public.familia_sesiones
      ADD COLUMN IF NOT EXISTS cerrada_en timestamptz;
  END IF;
END $$;

-- ========== Alinear CHECK nick a O1 (CON guion) si el mock aún lo rechaza ==========
DO $$
DECLARE c text;
BEGIN
  IF to_regclass('public.familia_familias') IS NULL THEN RETURN; END IF;
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'public.familia_familias'::regclass
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%nickname%'
       AND pg_get_constraintdef(con.oid) NOT ILIKE '%a-z0-9_-%'
  LOOP
    EXECUTE format('ALTER TABLE public.familia_familias DROP CONSTRAINT IF EXISTS %I', c);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.familia_familias'::regclass
       AND conname = 'familia_familias_nick_fmt'
       AND pg_get_constraintdef(oid) ILIKE '%a-z0-9_-%'
  ) THEN
    ALTER TABLE public.familia_familias DROP CONSTRAINT IF EXISTS familia_familias_nick_fmt;
    ALTER TABLE public.familia_familias
      ADD CONSTRAINT familia_familias_nick_fmt
      CHECK (nickname ~ '^[a-z0-9_-]{5,20}$');
  END IF;
END $$;

-- ========== Helper nick OK (O1/Orq · CHECK BD ^[a-z0-9_-]{5,20}$ · CON guion) ==========
CREATE OR REPLACE FUNCTION public.familia_mf_o6_nick_ok(p_nick text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(p_nick, '') ~ '^[a-z0-9_-]{5,20}$';
$$;
COMMENT ON FUNCTION public.familia_mf_o6_nick_ok(text) IS
  'O6: nick 5–20, minúsculas/números/_/- (regla O1 Orq + CHECK BD; CON guion).';
REVOKE ALL ON FUNCTION public.familia_mf_o6_nick_ok(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_mf_o6_nick_ok(text) TO anon, authenticated, service_role;

-- ========== C4 PIN (idempotente si O1/O2 ya lo creó) ==========
CREATE OR REPLACE FUNCTION public.familia_mf_pin_seguro(p_pin text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE p text := coalesce(p_pin, '');
BEGIN
  IF char_length(p) < 4 OR char_length(p) > 8 THEN RETURN false; END IF;
  IF p !~ '^[0-9a-zA-Z]+$' THEN RETURN false; END IF;
  IF lower(p) IN (
    'oooo','0000','1111','1234','4321','abcd','aaaa',
    '2222','3333','4444','5555','6666','7777','8888','9999'
  ) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.familia_mf_pin_seguro(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_mf_pin_seguro(text) TO anon, authenticated, service_role;

-- ========== Sesión ctx (header x-familia-token / GUC tests) — idempotente O3 ==========
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
  BEGIN
    v_fid := nullif(current_setting('app.familia_id', true), '')::bigint;
    v_mid := nullif(current_setting('app.miembro_id', true), '')::integer;
  EXCEPTION WHEN others THEN
    v_fid := NULL; v_mid := NULL;
  END;
  IF v_fid IS NOT NULL THEN
    familia_id := v_fid; miembro_id := v_mid; RETURN NEXT; RETURN;
  END IF;

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
    RETURN;
  END IF;

  SELECT s.familia_id, s.miembro_id INTO v_fid, v_mid
    FROM public.familia_sesiones s
   WHERE s.token::text = v_tok
   LIMIT 1;
  IF v_fid IS NULL THEN
    RETURN;
  END IF;
  BEGIN
    EXECUTE $q$SELECT expira_en, cerrada_en FROM public.familia_sesiones WHERE token::text = $1$q$
      INTO v_exp, v_cerr USING v_tok;
    IF v_cerr IS NOT NULL THEN RETURN; END IF;
    IF v_exp IS NOT NULL AND v_exp <= now() THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;
  familia_id := v_fid; miembro_id := v_mid; RETURN NEXT;
END;
$$;
COMMENT ON FUNCTION public.familia_mf_sesion_ctx() IS
  'O3/O6: resuelve familia_id+miembro_id desde x-familia-token o GUC app.* (tests).';
REVOKE ALL ON FUNCTION public.familia_mf_sesion_ctx() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_mf_sesion_ctx() TO anon, authenticated, service_role;

-- ========== Helper: siguiente id de miembro (esquemas sin serial) ==========
CREATE OR REPLACE FUNCTION public.familia_mf_o6_next_miembro_id()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v int;
BEGIN
  SELECT coalesce(max(id), 0) + 1 INTO v FROM public.familia_miembros;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.familia_mf_o6_next_miembro_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_mf_o6_next_miembro_id() TO service_role;

-- ========== nick_sugerir (I6/I7) ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_nick_sugerir(p_base text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base text;
  v_cand text;
  i int := 0;
BEGIN
  v_base := lower(regexp_replace(coalesce(p_base, ''), '[^a-z0-9_-]+', '', 'g'));
  IF char_length(v_base) < 5 THEN
    v_base := 'casa' || substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 4);
  END IF;
  IF char_length(v_base) > 16 THEN
    v_base := substr(v_base, 1, 16);
  END IF;
  LOOP
    IF i = 0 THEN
      v_cand := v_base;
    ELSE
      v_cand := substr(v_base, 1, greatest(5, 20 - char_length(i::text))) || i::text;
    END IF;
    IF char_length(v_cand) > 20 THEN
      v_cand := substr(v_cand, 1, 20);
    END IF;
    IF public.familia_mf_o6_nick_ok(v_cand)
       AND NOT EXISTS (
         SELECT 1 FROM public.familia_familias WHERE lower(nickname) = v_cand
       ) THEN
      RETURN jsonb_build_object('ok', true, 'nick', v_cand);
    END IF;
    i := i + 1;
    IF i > 50 THEN
      v_cand := 'f' || substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 10);
      RETURN jsonb_build_object('ok', true, 'nick', v_cand);
    END IF;
  END LOOP;
END;
$$;
COMMENT ON FUNCTION public.familia_rpc_nick_sugerir(text) IS
  'O6 I6/I7: sugiere nick libre 5–20 [a-z0-9_-] (CON guion).';
REVOKE ALL ON FUNCTION public.familia_rpc_nick_sugerir(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_nick_sugerir(text) TO anon, authenticated, service_role;

-- ========== admin_registrar (I3,I4,I5,I6,I8,I12,I15,I17) ==========
-- Una transacción: valida → consumir(FOR UPDATE) → familia+admin+miembro → vincular → sesión.
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

-- ========== admin_login (I13, I18) ==========
-- Solo cuenta fallos en rate_limit (5/15min). Mensaje genérico siempre.
CREATE OR REPLACE FUNCTION public.familia_rpc_admin_login(p_email text, p_clave text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  a public.familia_admins%ROWTYPE;
  m public.familia_miembros%ROWTYPE;
  v_tok uuid;
  v_rl jsonb;
  v_msg text := 'No se pudo entrar. Inténtalo más tarde.';
  v_miembros jsonb;
BEGIN
  IF v_email = '' OR coalesce(p_clave, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'datos', 'mensaje', v_msg);
  END IF;

  SELECT * INTO a
    FROM public.familia_admins
   WHERE email = v_email::extensions.citext AND activo IS TRUE;

  IF NOT FOUND
     OR NOT public.familia_mf_clave_verifica(p_clave, a.clave_hash) THEN
    -- Contar solo fallos (I18)
    v_rl := public.familia_rpc_rate_limit_tocar(
      'o6_login:' || v_email, 5, 15
    );
    IF coalesce((v_rl->>'ok')::boolean, false) IS NOT TRUE THEN
      RETURN jsonb_build_object(
        'ok', false, 'hint', 'bloqueado', 'mensaje', v_msg
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', false, 'hint', 'credenciales', 'mensaje', v_msg
    );
  END IF;

  SELECT * INTO m
    FROM public.familia_miembros
   WHERE familia_id = a.familia_id
     AND coalesce(rol_v6d, '') = 'padre_admin'
     AND coalesce(activo, true) IS TRUE
   ORDER BY id
   LIMIT 1;
  IF m.id IS NULL THEN
    SELECT * INTO m
      FROM public.familia_miembros
     WHERE familia_id = a.familia_id
       AND es_admin IS TRUE
       AND coalesce(activo, true) IS TRUE
     ORDER BY id
     LIMIT 1;
  END IF;
  IF m.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'datos', 'mensaje', v_msg);
  END IF;

  v_tok := gen_random_uuid();
  INSERT INTO public.familia_sesiones(token, miembro_id, familia_id, creado_en, expira_en)
  VALUES (v_tok, m.id, a.familia_id, now(), now() + interval '30 days');

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'nombre', x.nombre,
    'alias', x.alias_entrada,
    'rol', coalesce(x.rol_v6d, CASE WHEN x.es_admin THEN 'padre' ELSE 'hijo' END),
    'activo', coalesce(x.activo, true)
  ) ORDER BY x.id), '[]'::jsonb)
  INTO v_miembros
  FROM public.familia_miembros x
  WHERE x.familia_id = a.familia_id;

  RETURN jsonb_build_object(
    'ok', true,
    'token', v_tok,
    'familia_id', a.familia_id,
    'admin_id', a.id,
    'miembro_id', m.id,
    'miembros', v_miembros
  );
END;
$$;
COMMENT ON FUNCTION public.familia_rpc_admin_login(text, text) IS
  'O6 I13/I18: login email+clave; rate 5/15min solo en fallos; sesión x-familia-token.';
REVOKE ALL ON FUNCTION public.familia_rpc_admin_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_admin_login(text, text)
  TO anon, authenticated, service_role;

-- ========== Helper: exige sesión admin dueño de la casa ==========
CREATE OR REPLACE FUNCTION public.familia_mf_o6_exige_admin()
RETURNS TABLE(familia_id bigint, miembro_id integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ctx record;
BEGIN
  SELECT * INTO ctx FROM public.familia_mf_sesion_ctx() LIMIT 1;
  IF ctx.familia_id IS NULL OR ctx.miembro_id IS NULL THEN
    RAISE EXCEPTION 'sin permiso'
      USING ERRCODE = '42501', HINT = 'o6_sesion';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.familia_miembros m
     WHERE m.id = ctx.miembro_id
       AND m.familia_id = ctx.familia_id
       AND coalesce(m.rol_v6d, '') = 'padre_admin'
       AND coalesce(m.activo, true) IS TRUE
  ) THEN
    RAISE EXCEPTION 'sin permiso'
      USING ERRCODE = '42501', HINT = 'o6_solo_admin';
  END IF;
  familia_id := ctx.familia_id;
  miembro_id := ctx.miembro_id;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.familia_mf_o6_exige_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_mf_o6_exige_admin() TO service_role;

-- ========== miembros_listar ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_miembros_listar()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ctx record;
  v_list jsonb;
BEGIN
  SELECT * INTO ctx FROM public.familia_mf_o6_exige_admin() LIMIT 1;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'nombre', m.nombre,
    'alias', m.alias_entrada,
    'rol', coalesce(m.rol_v6d, CASE WHEN m.es_admin THEN 'padre' ELSE 'hijo' END),
    'activo', coalesce(m.activo, true)
  ) ORDER BY m.id), '[]'::jsonb)
  INTO v_list
  FROM public.familia_miembros m
  WHERE m.familia_id = ctx.familia_id;

  RETURN jsonb_build_object('ok', true, 'miembros', v_list, 'familia_id', ctx.familia_id);
END;
$$;
COMMENT ON FUNCTION public.familia_rpc_miembros_listar() IS
  'O6: lista miembros de la familia de la sesión admin (sin PIN).';
REVOKE ALL ON FUNCTION public.familia_rpc_miembros_listar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_miembros_listar()
  TO anon, authenticated, service_role;

-- ========== miembro_crear (I9, I20 · tope 10 · firma FE p_nombre,p_alias,p_rol,p_pin) ==========
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

-- ========== miembro_editar (firma FE p_miembro_id,p_nombre,p_alias,p_rol) ==========
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

-- ========== miembro_pin ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_miembro_pin(
  p_miembro_id integer,
  p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ctx record;
  m public.familia_miembros%ROWTYPE;
BEGIN
  SELECT * INTO ctx FROM public.familia_mf_o6_exige_admin() LIMIT 1;

  SELECT * INTO m FROM public.familia_miembros WHERE id = p_miembro_id FOR UPDATE;
  IF NOT FOUND OR m.familia_id IS DISTINCT FROM ctx.familia_id THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'mf_o3_familia',
      'mensaje', 'No se pudo actualizar.');
  END IF;
  IF NOT public.familia_mf_pin_seguro(p_pin) THEN
    RETURN jsonb_build_object(
      'ok', false, 'hint', 'c4_pin',
      'mensaje', 'Elige un PIN de 4 a 8 caracteres. No uses 0000, 1111 ni 1234.'
    );
  END IF;
  UPDATE public.familia_miembros SET pin = p_pin WHERE id = p_miembro_id;
  RETURN jsonb_build_object('ok', true, 'miembro_id', p_miembro_id);
END;
$$;
COMMENT ON FUNCTION public.familia_rpc_miembro_pin(integer, text) IS
  'O6: cambia PIN de miembro de la misma familia. No imprime el PIN.';
REVOKE ALL ON FUNCTION public.familia_rpc_miembro_pin(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_miembro_pin(integer, text)
  TO anon, authenticated, service_role;

-- ========== miembro_desactivar (I21 · soft; activo=false; sin DELETE) ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_miembro_desactivar(p_miembro_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ctx record;
  m public.familia_miembros%ROWTYPE;
BEGIN
  SELECT * INTO ctx FROM public.familia_mf_o6_exige_admin() LIMIT 1;

  SELECT * INTO m FROM public.familia_miembros WHERE id = p_miembro_id FOR UPDATE;
  IF NOT FOUND OR m.familia_id IS DISTINCT FROM ctx.familia_id THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'mf_o3_familia',
      'mensaje', 'No se pudo desactivar.');
  END IF;
  IF m.id = ctx.miembro_id THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'o6_self',
      'mensaje', 'No puedes desactivarte a ti mismo.');
  END IF;
  IF coalesce(m.rol_v6d, '') = 'padre_admin' THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'o6_admin',
      'mensaje', 'No se desactiva al admin dueño.');
  END IF;

  UPDATE public.familia_miembros
     SET activo = false
   WHERE id = p_miembro_id;

  -- Si existe desactivado_en (esquemas O3), rellenarlo
  BEGIN
    EXECUTE $q$UPDATE public.familia_miembros SET desactivado_en = now() WHERE id = $1$q$
      USING p_miembro_id;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'miembro_id', p_miembro_id);
END;
$$;
COMMENT ON FUNCTION public.familia_rpc_miembro_desactivar(integer) IS
  'O6 I21: soft-desactiva (activo=false). Sin DELETE físico.';
REVOKE ALL ON FUNCTION public.familia_rpc_miembro_desactivar(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_miembro_desactivar(integer)
  TO anon, authenticated, service_role;

-- ========== Guarda final puntos ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  IF to_regclass('public.familia_miembros') IS NULL THEN RETURN; END IF;
  SELECT array_agg(puntos ORDER BY id) INTO v
    FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS NOT NULL AND cardinality(v) = 6 AND v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'o6_admin_guarda_pts_post: puntos=% esperado=%; aborto', v, esperado;
  END IF;
END $$;
