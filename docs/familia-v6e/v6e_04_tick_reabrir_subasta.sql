-- v6e_04 · E-VE1 tick cierre_auto + Reabrir/Perdonar con devolución + E-SU1 subasta atómica y archive.

-- Cierre automático: solo si cierre_auto y pasó fecha_limite sin evidencia ni puntos.
CREATE OR REPLACE FUNCTION public.familia_rpc_tick_vencidas()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; n int := 0; v_loss int; v_padres int[];
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('familia_v6e_tick_vencidas'));
  FOR r IN
    SELECT t.* FROM public.familia_tareas t
     WHERE t.archivada_en IS NULL
       AND t.cierre_auto = true
       AND t.en_subasta = false
       AND t.puntos_sumados IS DISTINCT FROM true
       AND t.fecha_limite IS NOT NULL AND t.fecha_limite < now()
       AND t.estado IN ('pendiente','borrador')
       AND t.comentario_completado IS NULL
       AND coalesce(t.evidencia_2,'') = ''
     FOR UPDATE SKIP LOCKED
  LOOP
    v_loss := GREATEST(0, coalesce(r.pierde_pts, r.puntos_penalizacion_dia, 0));
    UPDATE public.familia_tareas SET
      estado = 'completada',
      estado_vencida = CASE WHEN v_loss > 0 THEN 'descontada' ELSE 'perdonada' END,
      puntos_sumados = true,
      puntos_aplicados = -v_loss,
      cerrado_en = now(),
      vencida_origen = 'cierre_auto'
    WHERE id = r.id;
    IF v_loss > 0 AND r.asignada_a IS NOT NULL THEN
      UPDATE public.familia_miembros SET puntos = puntos - v_loss WHERE id = r.asignada_a;
    END IF;
    INSERT INTO public.familia_historial(miembro_id, texto, tarea_id, tipo, actor_id, actor_rol, pts)
    VALUES (r.asignada_a,
      'Cierre automático: '||coalesce(r.titulo,'tarea')||' ('||(-v_loss)||' pts)',
      r.id, CASE WHEN v_loss>0 THEN 'descuento' ELSE 'perdon' END, NULL, 'sistema', -v_loss);
    -- Aviso a hijo + todos los padres.
    IF r.asignada_a IS NOT NULL THEN
      INSERT INTO public.familia_notificaciones(para_id, tipo, tarea_id, texto)
      VALUES (r.asignada_a, 'tarea', r.id, 'Vencida (auto): '||coalesce(r.titulo,'tarea')||CASE WHEN v_loss>0 THEN ' (−'||v_loss||' pts)' ELSE '' END);
    END IF;
    INSERT INTO public.familia_notificaciones(para_id, tipo, tarea_id, texto)
    SELECT m.id, 'tarea', r.id, 'Vencida (auto): '||coalesce(r.titulo,'tarea')||' de '||coalesce((SELECT nombre FROM familia_miembros WHERE id=r.asignada_a),'hijo')
      FROM public.familia_miembros m
     WHERE coalesce(m.rol_v6d, CASE WHEN m.es_admin THEN 'padre_admin' ELSE 'hijo' END) IN ('padre_admin','padre');
    n := n + 1;
  END LOOP;

  -- E-SU1: subastas sin aceptar tras subasta_vence_en → archivar.
  UPDATE public.familia_tareas t SET
    archivada_en = now(),
    estado = 'completada',
    cerrado_en = now(),
    en_subasta = false
  WHERE t.en_subasta AND t.asignada_a IS NULL AND t.archivada_en IS NULL
    AND t.subasta_vence_en IS NOT NULL AND t.subasta_vence_en < now();

  RETURN jsonb_build_object('ok', true, 'cerradas', n);
END $$;
REVOKE ALL ON FUNCTION public.familia_rpc_tick_vencidas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_tick_vencidas() TO service_role;

