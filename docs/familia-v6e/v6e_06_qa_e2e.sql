-- v6e_06 · Hotfix QA E2E (30/10/2026)
-- SECURITY DEFINER en RPCs que llaman familia_v6d_actor o leen tablas auxiliares.
-- anon NO recibe EXECUTE sobre familia_v6d_actor; solo sobre estos wrappers.

-- 1) E-SU1 Subasta aceptar
CREATE OR REPLACE FUNCTION public.familia_rpc_aceptar_subasta(p_tarea_id bigint, p_actor_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE t public.familia_tareas%ROWTYPE; v_nombre text;
BEGIN
  PERFORM public.familia_v6d_actor(p_actor_id, NULL);
  SELECT * INTO t FROM public.familia_tareas WHERE id = p_tarea_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tarea no encontrada'; END IF;
  IF NOT t.en_subasta OR t.archivada_en IS NOT NULL THEN RAISE EXCEPTION 'esta tarea no está en subasta'; END IF;
  IF t.asignada_a IS NOT NULL THEN
    SELECT nombre INTO v_nombre FROM public.familia_miembros WHERE id = t.asignada_a;
    RETURN jsonb_build_object('ok', false, 'tomada_por', coalesce(v_nombre,'otro'), 'hint', 'ya_tomada');
  END IF;
  IF t.subasta_vence_en IS NOT NULL AND t.subasta_vence_en < now() THEN
    RAISE EXCEPTION 'la subasta ya cerró'; END IF;
  UPDATE public.familia_tareas SET asignada_a = p_actor_id, en_subasta = false,
    aprobada_para_hacer = true, estado = 'pendiente'
  WHERE id = p_tarea_id AND asignada_a IS NULL;
  IF NOT FOUND THEN
    SELECT nombre INTO v_nombre FROM public.familia_miembros m JOIN public.familia_tareas x ON x.asignada_a=m.id WHERE x.id=p_tarea_id;
    RETURN jsonb_build_object('ok', false, 'tomada_por', coalesce(v_nombre,'otro'), 'hint', 'ya_tomada');
  END IF;
  SELECT nombre INTO v_nombre FROM public.familia_miembros WHERE id = p_actor_id;
  INSERT INTO public.familia_historial(miembro_id, texto, tarea_id, tipo, actor_id, pts)
  VALUES (p_actor_id, 'Aceptó subasta: '||coalesce(t.titulo,'tarea'), t.id, 'tarea', p_actor_id, 0);
  INSERT INTO public.familia_notificaciones(para_id, tipo, tarea_id, texto)
  SELECT m.id, 'tarea', t.id, 'Ya la tomó '||coalesce(v_nombre,'un hermano')||': '||coalesce(t.titulo,'tarea')
    FROM public.familia_miembros m
   WHERE coalesce(m.rol_v6d,'hijo') = 'hijo' AND m.id <> p_actor_id;
  RETURN jsonb_build_object('ok', true, 'asignada_a', p_actor_id);
END $function$;

REVOKE ALL ON FUNCTION public.familia_rpc_aceptar_subasta(bigint, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_aceptar_subasta(bigint, integer) TO anon, authenticated, service_role;

-- 2) Otras RPCs v6e con el mismo fallo latente
ALTER FUNCTION public.familia_rpc_liberar_para_hacer(bigint, integer) SECURITY DEFINER;
ALTER FUNCTION public.familia_rpc_reabrir_tarea(bigint, integer, integer) SECURITY DEFINER;
ALTER FUNCTION public.familia_rpc_perdonar_despues_auto(bigint, integer) SECURITY DEFINER;

-- 3) Mesada: DEFINER (E-ME1 «no disponible en la BD» por privilegios de invocador)
ALTER FUNCTION public.familia_rpc_mesada_estado(integer, integer, text) SECURITY DEFINER;
ALTER FUNCTION public.familia_rpc_mesada_saldo(integer) SECURITY DEFINER;
ALTER FUNCTION public.familia_rpc_mesada_config_guardar(integer, text, integer, boolean, integer, jsonb, date, date) SECURITY DEFINER;
ALTER FUNCTION public.familia_rpc_mesada_liberar(integer, boolean, text) SECURITY DEFINER;

-- Asegurar EXECUTE a wrappers (no a v6d_actor)
REVOKE ALL ON FUNCTION public.familia_v6d_actor(integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.familia_v6d_actor(integer, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_rpc_liberar_para_hacer(bigint, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_rpc_reabrir_tarea(bigint, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_rpc_perdonar_despues_auto(bigint, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_rpc_mesada_estado(integer, integer, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_rpc_mesada_saldo(integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_rpc_mesada_config_guardar(integer, text, integer, boolean, integer, jsonb, date, date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.familia_rpc_mesada_liberar(integer, boolean, text) TO anon, authenticated, service_role;
