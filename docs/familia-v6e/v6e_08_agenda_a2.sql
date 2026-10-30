-- v6e_08 · E-AG1 Agenda A2: recordatorios (solo hijo) + archivo 90d + limpieza QA 46–48
-- Reutiliza tick */5; dedup por NOT EXISTS (sin tabla log).

-- ========== 1) Tick recordatorios agenda (solo para_id = hijo) ==========
CREATE OR REPLACE FUNCTION public.familia_rpc_agenda_tick_recordatorios()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  a public.familia_agenda_actividades%ROWTYPE;
  v_d date; v_from date; v_to date; v_ini timestamptz; v_fin timestamptz;
  v_exc record; n int := 0; v_texto text; v_aviso timestamptz;
  v_now timestamptz := now();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('familia_agenda_tick_recordatorios'));
  -- Ventana: ocurrencias cuyo aviso cae cerca de ahora (±6 min margen del cron */5)
  v_from := (timezone('Europe/Madrid', v_now - interval '1 day'))::date;
  v_to   := (timezone('Europe/Madrid', v_now + interval '2 days'))::date;

  FOR a IN
    SELECT * FROM public.familia_agenda_actividades x
     WHERE x.archivada_en IS NULL
       AND x.recordar_min_antes > 0
       AND x.desde_fecha <= v_to
       AND (x.hasta_fecha IS NULL OR x.hasta_fecha >= v_from)
  LOOP
    v_d := GREATEST(a.desde_fecha, v_from);
    WHILE v_d <= LEAST(coalesce(a.hasta_fecha, v_to), v_to) LOOP
      IF (a.recurrencia = 'once' AND v_d = a.desde_fecha)
         OR (a.recurrencia = 'daily')
         OR (a.recurrencia = 'weekly' AND substring(a.dias_semana from ((EXTRACT(ISODOW FROM v_d)::int))) = '1')
         OR (a.recurrencia = 'monthly' AND EXTRACT(DAY FROM v_d)::int = coalesce(a.mensual_dia, EXTRACT(DAY FROM a.desde_fecha)::int))
      THEN
        SELECT * INTO v_exc FROM public.familia_agenda_excepciones e
         WHERE e.actividad_id = a.id AND e.dia_original = v_d;
        IF FOUND AND v_exc.tipo = 'omitir' THEN
          NULL;
        ELSIF FOUND AND v_exc.tipo = 'mover' AND v_exc.nuevo_inicio IS NOT NULL THEN
          v_ini := v_exc.nuevo_inicio;
        ELSE
          v_ini := timezone(a.zona, (v_d::text || ' ' || a.hora_inicio::text)::timestamp);
        END IF;
        v_aviso := v_ini - make_interval(mins => a.recordar_min_antes);
        -- ¿El aviso cae en la ventana del tick?
        IF v_aviso <= v_now + interval '3 minutes' AND v_aviso > v_now - interval '8 minutes' THEN
          v_texto := 'Agenda: '||coalesce(a.titulo,'compromiso')||' a las '||to_char(timezone('Europe/Madrid', v_ini),'HH24:MI');
          IF NOT EXISTS (
            SELECT 1 FROM public.familia_notificaciones n
             WHERE n.para_id = a.miembro_id
               AND n.tipo = 'agenda'
               AND n.actividad_id = a.id
               AND n.creado_en > v_now - interval '12 hours'
               AND n.texto = v_texto
          ) THEN
            INSERT INTO public.familia_notificaciones(para_id, tipo, texto, actividad_id)
            VALUES (a.miembro_id, 'agenda', v_texto, a.id);
            n := n + 1;
          END IF;
        END IF;
      END IF;
      v_d := v_d + 1;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'enviados', n);
END $$;

REVOKE ALL ON FUNCTION public.familia_rpc_agenda_tick_recordatorios() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_agenda_tick_recordatorios() TO service_role;

-- Archivo automático: reglas once/cerradas con fin < hoy−90 → archivada_en
CREATE OR REPLACE FUNCTION public.familia_rpc_agenda_archivo_90d()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n int;
BEGIN
  UPDATE public.familia_agenda_actividades SET archivada_en = now()
   WHERE archivada_en IS NULL
     AND (
       (recurrencia = 'once' AND (desde_fecha + make_interval(mins => duracion_min))::date
          < (timezone('Europe/Madrid', now()))::date - 90)
       OR (hasta_fecha IS NOT NULL AND hasta_fecha < (timezone('Europe/Madrid', now()))::date - 90)
     );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'archivadas', n);
END $$;

REVOKE ALL ON FUNCTION public.familia_rpc_agenda_archivo_90d() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_agenda_archivo_90d() TO service_role;

-- Enganchar al tick de vencidas (mismo cron */5; no suma jobs Hobby)
CREATE OR REPLACE FUNCTION public.familia_rpc_tick_vencidas()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r record; n int := 0; v_loss int; v_padres int[];
  v_ag jsonb; v_ar jsonb;
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

  UPDATE public.familia_tareas t SET
    archivada_en = now(),
    estado = 'completada',
    cerrado_en = now(),
    en_subasta = false
  WHERE t.en_subasta AND t.asignada_a IS NULL AND t.archivada_en IS NULL
    AND t.subasta_vence_en IS NOT NULL AND t.subasta_vence_en < now();

  -- Agenda: recordatorios + archivo 90d (best-effort dentro del mismo tick)
  BEGIN
    v_ag := public.familia_rpc_agenda_tick_recordatorios();
  EXCEPTION WHEN OTHERS THEN
    v_ag := jsonb_build_object('ok', false, 'error', SQLERRM);
  END;
  BEGIN
    v_ar := public.familia_rpc_agenda_archivo_90d();
  EXCEPTION WHEN OTHERS THEN
    v_ar := jsonb_build_object('ok', false, 'error', SQLERRM);
  END;

  RETURN jsonb_build_object('ok', true, 'cerradas', n, 'agenda_recordatorios', v_ag, 'agenda_archivo', v_ar);
END $$;

REVOKE ALL ON FUNCTION public.familia_rpc_tick_vencidas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.familia_rpc_tick_vencidas() TO service_role;

-- ========== 2) Limpieza QA miembros 46–48 (verificados QA v6e) ==========
DO $$
DECLARE ids int[] := ARRAY[46,47,48];
BEGIN
  IF (SELECT count(*) FROM public.familia_miembros WHERE id = ANY(ids) AND nombre LIKE 'QA v6e%') = 3 THEN
    DELETE FROM public.familia_notificaciones WHERE para_id = ANY(ids);
    DELETE FROM public.familia_historial WHERE miembro_id = ANY(ids) OR actor_id = ANY(ids);
    DELETE FROM public.familia_solicitudes_premios WHERE miembro_id = ANY(ids);
    UPDATE public.familia_premios SET asignado_a = NULL WHERE asignado_a = ANY(ids);
    DELETE FROM public.familia_tareas WHERE asignada_a = ANY(ids) OR creada_por = ANY(ids);
    DELETE FROM public.familia_agenda_excepciones WHERE creado_por = ANY(ids);
    DELETE FROM public.familia_agenda_actividades WHERE miembro_id = ANY(ids) OR creada_por = ANY(ids);
    DELETE FROM public.familia_miembros WHERE id = ANY(ids) AND nombre LIKE 'QA v6e%';
    RAISE NOTICE 'QA v6e 46–48 eliminados';
  ELSE
    RAISE NOTICE 'QA 46–48 no coinciden o ya limpios; no se borra';
  END IF;
END $$;
