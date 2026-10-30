-- FAMLY O6 · Invitaciones + admins (email/clave bcrypt) + rate limit + tope miembros
-- Fecha: 2026-10-30 Europe/Madrid · Quién: BD bot BuscoEdu
-- Alcance: SOLO schema local/migración. ✗ Auth global. ✗ correos. ✗ planes/pagos.
-- Criterios: I1–I21 (criterios-o6-invitaciones.md v2) + decisiones Orq cerradas.
-- Auth elegida: (b) email + bcrypt (extensions.crypt / gen_salt('bf',10)); coherente con
--   familia_login_intentos / tokens opacos; sin createUser ni cambios de Auth.
-- Backend implementa familia_rpc_admin_registrar; BD deja familia_invitacion_consumir.

-- ========== Extensiones (pgcrypto + citext; schema extensions como en Supabase) ==========
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
-- En mocks locales pgcrypto a veces queda en public: moverlo a extensions (como Supabase).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension e
     JOIN pg_namespace n ON n.oid = e.extnamespace
     WHERE e.extname = 'pgcrypto' AND n.nspname <> 'extensions'
  ) THEN
    ALTER EXTENSION pgcrypto SET SCHEMA extensions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'famly_o6: no se pudo mover pgcrypto a extensions (%).', SQLERRM;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'citext') THEN
    EXECUTE 'CREATE EXTENSION citext WITH SCHEMA extensions';
  END IF;
END $$;
GRANT USAGE ON SCHEMA extensions TO postgres, service_role;
-- Resolver tipo citext aunque viva en extensions
DO $$
BEGIN
  IF to_regtype('extensions.citext') IS NULL AND to_regtype('citext') IS NOT NULL THEN
    RAISE NOTICE 'famly_o6: citext en schema distinto de extensions; se usará el tipo visible';
  END IF;
END $$;

-- ========== Nick: 5–20, [a-z0-9_-] (regla O1; CON guion) ==========
-- Alinea CHECK de familia_familias si aún permite '-' u otro patrón.
DO $$
DECLARE c text;
BEGIN
  IF to_regclass('public.familia_familias') IS NULL THEN
    RAISE NOTICE 'famly_o6: familia_familias ausente; se omite ajuste de nick';
    RETURN;
  END IF;
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'public.familia_familias'::regclass
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%nickname%'
  LOOP
    EXECUTE format('ALTER TABLE public.familia_familias DROP CONSTRAINT IF EXISTS %I', c);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.familia_familias'::regclass
       AND conname = 'familia_familias_nick_fmt'
  ) THEN
    ALTER TABLE public.familia_familias
      ADD CONSTRAINT familia_familias_nick_fmt
      CHECK (nickname ~ '^[a-z0-9_-]{5,20}$');
  END IF;
END $$;

-- ========== I21: miembros se desactivan (columna activo) ==========
DO $$
BEGIN
  IF to_regclass('public.familia_miembros') IS NULL THEN RETURN; END IF;
  ALTER TABLE public.familia_miembros
    ADD COLUMN IF NOT EXISTS activo boolean NOT NULL DEFAULT true;
END $$;

-- ========== I20: máx 10 miembros activos por familia (BEFORE INSERT + lock) ==========
CREATE OR REPLACE FUNCTION public.familia_miembros_tope_10()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE n int;
BEGIN
  IF NEW.familia_id IS NULL THEN
    RETURN NEW;
  END IF;
  -- Lock de la casa para serializar altas concurrentes
  PERFORM 1 FROM public.familia_familias WHERE id = NEW.familia_id FOR UPDATE;
  SELECT count(*)::int INTO n
    FROM public.familia_miembros
   WHERE familia_id = NEW.familia_id
     AND coalesce(activo, true) = true;
  -- El INSERT aún no cuenta; si ya hay 10 activos, rechazar
  IF n >= 10 THEN
    RAISE EXCEPTION 'familia_miembros: máximo 10 miembros activos por familia'
      USING ERRCODE = 'check_violation',
            HINT = 'famly_o6_tope_miembros';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS familia_miembros_tope_10_bi ON public.familia_miembros;
DO $$
BEGIN
  IF to_regclass('public.familia_miembros') IS NOT NULL THEN
    CREATE TRIGGER familia_miembros_tope_10_bi
      BEFORE INSERT ON public.familia_miembros
      FOR EACH ROW
      EXECUTE FUNCTION public.familia_miembros_tope_10();
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.familia_miembros_tope_10() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_miembros_tope_10() TO service_role;

