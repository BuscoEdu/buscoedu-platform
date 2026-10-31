-- v6e_03 · E-PR1 premios por hijo + E-AP1 liberar para hacer + canje con guarda.

-- RPC: padre libera tarea (borrador/pendiente sin flag) para que el hijo pueda hacerla.
CREATE OR REPLACE FUNCTION public.familia_rpc_liberar_para_hacer(p_tarea_id bigint, p_actor_id integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE t public.familia_tareas%ROWTYPE; v_rol text;
BEGIN
  v_rol := public.familia_v6d_actor(p_actor_id, 'crear_asignar');
  SELECT * INTO t FROM public.familia_tareas WHERE id = p_tarea_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tarea no encontrada'; END IF;
  IF t.archivada_en IS NOT NULL THEN RAISE EXCEPTION 'tarea archivada'; END IF;
  IF t.aprobada_para_hacer AND t.estado = 'pendiente' THEN
    RETURN jsonb_build_object('ok', true, 'idempotente', true);
  END IF;
  -- Obligatoria ya está liberada; el resto pasa a pendiente liberada.
  UPDATE public.familia_tareas
     SET estado = CASE WHEN estado IN ('borrador','solicitada') THEN 'pendiente' ELSE estado END,
         aprobada_para_hacer = true,
         habilita_en = coalesce(habilita_en, now()),
         fecha_limite = coalesce(fecha_limite, now() + make_interval(mins => coalesce(duracion_min, ventana_min, 120)))
   WHERE id = p_tarea_id;
  INSERT INTO public.familia_historial(miembro_id, texto, tarea_id, tipo, actor_id, actor_rol, pts)
  VALUES (t.asignada_a, 'Liberada para hacer: '||coalesce(t.titulo,'tarea'), t.id, 'tarea', p_actor_id, v_rol, 0);
  IF t.asignada_a IS NOT NULL THEN
    INSERT INTO public.familia_notificaciones(para_id, tipo, tarea_id, texto)
    VALUES (t.asignada_a, 'tarea', t.id, 'Ya puedes hacer: '||coalesce(t.titulo,'la tarea'));
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.familia_rpc_liberar_para_hacer(bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_liberar_para_hacer(bigint,integer) TO anon, authenticated, service_role;

-- Guarda en canje: premio asignado_a solo lo canjea ese miembro (E-PR1).
CREATE OR REPLACE FUNCTION public.familia_v6e_premio_visible(p_premio_id integer, p_miembro_id integer)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.familia_premios r
     WHERE r.id = p_premio_id AND r.activo IS DISTINCT FROM false
       AND (r.asignado_a IS NULL OR r.asignado_a = p_miembro_id)
  );
$$;
