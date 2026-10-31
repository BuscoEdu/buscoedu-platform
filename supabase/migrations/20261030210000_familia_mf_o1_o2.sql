-- MF O1+O2 · Multi-familia cimientos + login nick/alias/PIN (30/10/2026)
-- Reversible en espíritu: solo ADD COLUMN / CREATE (no DROP de datos).
-- Nickname #1 = beman27 (case-insensitive, guardado en minúsculas).
-- NO modifica puntos ni historial de miembros.

-- ========== O1: familias + familia_id + alias ==========
CREATE TABLE IF NOT EXISTS public.familia_familias (
  id              bigserial PRIMARY KEY,
  nombre_visible  text NOT NULL DEFAULT '',
  nickname        text NOT NULL,
  link_token      text UNIQUE,
  admin_auth_user_id uuid,
  estado          text NOT NULL DEFAULT 'activa'
                  CHECK (estado IN ('activa','suspendida')),
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT familia_familias_nick_len CHECK (char_length(nickname) BETWEEN 5 AND 20),
  CONSTRAINT familia_familias_nick_chars CHECK (nickname ~ '^[a-z0-9_-]+$')
);

-- Unicidad case-insensitive (nickname ya normalizado a lower, refuerzo por índice)
CREATE UNIQUE INDEX IF NOT EXISTS familia_familias_nickname_uidx
  ON public.familia_familias (lower(nickname));

-- Familia #1 beman27 (idempotente)
INSERT INTO public.familia_familias (id, nombre_visible, nickname, link_token, estado)
SELECT 1, 'Familia Bejarano', 'beman27', encode(gen_random_bytes(12), 'hex'), 'activa'
WHERE NOT EXISTS (SELECT 1 FROM public.familia_familias WHERE id = 1 OR lower(nickname) = 'beman27');

-- Asegurar secuencia del bigserial por encima de 1
SELECT setval(pg_get_serial_sequence('public.familia_familias','id'),
  GREATEST((SELECT coalesce(max(id),1) FROM public.familia_familias), 1));

-- Helper: añadir familia_id si falta
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'familia_miembros','familia_tareas','familia_deberes','familia_series',
    'familia_premios','familia_solicitudes_premios','familia_historial',
    'familia_notificaciones','familia_mensajes','familia_plantillas_tareas',
    'familia_multas','familia_multas_niveles','familia_multas_aplicadas',
    'familia_config','familia_agenda_actividades','familia_agenda_excepciones',
    'familia_mesadas','familia_mesada_periodos','familia_fotos_storage_borrar',
    'familia_metas','familia_badges','familia_v6c_aplicaciones','familia_sesiones',
    'familia_permisos'
  ]
  LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name=t AND column_name='familia_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN familia_id bigint REFERENCES public.familia_familias(id)', t);
    END IF;
  END LOOP;
END $$;

-- Alias de entrada en miembros
ALTER TABLE public.familia_miembros
  ADD COLUMN IF NOT EXISTS alias_entrada text;

-- Backfill familia_id = 1 (solo NULL)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'familia_miembros','familia_tareas','familia_deberes','familia_series',
    'familia_premios','familia_solicitudes_premios','familia_historial',
    'familia_notificaciones','familia_mensajes','familia_plantillas_tareas',
    'familia_multas','familia_multas_niveles','familia_multas_aplicadas',
    'familia_config','familia_agenda_actividades','familia_agenda_excepciones',
    'familia_mesadas','familia_mesada_periodos','familia_fotos_storage_borrar',
    'familia_metas','familia_badges','familia_v6c_aplicaciones','familia_sesiones',
    'familia_permisos'
  ]
  LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('UPDATE public.%I SET familia_id = 1 WHERE familia_id IS NULL', t);
  END LOOP;
END $$;