-- ========== Tabla familia_invitaciones (I1,I2,I12,I15) ==========
CREATE TABLE IF NOT EXISTS public.familia_invitaciones (
  id            bigserial PRIMARY KEY,
  -- Solo hash sha256 hex (64 chars). El token plano se devuelve UNA vez al emitir.
  token_hash    text NOT NULL,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  vence_en      timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  usado_en      timestamptz NULL,
  usado_por     bigint NULL,           -- familia_id creada al canjear (lo rellena BE)
  revocado_en   timestamptz NULL,
  nota          text NULL,             -- opcional, sin PII
  CONSTRAINT familia_invitaciones_token_hash_len CHECK (char_length(token_hash) = 64),
  CONSTRAINT familia_invitaciones_token_hash_hex CHECK (token_hash ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS familia_invitaciones_token_hash_uidx
  ON public.familia_invitaciones (token_hash);

ALTER TABLE public.familia_invitaciones ENABLE ROW LEVEL SECURITY;
-- 0 policies a propósito
REVOKE ALL ON public.familia_invitaciones FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.familia_invitaciones TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.familia_invitaciones_id_seq TO service_role;

-- Trigger: bloquear DELETE físico (revocar con revocado_en)
CREATE OR REPLACE FUNCTION public.familia_invitaciones_bloquear_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'familia_invitaciones: DELETE físico prohibido; use revocado_en'
    USING ERRCODE = 'restrict_violation',
          HINT = 'famly_o6_inv_no_delete';
END;
$$;

DROP TRIGGER IF EXISTS familia_invitaciones_no_delete ON public.familia_invitaciones;
CREATE TRIGGER familia_invitaciones_no_delete
  BEFORE DELETE ON public.familia_invitaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.familia_invitaciones_bloquear_delete();

REVOKE ALL ON FUNCTION public.familia_invitaciones_bloquear_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_invitaciones_bloquear_delete() TO service_role;

-- ========== Tabla familia_admins (I3,I5,I13) — 1 email = 1 familia ==========
CREATE TABLE IF NOT EXISTS public.familia_admins (
  id           bigserial PRIMARY KEY,
  familia_id   bigint NOT NULL REFERENCES public.familia_familias(id),
  email        extensions.citext NOT NULL,
  clave_hash   text NOT NULL,
  activo       boolean NOT NULL DEFAULT true,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT familia_admins_email_no_vacio CHECK (length(trim(email::text)) > 3),
  CONSTRAINT familia_admins_clave_hash_no_vacio CHECK (char_length(clave_hash) >= 20)
);

CREATE UNIQUE INDEX IF NOT EXISTS familia_admins_email_uidx
  ON public.familia_admins (email);
CREATE UNIQUE INDEX IF NOT EXISTS familia_admins_familia_uidx
  ON public.familia_admins (familia_id);
CREATE INDEX IF NOT EXISTS familia_admins_familia_id_idx
  ON public.familia_admins (familia_id);

ALTER TABLE public.familia_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.familia_admins FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.familia_admins TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.familia_admins_id_seq TO service_role;

-- ========== Tabla familia_rate_limit (I18 · 5 / 15 min) ==========
CREATE TABLE IF NOT EXISTS public.familia_rate_limit (
  clave          text NOT NULL,
  ventana_inicio timestamptz NOT NULL,
  conteo         int NOT NULL DEFAULT 0 CHECK (conteo >= 0),
  PRIMARY KEY (clave, ventana_inicio)
);

ALTER TABLE public.familia_rate_limit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.familia_rate_limit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.familia_rate_limit TO service_role;

-- ========== Helpers internos ==========

-- Hash sha256 hex de un token plano (para emitir/validar/consumir)
CREATE OR REPLACE FUNCTION public.familia_invitacion_hash(p_token text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT encode(extensions.digest(coalesce(p_token,'')::text, 'sha256'::text), 'hex');
$$;

REVOKE ALL ON FUNCTION public.familia_invitacion_hash(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_invitacion_hash(text) TO service_role;

-- I4: clave ≥8, al menos una letra y un número (no vacía / no solo espacios)
CREATE OR REPLACE FUNCTION public.familia_mf_clave_ok(p_clave text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE c text := coalesce(p_clave, '');
BEGIN
  IF c <> trim(c) THEN RETURN false; END IF; -- espacios extremos
  IF length(c) < 8 THEN RETURN false; END IF;
  IF c !~ '[A-Za-z]' THEN RETURN false; END IF;
  IF c !~ '[0-9]' THEN RETURN false; END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.familia_mf_clave_ok(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_mf_clave_ok(text) TO service_role, anon, authenticated;

-- Hash bcrypt bf cost 10 (opción b)
CREATE OR REPLACE FUNCTION public.familia_mf_clave_hash(p_clave text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.familia_mf_clave_ok(p_clave) THEN
    RAISE EXCEPTION 'clave_invalida'
      USING ERRCODE = 'check_violation',
            HINT = 'famly_o6_clave',
            MESSAGE = 'La clave debe tener al menos 8 caracteres, con una letra y un número.';
  END IF;
  RETURN extensions.crypt(p_clave, extensions.gen_salt('bf', 10));
END;
$$;

REVOKE ALL ON FUNCTION public.familia_mf_clave_hash(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_mf_clave_hash(text) TO service_role;

-- Verificar clave contra hash (timing: crypt compara)
CREATE OR REPLACE FUNCTION public.familia_mf_clave_verifica(p_clave text, p_hash text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(p_hash, '') <> ''
     AND extensions.crypt(coalesce(p_clave,''), p_hash) = p_hash;
$$;

REVOKE ALL ON FUNCTION public.familia_mf_clave_verifica(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_mf_clave_verifica(text, text) TO service_role;

-- Rate limit: incrementa conteo en ventana fija; true = permitido, false = bloqueado
-- I18: 5 intentos / 15 minutos (mensaje genérico lo arma BE/FE)
CREATE OR REPLACE FUNCTION public.familia_rpc_rate_limit_tocar(
  p_clave text,
  p_max int DEFAULT 5,
  p_ventana_min int DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clave text := nullif(lower(trim(coalesce(p_clave,''))), '');
  v_win timestamptz;
  v_cnt int;
  v_max int := greatest(coalesce(p_max,5), 1);
  v_mins int := greatest(coalesce(p_ventana_min,15), 1);
BEGIN
  IF v_clave IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'datos');
  END IF;
  -- Ventana alineada a epoch (bloques de N minutos)
  v_win := to_timestamp(
    floor(extract(epoch FROM now()) / (v_mins * 60)) * (v_mins * 60)
  );
  INSERT INTO public.familia_rate_limit(clave, ventana_inicio, conteo)
  VALUES (v_clave, v_win, 1)
  ON CONFLICT (clave, ventana_inicio) DO UPDATE
    SET conteo = public.familia_rate_limit.conteo + 1
  RETURNING conteo INTO v_cnt;
  IF v_cnt > v_max THEN
    RETURN jsonb_build_object(
      'ok', false,
      'hint', 'bloqueado',
      'mensaje', 'No se pudo entrar. Inténtalo más tarde.',
      'conteo', v_cnt
    );
  END IF;
  RETURN jsonb_build_object('ok', true, 'conteo', v_cnt, 'ventana_inicio', v_win);
END;
$$;

REVOKE ALL ON FUNCTION public.familia_rpc_rate_limit_tocar(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_rpc_rate_limit_tocar(text, int, int) TO service_role;

-- ========== RPC emitir (I15 · solo service_role · cupo 9) ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_invitacion_emitir(p_nota text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token text;
  v_hash text;
  v_id bigint;
  v_vence timestamptz;
  v_n int;
BEGIN
  SELECT count(*)::int INTO v_n FROM public.familia_invitaciones;
  IF v_n >= 9 THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'cupo',
      'mensaje', 'Cupo de 9 invitaciones alcanzado.');
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := public.familia_invitacion_hash(v_token);
  v_vence := now() + interval '30 days';

  INSERT INTO public.familia_invitaciones(token_hash, vence_en, nota)
  VALUES (v_hash, v_vence, nullif(trim(coalesce(p_nota,'')), ''))
  RETURNING id INTO v_id;

  -- Token plano SOLO en esta respuesta (no se persiste)
  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'token', v_token,
    'vence_en', v_vence
  );
END;
$$;

REVOKE ALL ON FUNCTION public.familia_rpc_invitacion_emitir(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_rpc_invitacion_emitir(text) TO service_role;

-- ========== RPC validar (I1,I2 · hint genérico) ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_invitacion_validar(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash text;
  r public.familia_invitaciones%ROWTYPE;
BEGIN
  IF coalesce(p_token,'') = '' OR char_length(p_token) < 32 THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'no_disponible',
      'mensaje', 'Este enlace no está disponible.');
  END IF;
  v_hash := public.familia_invitacion_hash(p_token);
  SELECT * INTO r FROM public.familia_invitaciones WHERE token_hash = v_hash;
  IF NOT FOUND
     OR r.revocado_en IS NOT NULL
     OR r.usado_en IS NOT NULL
     OR r.vence_en <= now() THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'no_disponible',
      'mensaje', 'Este enlace no está disponible.');
  END IF;
  -- Válida: no filtrar PII ni ids de otras casas
  RETURN jsonb_build_object('ok', true, 'hint', 'valida', 'vence_en', r.vence_en);
END;
$$;

REVOKE ALL ON FUNCTION public.familia_rpc_invitacion_validar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_invitacion_validar(text)
  TO anon, authenticated, service_role;

-- ========== RPC revocar (I15 · solo service_role) ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_invitacion_revocar(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE r public.familia_invitaciones%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.familia_invitaciones WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'no_disponible',
      'mensaje', 'Este enlace no está disponible.');
  END IF;
  IF r.revocado_en IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'hint', 'ya_revocada', 'id', r.id);
  END IF;
  UPDATE public.familia_invitaciones
     SET revocado_en = now()
   WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.familia_rpc_invitacion_revocar(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_rpc_invitacion_revocar(bigint) TO service_role;

-- ========== Helper interno consumir (FOR UPDATE) — lo llama BE en admin_registrar ==========
-- Marca un solo uso; rechaza reuso/vencida/revocada. NO crea familia (eso es BE).
CREATE OR REPLACE FUNCTION public.familia_invitacion_consumir(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.familia_invitaciones%ROWTYPE;
BEGIN
  IF coalesce(p_token_hash,'') !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'no_disponible',
      'mensaje', 'Este enlace no está disponible.');
  END IF;

  SELECT * INTO r
    FROM public.familia_invitaciones
   WHERE token_hash = p_token_hash
   FOR UPDATE;

  IF NOT FOUND
     OR r.revocado_en IS NOT NULL
     OR r.usado_en IS NOT NULL
     OR r.vence_en <= now() THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'no_disponible',
      'mensaje', 'Este enlace no está disponible.');
  END IF;

  UPDATE public.familia_invitaciones
     SET usado_en = now()
   WHERE id = r.id;

  RETURN jsonb_build_object('ok', true, 'invitacion_id', r.id);
END;
$$;

REVOKE ALL ON FUNCTION public.familia_invitacion_consumir(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_invitacion_consumir(text) TO service_role;

-- Marca usado_por = familia_id tras crear la casa (BE)
CREATE OR REPLACE FUNCTION public.familia_invitacion_vincular_familia(
  p_invitacion_id bigint,
  p_familia_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.familia_invitaciones
     SET usado_por = p_familia_id
   WHERE id = p_invitacion_id
     AND usado_en IS NOT NULL
     AND usado_por IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'estado');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.familia_invitacion_vincular_familia(bigint, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_invitacion_vincular_familia(bigint, bigint)
  TO service_role;

-- ========== I19: reset clave solo superadmin (service_role) ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_admin_reset_clave(
  p_email text,
  p_nueva_clave text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email extensions.citext := nullif(lower(trim(coalesce(p_email,''))), '');
  v_hash text;
  n int;
BEGIN
  IF v_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'datos');
  END IF;
  IF NOT public.familia_mf_clave_ok(p_nueva_clave) THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'clave',
      'mensaje', 'La clave debe tener al menos 8 caracteres, con una letra y un número.');
  END IF;
  v_hash := public.familia_mf_clave_hash(p_nueva_clave);
  UPDATE public.familia_admins
     SET clave_hash = v_hash
   WHERE email = v_email AND activo = true;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    -- Mensaje genérico: no revelar si el email existe
    RETURN jsonb_build_object('ok', false, 'hint', 'no_disponible',
      'mensaje', 'No se pudo restablecer.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.familia_rpc_admin_reset_clave(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_rpc_admin_reset_clave(text, text) TO service_role;

-- ========== Comentarios ==========
COMMENT ON TABLE public.familia_invitaciones IS
  'O6 FAMLY: invitaciones de un solo uso (hash sha256), 30d, revocables. Cupo 9. Sin token plano.';
COMMENT ON TABLE public.familia_admins IS
  'O6 FAMLY: admin dueño por familia; email citext UNIQUE; clave bcrypt. 1 email = 1 familia.';
COMMENT ON TABLE public.familia_rate_limit IS
  'O6 FAMLY: contador por clave+ventana (entrada admin 5/15min).';
COMMENT ON FUNCTION public.familia_invitacion_consumir(text) IS
  'Helper interno FOR UPDATE: marca invitación usada. BE lo llama desde admin_registrar.';
