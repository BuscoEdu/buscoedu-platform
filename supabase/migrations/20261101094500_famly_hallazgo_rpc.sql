-- FAMLY · RPC familia_rpc_admin_hallazgo_crear
-- Fecha: 2026-10-31 Europe/Madrid · Quién: Backend BuscoEdu (bot)
-- Tabla: public.famly_hallazgos (BD 7aa93b1 / 20261101090000). ✗ no recrear DDL.
-- Inserta familia_id + miembro_id (admin sesión); sin admin_id (no existe en tabla).
-- Soft BD: borrado_en. estado default 'nuevo'. Sesión x-familia-token.
-- Rate ≤20/h por miembro admin vía familia_rpc_rate_limit_tocar.
-- Contrato: multifamilia/contrato-hallazgos.md

-- ========== Guarda puntos ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  IF to_regclass('public.familia_miembros') IS NULL THEN RETURN; END IF;
  SELECT array_agg(puntos ORDER BY id) INTO v
    FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS NOT NULL AND cardinality(v) = 6 AND v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'hallazgo_rpc_guarda_pts: puntos=% esperado=%', v, esperado;
  END IF;
END $$;

-- ========== Exigir tabla BD ==========
DO $$
BEGIN
  IF to_regclass('public.famly_hallazgos') IS NULL THEN
    RAISE EXCEPTION 'hallazgo_rpc: falta public.famly_hallazgos (aplicar migración BD 20261101090000 primero)';
  END IF;
END $$;

-- ========== RPC ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_admin_hallazgo_crear(
  p_tipo text,
  p_descripcion text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  ctx record;
  v_tipo text := lower(trim(coalesce(p_tipo, '')));
  v_desc text := trim(coalesce(p_descripcion, ''));
  v_rl jsonb;
  v_id bigint;
  v_msg text := 'No se pudo guardar.';
BEGIN
  -- Sesión (header x-familia-token / GUC app.*)
  SELECT * INTO ctx FROM public.familia_mf_sesion_ctx() LIMIT 1;
  IF ctx.familia_id IS NULL OR ctx.miembro_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'sesion', 'mensaje', v_msg);
  END IF;

  -- Solo padre_admin activo de su casa
  IF NOT EXISTS (
    SELECT 1 FROM public.familia_miembros m
     WHERE m.id = ctx.miembro_id
       AND m.familia_id = ctx.familia_id
       AND coalesce(m.rol_v6d, '') = 'padre_admin'
       AND coalesce(m.activo, true) IS TRUE
  ) THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'sesion', 'mensaje', v_msg);
  END IF;

  IF v_tipo NOT IN ('error', 'sugerencia') THEN
    RETURN jsonb_build_object(
      'ok', false, 'hint', 'tipo',
      'mensaje', 'Elige error o sugerencia.'
    );
  END IF;

  IF char_length(v_desc) < 5 OR char_length(v_desc) > 2000 THEN
    RETURN jsonb_build_object(
      'ok', false, 'hint', 'descripcion',
      'mensaje', 'La descripción debe tener entre 5 y 2000 caracteres.'
    );
  END IF;

  -- ≤20 / hora por admin (clave = miembro_id del padre_admin; tabla sin admin_id)
  v_rl := public.familia_rpc_rate_limit_tocar(
    'o6_hallazgo:' || ctx.miembro_id::text, 20, 60
  );
  IF coalesce((v_rl->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false, 'hint', 'bloqueado',
      'mensaje', 'Demasiados envíos. Inténtalo más tarde.'
    );
  END IF;

  INSERT INTO public.famly_hallazgos(
    familia_id, miembro_id, tipo, descripcion
  ) VALUES (
    ctx.familia_id, ctx.miembro_id, v_tipo, v_desc
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

COMMENT ON FUNCTION public.familia_rpc_admin_hallazgo_crear(text, text) IS
  'FAMLY: admin crea hallazgo en famly_hallazgos (error|sugerencia). Sesión x-familia-token. Rate 20/h.';

REVOKE ALL ON FUNCTION public.familia_rpc_admin_hallazgo_crear(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_admin_hallazgo_crear(text, text)
  TO anon, authenticated, service_role;

-- ========== Guarda final ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  IF to_regclass('public.familia_miembros') IS NULL THEN RETURN; END IF;
  SELECT array_agg(puntos ORDER BY id) INTO v
    FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS NOT NULL AND cardinality(v) = 6 AND v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'hallazgo_rpc_guarda_pts_post: %', v;
  END IF;
END $$;