-- Alias sugeridos (idempotente si ya hay valor)
UPDATE public.familia_miembros SET alias_entrada = CASE id
  WHEN 1 THEN 'jhon'
  WHEN 2 THEN 'shirley'
  WHEN 3 THEN 'juanes'
  WHEN 4 THEN 'sara'
  WHEN 5 THEN 'mariana'
  WHEN 6 THEN 'isabella'
  ELSE lower(regexp_replace(coalesce(nombre,'m'||id), '[^a-zA-Z0-9]+', '', 'g'))
END
WHERE alias_entrada IS NULL OR alias_entrada = '';

-- Normalizar alias a minúsculas
UPDATE public.familia_miembros SET alias_entrada = lower(alias_entrada) WHERE alias_entrada IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS familia_miembros_familia_alias_uidx
  ON public.familia_miembros (familia_id, lower(alias_entrada))
  WHERE alias_entrada IS NOT NULL;

CREATE INDEX IF NOT EXISTS familia_tareas_familia_id_idx ON public.familia_tareas (familia_id);
CREATE INDEX IF NOT EXISTS familia_notifs_familia_id_idx ON public.familia_notificaciones (familia_id);
CREATE INDEX IF NOT EXISTS familia_hist_familia_id_idx ON public.familia_historial (familia_id);
CREATE INDEX IF NOT EXISTS familia_miembros_familia_id_idx ON public.familia_miembros (familia_id);

-- Intentos de login (límite fuerza bruta)
CREATE TABLE IF NOT EXISTS public.familia_login_intentos (
  id bigserial PRIMARY KEY,
  familia_id bigint NOT NULL REFERENCES public.familia_familias(id),
  alias_norm text NOT NULL,
  fallos int NOT NULL DEFAULT 0,
  bloqueado_hasta timestamptz,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (familia_id, alias_norm)
);

REVOKE ALL ON public.familia_familias FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.familia_login_intentos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.familia_familias TO service_role;
GRANT ALL ON public.familia_login_intentos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.familia_familias_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.familia_login_intentos_id_seq TO service_role;

-- ========== O2: RPCs resolver + login + C4 ==========

