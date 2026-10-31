-- =====================================================================
-- O9d · familia_rpc_resetear_todo solo para la familia de la sesión (Ola 9b · GO Orq)
-- Autor: BD BuscoEdu (bot) · 2026-10-31
-- Hallazgo: la versión previa (p_actor_id, p_confirmacion, p_client_req_id) archivaba tareas e
-- historial y ponía en 0 los puntos de TODAS las familias, y confiaba en el p_actor_id del cliente.
-- Ahora: fid tomado de la sesión (x-familia-token) · actor = de la sesión o el enviado, siempre de
-- esa familia y admin · soft delete (archivada_en) · ✗ delete físico · acepta las 2 formas de llamada del FE.
-- Deshacer: 20261031232000_famly_o9d_resetear_por_familia_deshacer.sql
-- =====================================================================
BEGIN;

-- Bloque 0: respaldo de la definición anterior (para el deshacer)
CREATE TABLE IF NOT EXISTS respaldos.familia_o9d_fn_previo (firma text PRIMARY KEY, def text, respaldado_en timestamptz DEFAULT now());
REVOKE ALL ON respaldos.familia_o9d_fn_previo FROM anon, authenticated;
INSERT INTO respaldos.familia_o9d_fn_previo(firma, def)
  SELECT 'familia_rpc_resetear_todo(integer,text,text)', pg_get_functiondef('public.familia_rpc_resetear_todo(integer,text,text)'::regprocedure)
   WHERE to_regprocedure('public.familia_rpc_resetear_todo(integer,text,text)') IS NOT NULL
  ON CONFLICT (firma) DO NOTHING;

-- Bloque 1: una sola firma con valores por defecto (evita ambigüedad de sobrecarga en PostgREST)
DROP FUNCTION IF EXISTS public.familia_rpc_resetear_todo(integer, text, text);
CREATE OR REPLACE FUNCTION public.familia_rpc_resetear_todo(
  p_confirmacion  text,
  p_actor_id      integer DEFAULT NULL,
  p_client_req_id text    DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE
  v_fid bigint; v_mid integer; v_a public.familia_miembros%ROWTYPE;
  v_t integer; v_h integer; v_m integer; v_ahora timestamptz := now(); v_req text; v_pref text;
BEGIN
  -- 1. Familia y miembro desde la sesión (fail-closed si no hay sesión válida)
  SELECT s.familia_id, s.miembro_id INTO v_fid, v_mid FROM public.familia_mf_sesion_ctx() s LIMIT 1;
  IF v_fid IS NULL THEN RAISE EXCEPTION 'sesión requerida para resetear'; END IF;

  -- 2. Actor: el de la sesión manda; si la sesión no trae miembro, se usa el enviado. Debe ser admin de ESA familia.
  SELECT * INTO v_a FROM public.familia_miembros
   WHERE id = coalesce(v_mid, p_actor_id) AND familia_id = v_fid AND coalesce(activo, true);
  IF v_a.id IS NULL OR NOT public.familia_es_admin(v_a) THEN RAISE EXCEPTION 'solo un padre de esta familia puede resetear'; END IF;
  IF p_actor_id IS NOT NULL AND p_actor_id <> v_a.id THEN RAISE EXCEPTION 'actor no coincide con la sesión'; END IF;
  IF p_confirmacion IS DISTINCT FROM 'RESETEAR' THEN RAISE EXCEPTION 'confirmación inválida (escribe RESETEAR)'; END IF;

  -- 3. Idempotencia por familia
  v_req := coalesce(nullif(trim(p_client_req_id), ''), 'reset-' || gen_random_uuid()::text);
  v_pref := v_req || ':';
  PERFORM pg_advisory_xact_lock(hashtext('familia_reset:' || v_fid || ':' || v_req));
  IF EXISTS (SELECT 1 FROM public.familia_historial WHERE familia_id = v_fid AND left(client_req_id, length(v_pref)) = v_pref) THEN
    RETURN jsonb_build_object('ok', true, 'idempotente', true);
  END IF;

  -- 4. Bloqueo y reset sin borrar, SOLO en v_fid
  PERFORM 1 FROM public.familia_miembros WHERE familia_id = v_fid FOR UPDATE;
  UPDATE public.familia_tareas SET archivada_en = v_ahora WHERE familia_id = v_fid AND archivada_en IS NULL;
  GET DIAGNOSTICS v_t = ROW_COUNT;
  UPDATE public.familia_historial SET archivada_en = v_ahora WHERE familia_id = v_fid AND archivada_en IS NULL;
  GET DIAGNOSTICS v_h = ROW_COUNT;
  UPDATE public.familia_miembros SET puntos = 0, puntos_historicos = 0 WHERE familia_id = v_fid;
  GET DIAGNOSTICS v_m = ROW_COUNT;

  -- 5. Marca visible del reset por miembro (con familia_id explícito)
  INSERT INTO public.familia_historial(miembro_id, texto, tipo, pts, actor_id, version_regla, client_req_id, familia_id)
    SELECT m.id, 'Reset: puntos a 0', 'reset', 0, v_a.id, 1, v_pref || m.id, v_fid
      FROM public.familia_miembros m WHERE m.familia_id = v_fid;

  RETURN jsonb_build_object('ok', true, 'idempotente', false, 'familia_id', v_fid, 'tareas', v_t, 'historial', v_h, 'miembros', v_m);
END $f$;
REVOKE ALL ON FUNCTION public.familia_rpc_resetear_todo(text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_resetear_todo(text, integer, text) TO anon, authenticated;

COMMIT;
