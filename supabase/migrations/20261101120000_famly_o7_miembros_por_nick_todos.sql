-- Fix: familia_rpc_miembros_por_nick debe listar papás Y hijos (no solo hijos)
-- para el select de login "¿Quién eres?"

CREATE OR REPLACE FUNCTION public.familia_rpc_miembros_por_nick(p_nickname text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fid bigint;
  v_list jsonb;
BEGIN
  -- Normalizar nick
  p_nickname := lower(trim(coalesce(p_nickname, '')));
  IF char_length(p_nickname) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'nick_invalido', 'mensaje', 'Escribe el apodo de la familia');
  END IF;

  SELECT id INTO v_fid
  FROM public.familia_familias
  WHERE lower(nickname) = p_nickname
    AND estado = 'activa'
  LIMIT 1;

  IF v_fid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'no_encontrada', 'mensaje', 'No encontramos esa familia');
  END IF;

  -- Todos los miembros activos (papás e hijos)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'miembro_id', m.id,
    'id', m.id,
    'nombre', m.nombre,
    'inicial', upper(left(coalesce(m.nombre, '?'), 1)),
    'alias', m.alias_entrada,
    'rol', coalesce(m.rol_v6d, CASE WHEN m.es_admin THEN 'padre' ELSE 'hijo' END),
    'activo', coalesce(m.activo, true)
  ) ORDER BY
    CASE WHEN coalesce(m.rol_v6d, CASE WHEN m.es_admin THEN 'padre' ELSE 'hijo' END) LIKE 'padre%' THEN 0 ELSE 1 END,
    m.nombre
  ), '[]'::jsonb)
  INTO v_list
  FROM public.familia_miembros m
  WHERE m.familia_id = v_fid
    AND coalesce(m.activo, true) = true;

  RETURN jsonb_build_object(
    'ok', true,
    'familia_id', v_fid,
    'miembros', v_list
  );
END;
$$;

COMMENT ON FUNCTION public.familia_rpc_miembros_por_nick(text) IS
  'Login O7: lista TODOS los miembros activos (papás e hijos) por nickname de familia. Sin PIN.';

REVOKE ALL ON FUNCTION public.familia_rpc_miembros_por_nick(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_miembros_por_nick(text)
  TO anon, authenticated, service_role;