-- Normaliza nick/alias de entrada
CREATE OR REPLACE FUNCTION public.familia_mf_norm_nick(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(lower(trim(coalesce(p,''))), '');
$$;

-- C4: ¿PIN seguro? (para crear/cambiar; login aún acepta PINs legacy)
CREATE OR REPLACE FUNCTION public.familia_mf_pin_seguro(p_pin text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE p text := coalesce(p_pin,'');
BEGIN
  IF char_length(p) < 4 OR char_length(p) > 8 THEN RETURN false; END IF;
  IF p !~ '^[0-9a-zA-Z]+$' THEN RETURN false; END IF;
  IF lower(p) IN ('oooo','0000','1111','1234','4321','abcd','aaaa','2222','3333','4444','5555','6666','7777','8888','9999') THEN
    RETURN false;
  END IF;
  RETURN true;
END $$;

-- Resolver nickname: solo confirma existencia + id (sin nombres de miembros)
CREATE OR REPLACE FUNCTION public.familia_rpc_resolver_nickname(p_nickname text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_nick text := public.familia_mf_norm_nick(p_nickname);
  f public.familia_familias%ROWTYPE;
BEGIN
  IF v_nick IS NULL OR char_length(v_nick) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'nick_invalido');
  END IF;
  SELECT * INTO f FROM public.familia_familias WHERE lower(nickname) = v_nick AND estado = 'activa';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'no_encontrada');
  END IF;
  -- Sin nombre_visible ni lista de miembros (decisión privacidad)
  RETURN jsonb_build_object('ok', true, 'familia_id', f.id);
END $$;

REVOKE ALL ON FUNCTION public.familia_rpc_resolver_nickname(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_resolver_nickname(text) TO anon, authenticated, service_role;

-- Login alias+PIN dentro de una familia
CREATE OR REPLACE FUNCTION public.familia_rpc_login_miembro(
  p_familia_id bigint,
  p_alias text,
  p_pin text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_alias text := public.familia_mf_norm_nick(p_alias);
  m public.familia_miembros%ROWTYPE;
  v_fallos int;
  v_bloq timestamptz;
  v_tok uuid;
BEGIN
  IF p_familia_id IS NULL OR v_alias IS NULL OR coalesce(p_pin,'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'datos');
  END IF;

  SELECT fallos, bloqueado_hasta INTO v_fallos, v_bloq
    FROM public.familia_login_intentos
   WHERE familia_id = p_familia_id AND alias_norm = v_alias;
  IF v_bloq IS NOT NULL AND v_bloq > now() THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'bloqueado',
      'mensaje', 'Demasiados intentos. Espera un momento.');
  END IF;

  SELECT * INTO m FROM public.familia_miembros
   WHERE familia_id = p_familia_id AND lower(alias_entrada) = v_alias
   LIMIT 1;

  IF NOT FOUND OR coalesce(m.pin,'') <> p_pin THEN
    INSERT INTO public.familia_login_intentos(familia_id, alias_norm, fallos, bloqueado_hasta, actualizado_en)
    VALUES (p_familia_id, v_alias, 1,
      CASE WHEN 1 >= 5 THEN now() + interval '15 minutes' ELSE NULL END, now())
    ON CONFLICT (familia_id, alias_norm) DO UPDATE SET
      fallos = public.familia_login_intentos.fallos + 1,
      bloqueado_hasta = CASE
        WHEN public.familia_login_intentos.fallos + 1 >= 5 THEN now() + interval '15 minutes'
        ELSE public.familia_login_intentos.bloqueado_hasta END,
      actualizado_en = now();
    RETURN jsonb_build_object('ok', false, 'hint', 'datos',
      'mensaje', 'Datos incorrectos');
  END IF;

  -- Éxito: reset intentos + sesión
  DELETE FROM public.familia_login_intentos WHERE familia_id = p_familia_id AND alias_norm = v_alias;
  v_tok := gen_random_uuid();
  INSERT INTO public.familia_sesiones(token, miembro_id, familia_id, creado_en, expira_en)
  VALUES (v_tok, m.id, p_familia_id, now(), now() + interval '30 days');

  RETURN jsonb_build_object(
    'ok', true,
    'miembro_id', m.id,
    'familia_id', p_familia_id,
    'token', v_tok,
    'nombre', m.nombre,
    'alias', m.alias_entrada,
    'rol_v6d', coalesce(m.rol_v6d, CASE WHEN m.es_admin THEN 'padre_admin' ELSE 'hijo' END),
    'pin_debil', NOT public.familia_mf_pin_seguro(m.pin)
  );
END $$;

REVOKE ALL ON FUNCTION public.familia_rpc_login_miembro(bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_login_miembro(bigint,text,text) TO anon, authenticated, service_role;

-- Validar PIN nuevo (C4) — para hojas de cambio PIN
CREATE OR REPLACE FUNCTION public.familia_rpc_validar_pin_seguro(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.familia_mf_pin_seguro(p_pin) THEN
    RETURN jsonb_build_object('ok', true);
  END IF;
  RETURN jsonb_build_object('ok', false, 'mensaje',
    'Elige un PIN de 4 a 8 caracteres. No uses 0000, oooo, 1111 ni 1234.');
END $$;

REVOKE ALL ON FUNCTION public.familia_rpc_validar_pin_seguro(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_validar_pin_seguro(text) TO anon, authenticated, service_role;

-- Lectura mínima post-login: miembros de UNA familia (sin filtrar en cliente a ciegas)
CREATE OR REPLACE FUNCTION public.familia_rpc_miembros_familia(p_familia_id bigint, p_actor_id integer)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a public.familia_miembros%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.familia_miembros WHERE id = p_actor_id AND familia_id = p_familia_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sin permiso' USING HINT='v6e_mf_perm';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id)
      FROM public.familia_miembros m WHERE m.familia_id = p_familia_id
  ), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.familia_rpc_miembros_familia(bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_miembros_familia(bigint,integer) TO anon, authenticated, service_role;
