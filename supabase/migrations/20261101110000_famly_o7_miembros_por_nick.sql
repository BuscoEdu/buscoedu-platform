-- =====================================================================
-- Ola 7b · punto 1 · Login miembro: apodo → lista desplegable → PIN
-- Autor: Backend BuscoEdu (bot) · 2026-10-31 · aplica BD (copia → prod)
-- RPC anon: devuelve SOLO {miembro_id, nombre, inicial} de miembros activos
-- NO-admin de una familia activa. Nada de pin, puntos, rol, alias, email.
-- Nota privacidad: revierte la decisión O1 («resolver sin lista»); lo pide
-- Jhon t907u. Anti-enumeración: misma forma de respuesta si el apodo no
-- existe + rate limit por apodo y global (familia_rpc_rate_limit_tocar).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.familia_rpc_miembros_por_nick(p_nickname text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_nick text := public.familia_mf_norm_nick(p_nickname);
  v_fid  bigint;
  v_rl   jsonb;
  v_lista jsonb;
BEGIN
  -- Bloque 1: formato del apodo (mismo criterio que el resolver)
  IF v_nick IS NULL OR char_length(v_nick) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'nick_invalido');
  END IF;

  -- Bloque 2: rate limit ANTES de consultar (20/15 min por apodo, 120/15 min global)
  v_rl := public.familia_rpc_rate_limit_tocar('o7_lista:' || v_nick, 20, 15);
  IF coalesce((v_rl->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'bloqueado',
      'mensaje', 'Demasiados intentos. Espera un momento.');
  END IF;
  v_rl := public.familia_rpc_rate_limit_tocar('o7_lista:global', 120, 15);
  IF coalesce((v_rl->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'bloqueado',
      'mensaje', 'Demasiados intentos. Espera un momento.');
  END IF;

  -- Bloque 3: familia activa (si no existe → misma respuesta genérica)
  SELECT id INTO v_fid FROM public.familia_familias
   WHERE lower(nickname) = v_nick AND estado = 'activa';
  IF v_fid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'no_encontrada');
  END IF;

  -- Bloque 4: lista mínima (sin admin: el admin entra por correo+clave)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'miembro_id', m.id,
           'nombre', m.nombre,
           'inicial', upper(left(m.nombre, 1))
         ) ORDER BY m.nombre), '[]'::jsonb)
    INTO v_lista
    FROM public.familia_miembros m
   WHERE m.familia_id = v_fid
     AND coalesce(m.activo, true) IS TRUE
     AND coalesce(m.es_admin, false) IS FALSE
     AND coalesce(m.alias_entrada, '') <> '';

  RETURN jsonb_build_object('ok', true, 'familia_id', v_fid, 'miembros', v_lista);
END $$;

COMMENT ON FUNCTION public.familia_rpc_miembros_por_nick(text) IS
  'O7: apodo → lista mínima de miembros activos no-admin para el desplegable del login. Rate limit 20/15 por apodo + 120/15 global.';
REVOKE ALL ON FUNCTION public.familia_rpc_miembros_por_nick(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_miembros_por_nick(text) TO anon, authenticated, service_role;

-- Bloque 5: login por miembro_id (el desplegable no expone alias_entrada).
-- Reusa familia_rpc_login_miembro (mismo bloqueo 5 fallos/15 min por alias).
CREATE OR REPLACE FUNCTION public.familia_rpc_login_miembro_id(
  p_familia_id bigint, p_miembro_id bigint, p_pin text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_alias text;
BEGIN
  SELECT alias_entrada INTO v_alias FROM public.familia_miembros
   WHERE id = p_miembro_id AND familia_id = p_familia_id
     AND coalesce(activo, true) IS TRUE AND coalesce(es_admin, false) IS FALSE;
  IF v_alias IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'datos', 'mensaje', 'Datos incorrectos');
  END IF;
  RETURN public.familia_rpc_login_miembro(p_familia_id, v_alias, p_pin);
END $$;
REVOKE ALL ON FUNCTION public.familia_rpc_login_miembro_id(bigint,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_login_miembro_id(bigint,bigint,text) TO anon, authenticated, service_role;
