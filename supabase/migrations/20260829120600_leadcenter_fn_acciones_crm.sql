-- =====================================================
-- LEAD CENTER — FASE 4 · RPCs de acción del CRM (con autorización)
-- fn_cambiar_etapa(...) y fn_registrar_contacto(...)
-- =====================================================
-- SECURITY DEFINER pero AUTORIZADAS: verifican puede_ver_oportunidad(auth.uid())
-- antes de escribir. Se invocan con el cliente de SESIÓN del asesor (JWT en
-- cookies), NO con service role, para que auth.uid() resuelva al usuario.
-- Registran trazabilidad (historial_etapas / notas / tareas) sin borrar nada.
-- =====================================================

BEGIN;

-- Cambia etapa y/o subestado de una oportunidad y registra el historial.
CREATE OR REPLACE FUNCTION public.fn_cambiar_etapa(
  p_oportunidad_id uuid,
  p_etapa_nueva uuid,
  p_subestado_nuevo uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.usuario_interno_id();
  v_etapa_ant uuid;
  v_subestado_ant uuid;
  v_es_ganada boolean;
  v_es_perdida boolean;
BEGIN
  IF NOT public.puede_ver_oportunidad(p_oportunidad_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado');
  END IF;

  SELECT etapa_id, subestado_id INTO v_etapa_ant, v_subestado_ant
  FROM public.oportunidades WHERE id = p_oportunidad_id;

  SELECT es_etapa_final_ganada, es_etapa_final_perdida
    INTO v_es_ganada, v_es_perdida
  FROM public.etapas_embudo WHERE id = p_etapa_nueva;

  UPDATE public.oportunidades SET
    etapa_id = p_etapa_nueva,
    subestado_id = p_subestado_nuevo,
    estado = CASE
      WHEN coalesce(v_es_ganada,false) THEN 'ganada'
      WHEN coalesce(v_es_perdida,false) THEN 'perdida'
      ELSE estado END,
    actualizado_en = now()
  WHERE id = p_oportunidad_id;

  INSERT INTO public.historial_etapas_oportunidad (
    oportunidad_id, etapa_anterior_id, etapa_nueva_id,
    subestado_anterior_id, subestado_nuevo_id, motivo, cambiado_por, canal, creado_en
  ) VALUES (
    p_oportunidad_id, v_etapa_ant, p_etapa_nueva,
    v_subestado_ant, p_subestado_nuevo, p_motivo, v_uid, 'leadcenter', now()
  );

  RETURN jsonb_build_object('ok', true, 'oportunidad_id', p_oportunidad_id);
END;
$$;

COMMENT ON FUNCTION public.fn_cambiar_etapa(uuid,uuid,uuid,text) IS 'Cambia etapa/subestado con autorización por asesor asignado y registra historial.';

-- Registra un contacto: crea una nota y (opcional) una tarea de seguimiento.
CREATE OR REPLACE FUNCTION public.fn_registrar_contacto(
  p_oportunidad_id uuid,
  p_persona_id uuid,
  p_canal text,
  p_resultado text,
  p_nota text DEFAULT NULL,
  p_crear_tarea boolean DEFAULT false,
  p_fecha_tarea timestamptz DEFAULT NULL,
  p_titulo_tarea text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := public.usuario_interno_id();
  v_nota_id uuid;
  v_tarea_id uuid := NULL;
BEGIN
  IF NOT public.puede_ver_oportunidad(p_oportunidad_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado');
  END IF;

  INSERT INTO public.notas_crm (
    oportunidad_id, persona_id, autor_id, contenido, es_privada, creado_en, actualizado_en
  ) VALUES (
    p_oportunidad_id, p_persona_id, v_uid,
    '[Contacto' || CASE WHEN p_canal IS NOT NULL THEN ' · ' || p_canal ELSE '' END
      || CASE WHEN p_resultado IS NOT NULL THEN ' · Resultado: ' || p_resultado ELSE '' END
      || ']' || CASE WHEN p_nota IS NOT NULL AND p_nota <> '' THEN E'\n' || p_nota ELSE '' END,
    true, now(), now()
  )
  RETURNING id INTO v_nota_id;

  IF p_crear_tarea THEN
    INSERT INTO public.tareas_crm (
      oportunidad_id, persona_id, asignado_a, creado_por, titulo, tipo_tarea,
      prioridad, estado, fecha_vencimiento, creado_en, actualizado_en
    ) VALUES (
      p_oportunidad_id, p_persona_id, v_uid, v_uid,
      coalesce(p_titulo_tarea, 'Seguimiento'), coalesce(p_canal,'llamada'),
      'media', 'pendiente', p_fecha_tarea, now(), now()
    )
    RETURNING id INTO v_tarea_id;

    UPDATE public.oportunidades
      SET fecha_proxima_accion = coalesce(p_fecha_tarea, fecha_proxima_accion),
          actualizado_en = now()
      WHERE id = p_oportunidad_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'nota_id', v_nota_id, 'tarea_id', v_tarea_id);
END;
$$;

COMMENT ON FUNCTION public.fn_registrar_contacto(uuid,uuid,text,text,text,boolean,timestamptz,text) IS 'Registra un contacto (nota + tarea opcional) con autorización por asesor asignado.';

COMMIT;
