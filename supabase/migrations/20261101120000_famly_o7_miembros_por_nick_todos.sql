-- =====================================================================
-- Ola 9b / FE · 2026-10-31 · Frontend BuscoEdu (bot)
-- Este archivo lo añadió FAMLY Bot (NO aplicado). Su contenido original
-- redefinía familia_rpc_miembros_por_nick SIN rate limit y exponiendo
-- alias y rol a anon: si alguien hacía db push, pisaba O7b (ya en prod).
-- Se sustituye el CONTENIDO por los bloques 1–2 de
-- supabase/ops/20261031224500_famly_o7b_padres_en_lista.sql para que un
-- db push futuro conserve O7b: rate limit + lista mínima (sin alias/rol).
-- NO borrar ni renombrar este archivo (evita que db push «eche de menos»
-- la migración). No ejecutar desde aquí; O7b ya está aplicada vía ops.
-- =====================================================================

-- Bloque 1: la lista ya no excluye es_admin ni filtra por PIN/alias: todos los activos
CREATE OR REPLACE FUNCTION public.familia_rpc_miembros_por_nick(p_nickname text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_nick text := public.familia_mf_norm_nick(p_nickname);
  v_fid  bigint;
  v_rl   jsonb;
  v_lista jsonb;
BEGIN
  -- Formato del apodo (mismo criterio que el resolver)
  IF v_nick IS NULL OR char_length(v_nick) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'nick_invalido');
  END IF;
  -- Rate limit ANTES de consultar (20/15 min por apodo, 120/15 min global)
  v_rl := public.familia_rpc_rate_limit_tocar('o7_lista:' || v_nick, 20, 15);
  IF coalesce((v_rl->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'bloqueado', 'mensaje', 'Demasiados intentos. Espera un momento.');
  END IF;
  v_rl := public.familia_rpc_rate_limit_tocar('o7_lista:global', 120, 15);
  IF coalesce((v_rl->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'bloqueado', 'mensaje', 'Demasiados intentos. Espera un momento.');
  END IF;
  -- Familia activa (si no existe → misma respuesta genérica)
  SELECT id INTO v_fid FROM public.familia_familias WHERE lower(nickname) = v_nick AND estado = 'activa';
  IF v_fid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'no_encontrada');
  END IF;
  -- Lista mínima: todos los activos (hijos + padres + admin); solo id, nombre, inicial
  SELECT coalesce(jsonb_agg(jsonb_build_object('miembro_id', m.id, 'nombre', m.nombre,
           'inicial', upper(left(m.nombre, 1))) ORDER BY m.nombre), '[]'::jsonb)
    INTO v_lista
    FROM public.familia_miembros m
   WHERE m.familia_id = v_fid
     AND coalesce(m.activo, true) IS TRUE;
  RETURN jsonb_build_object('ok', true, 'familia_id', v_fid, 'miembros', v_lista);
END $function$;

-- Bloque 2: el login por id acepta padres/admin, pero sigue exigiendo PIN (y alias para el login interno)
CREATE OR REPLACE FUNCTION public.familia_rpc_login_miembro_id(p_familia_id bigint, p_miembro_id bigint, p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_alias text;
BEGIN
  SELECT alias_entrada INTO v_alias FROM public.familia_miembros
   WHERE id = p_miembro_id AND familia_id = p_familia_id
     AND coalesce(activo, true) IS TRUE
     AND coalesce(pin, '') <> '';
  IF v_alias IS NULL OR v_alias = '' THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'datos', 'mensaje', 'Datos incorrectos');
  END IF;
  RETURN public.familia_rpc_login_miembro(p_familia_id, v_alias, p_pin);
END $function$;
