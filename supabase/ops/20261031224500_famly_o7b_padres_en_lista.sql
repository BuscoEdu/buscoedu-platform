-- =====================================================================
-- O7b · lista de miembros por apodo = TODOS los activos (hijos + padres + admin) · bug Jhon t931u
-- Autor: BD BuscoEdu (bot) · 2026-10-31 · GO Orq + OK Jhon t934u
-- Criterio: la lista muestra a todos los miembros activos; el login por id sigue exigiendo PIN
-- (sin PIN → «Datos incorrectos» → el FE debe ofrecer «entra con correo»).
-- Deshacer: re-ejecutar supabase/migrations/20261101110000_famly_o7_miembros_por_nick.sql
-- Antes de aplicar: respaldo de las 2 definiciones en respaldos.familia_o7b_fn_previo
-- =====================================================================
BEGIN;

-- Bloque 0: respaldo de las definiciones actuales (idempotente)
CREATE TABLE IF NOT EXISTS respaldos.familia_o7b_fn_previo AS
  SELECT p.oid::regprocedure::text AS firma, pg_get_functiondef(p.oid) AS def, now() AS respaldado_en
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('familia_rpc_miembros_por_nick', 'familia_rpc_login_miembro_id');
REVOKE ALL ON respaldos.familia_o7b_fn_previo FROM anon, authenticated;

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

COMMIT;
