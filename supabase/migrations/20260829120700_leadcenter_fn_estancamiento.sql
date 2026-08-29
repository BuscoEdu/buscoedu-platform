-- =====================================================
-- LEAD CENTER — FASE 5 · Motor de estancamiento (idempotente)
-- fn_evaluar_estancamiento(p_limite int) -> jsonb
-- =====================================================
-- Recorre oportunidades ACTIVAS y aplica las `reglas_estancamiento` cuando el
-- tiempo sin actividad en la etapa/subestado supera el umbral configurado.
--
-- Diseño IDEMPOTENTE: para cada oportunidad detectada se crea (si no existe ya)
-- UNA tarea de seguimiento con tipo_tarea = 'automatica_estancamiento' en estado
-- 'pendiente'. Mientras esa tarea siga pendiente, la oportunidad NO se vuelve a
-- procesar, de modo que ejecutar el cron varias veces no duplica efectos.
--
-- Acciones según la regla: crear_tarea, reduce_score (+ historial_scoring),
-- mover_a_nurturing (temperatura->frio), escalar_a_humano (nota marcada).
-- NUNCA borra ni transfiere nada. Se ejecuta con service role desde el cron.
-- =====================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_evaluar_estancamiento(p_limite integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row            record;
  v_ultima_act     timestamptz;
  v_horas          numeric;
  v_ya_marcada     boolean;
  v_tarea_id       uuid;
  v_procesadas     integer := 0;
  v_tareas         integer := 0;
  v_score          integer := 0;
  v_nurturing      integer := 0;
  v_escaladas      integer := 0;
BEGIN
  FOR v_row IN
    SELECT o.id, o.etapa_id, o.subestado_id, o.puntaje, o.actualizado_en,
           r.tiempo_maximo_horas, r.accion_recomendada, r.reduce_score,
           r.escalar_a_humano, r.crear_tarea, r.mover_a_nurturing, r.persona_id_join AS persona_id
    FROM (
      SELECT o.*, o.persona_id AS persona_id_join FROM public.oportunidades o
    ) o
    JOIN public.reglas_estancamiento r
      ON r.etapa_id = o.etapa_id
     AND (r.subestado_id IS NULL OR r.subestado_id = o.subestado_id)
     AND coalesce(r.activo, true)
    WHERE o.estado = 'activa'
    ORDER BY o.actualizado_en ASC
    LIMIT p_limite
  LOOP
    -- Última actividad: el cambio de etapa más reciente o, en su defecto, actualizado_en.
    SELECT max(creado_en) INTO v_ultima_act
    FROM public.historial_etapas_oportunidad
    WHERE oportunidad_id = v_row.id;
    v_ultima_act := coalesce(v_ultima_act, v_row.actualizado_en, now());

    v_horas := EXTRACT(EPOCH FROM (now() - v_ultima_act)) / 3600.0;
    IF v_horas < coalesce(v_row.tiempo_maximo_horas, 24) THEN
      CONTINUE;
    END IF;

    -- Idempotencia: si ya hay una tarea automática de estancamiento pendiente, saltar.
    SELECT EXISTS (
      SELECT 1 FROM public.tareas_crm
      WHERE oportunidad_id = v_row.id
        AND tipo_tarea = 'automatica_estancamiento'
        AND estado = 'pendiente'
    ) INTO v_ya_marcada;

    IF v_ya_marcada THEN
      CONTINUE;
    END IF;

    v_procesadas := v_procesadas + 1;

    -- Acción: crear tarea de seguimiento.
    IF coalesce(v_row.crear_tarea, true) THEN
      INSERT INTO public.tareas_crm (
        oportunidad_id, persona_id, titulo, tipo_tarea, prioridad, estado,
        descripcion, fecha_vencimiento, creado_en, actualizado_en
      ) VALUES (
        v_row.id, v_row.persona_id,
        'Retomar oportunidad estancada', 'automatica_estancamiento', 'alta', 'pendiente',
        coalesce(v_row.accion_recomendada, 'La oportunidad superó el tiempo máximo en su etapa.'),
        now() + interval '1 day', now(), now()
      )
      RETURNING id INTO v_tarea_id;
      v_tareas := v_tareas + 1;
    END IF;

    -- Acción: reducir score (una vez por detección) + historial explicable.
    IF coalesce(v_row.reduce_score, false) THEN
      UPDATE public.oportunidades
        SET puntaje = greatest(0, coalesce(puntaje, 0) - 5), actualizado_en = now()
        WHERE id = v_row.id;

      INSERT INTO public.historial_scoring_oportunidad (
        oportunidad_id, evento_origen, puntos_restados, puntaje_resultante,
        explicacion, generado_por, creado_en
      ) VALUES (
        v_row.id, 'inactividad', 5, greatest(0, coalesce(v_row.puntaje, 0) - 5),
        'Reducción automática por estancamiento en la etapa.', 'automatizacion', now()
      );
      v_score := v_score + 1;
    END IF;

    -- Acción: mover a nurturing (enfriar temperatura).
    IF coalesce(v_row.mover_a_nurturing, false) THEN
      UPDATE public.oportunidades
        SET temperatura = 'frio', actualizado_en = now()
        WHERE id = v_row.id;
      v_nurturing := v_nurturing + 1;
    END IF;

    -- Acción: escalar a humano (se deja constancia; no ejecuta nada por su cuenta).
    IF coalesce(v_row.escalar_a_humano, false) THEN
      INSERT INTO public.notas_crm (
        oportunidad_id, persona_id, contenido, es_privada, creado_en, actualizado_en
      ) VALUES (
        v_row.id, v_row.persona_id,
        '[Automatización] Oportunidad estancada: se recomienda escalar a un asesor humano.',
        true, now(), now()
      );
      v_escaladas := v_escaladas + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'procesadas', v_procesadas,
    'tareas_creadas', v_tareas,
    'scores_reducidos', v_score,
    'movidas_nurturing', v_nurturing,
    'escaladas', v_escaladas,
    'evaluado_en', now()
  );
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('ok', false, 'error', 'excepcion', 'detalle', SQLERRM);
END;
$$;

COMMENT ON FUNCTION public.fn_evaluar_estancamiento(integer) IS 'Evalúa reglas_estancamiento sobre oportunidades activas de forma idempotente (no duplica tareas automáticas). Ejecutada por el cron con service role.';

COMMIT;