-- Reabrir: devuelve pts descontados y abre nueva ventana.
CREATE OR REPLACE FUNCTION public.familia_rpc_reabrir_tarea(p_tarea_id bigint, p_actor_id integer, p_minutos integer DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE t public.familia_tareas%ROWTYPE; v_rol text; v_min int; v_prev int;
BEGIN
  v_rol := public.familia_v6d_actor(p_actor_id, 'realizada_descontar_perdonar');
  SELECT * INTO t FROM public.familia_tareas WHERE id = p_tarea_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tarea no encontrada'; END IF;
  IF t.estado_vencida IS DISTINCT FROM 'descontada' AND t.estado_vencida IS DISTINCT FROM 'perdonada'
     AND coalesce(t.vencida_origen,'') <> 'cierre_auto' THEN
    RAISE EXCEPTION 'solo se reabre una tarea cerrada por vencimiento'; END IF;
  v_min := coalesce(nullif(p_minutos,0), t.reabrir_min,
    (SELECT reabrir_min_default FROM public.familia_config ORDER BY id LIMIT 1), 30);
  IF v_min < 1 OR v_min > 72*60 THEN RAISE EXCEPTION 'minutos de reabrir fuera de rango'; END IF;
  v_prev := coalesce(t.puntos_aplicados, 0);
  -- Devuelve pts si hubo descuento (puntos_aplicados negativo).
  IF v_prev < 0 AND t.asignada_a IS NOT NULL THEN
    UPDATE public.familia_miembros SET puntos = puntos + abs(v_prev) WHERE id = t.asignada_a;
  END IF;
  UPDATE public.familia_tareas SET
    estado = 'pendiente', estado_vencida = NULL, puntos_sumados = false, puntos_aplicados = NULL,
    cerrado_en = NULL, vencida_origen = NULL, aprobada_para_hacer = true,
    habilita_en = now(), fecha_limite = now() + make_interval(mins => v_min),
    duracion_min = v_min, ventana_min = v_min, reabrir_min = v_min,
    comentario_completado = NULL, evidencia_2 = NULL
  WHERE id = p_tarea_id;
  INSERT INTO public.familia_historial(miembro_id, texto, tarea_id, tipo, actor_id, actor_rol, pts)
  VALUES (t.asignada_a, 'Reabierta: '||coalesce(t.titulo,'tarea')||' (+'||abs(least(v_prev,0))||' pts · '||v_min||' min)',
    t.id, 'ajuste', p_actor_id, v_rol, abs(least(v_prev,0)));
  IF t.asignada_a IS NOT NULL THEN
    INSERT INTO public.familia_notificaciones(para_id, tipo, tarea_id, texto)
    VALUES (t.asignada_a, 'tarea', t.id, 'Reabrieron: '||coalesce(t.titulo,'la tarea')||' · tienes '||v_min||' min');
  END IF;
  RETURN jsonb_build_object('ok', true, 'minutos', v_min, 'devueltos', abs(least(v_prev,0)));
END $$;
REVOKE ALL ON FUNCTION public.familia_rpc_reabrir_tarea(bigint,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_reabrir_tarea(bigint,integer,integer) TO anon, authenticated, service_role;

-- Perdonar post-auto: si ya descontó, devolviendo pts (extiende perdonar_vencida vía wrapper suave).
CREATE OR REPLACE FUNCTION public.familia_rpc_perdonar_despues_auto(p_tarea_id bigint, p_actor_id integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE t public.familia_tareas%ROWTYPE; v_rol text; v_prev int;
BEGIN
  v_rol := public.familia_v6d_actor(p_actor_id, 'realizada_descontar_perdonar');
  SELECT * INTO t FROM public.familia_tareas WHERE id = p_tarea_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tarea no encontrada'; END IF;
  IF t.estado_vencida = 'perdonada' THEN RETURN jsonb_build_object('ok',true,'idempotente',true); END IF;
  v_prev := coalesce(t.puntos_aplicados, 0);
  IF v_prev < 0 AND t.asignada_a IS NOT NULL THEN
    UPDATE public.familia_miembros SET puntos = puntos + abs(v_prev) WHERE id = t.asignada_a;
  END IF;
  UPDATE public.familia_tareas SET estado='completada', estado_vencida='perdonada',
    puntos_aplicados=0, puntos_sumados=true, cerrado_en=coalesce(cerrado_en, now())
  WHERE id = p_tarea_id;
  INSERT INTO public.familia_historial(miembro_id, texto, tarea_id, tipo, actor_id, actor_rol, pts)
  VALUES (t.asignada_a, 'Perdonada (devuelve): '||coalesce(t.titulo,'tarea')||' (+'||abs(least(v_prev,0))||' pts)',
    t.id, 'perdon', p_actor_id, v_rol, abs(least(v_prev,0)));
  IF t.asignada_a IS NOT NULL THEN
    INSERT INTO public.familia_notificaciones(para_id, tipo, tarea_id, texto)
    VALUES (t.asignada_a, 'tarea', t.id, 'Perdonaron: '||coalesce(t.titulo,'la tarea'));
  END IF;
  RETURN jsonb_build_object('ok', true, 'devueltos', abs(least(v_prev,0)));
END $$;
REVOKE ALL ON FUNCTION public.familia_rpc_perdonar_despues_auto(bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_perdonar_despues_auto(bigint,integer) TO anon, authenticated, service_role;

-- Subasta: aceptar atómico (primer UPDATE gana).
CREATE OR REPLACE FUNCTION public.familia_rpc_aceptar_subasta(p_tarea_id bigint, p_actor_id integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
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
  -- Aviso a hermanos: ya la tomó X.
  INSERT INTO public.familia_notificaciones(para_id, tipo, tarea_id, texto)
  SELECT m.id, 'tarea', t.id, 'Ya la tomó '||coalesce(v_nombre,'un hermano')||': '||coalesce(t.titulo,'tarea')
    FROM public.familia_miembros m
   WHERE coalesce(m.rol_v6d,'hijo') = 'hijo' AND m.id <> p_actor_id;
  RETURN jsonb_build_object('ok', true, 'asignada_a', p_actor_id);
END $$;
REVOKE ALL ON FUNCTION public.familia_rpc_aceptar_subasta(bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_aceptar_subasta(bigint,integer) TO anon, authenticated, service_role;

-- Cron cada 5 minutos.
DO $$ BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.schedule('familia_v6e_tick_vencidas', '*/5 * * * *',
      $c$SELECT public.familia_rpc_tick_vencidas()$c$);
  ELSE
    RAISE NOTICE 'pg_cron no disponible: programar familia_rpc_tick_vencidas a mano';
  END IF;
END $$;
