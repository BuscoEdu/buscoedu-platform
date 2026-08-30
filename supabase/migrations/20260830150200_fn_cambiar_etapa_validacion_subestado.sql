BEGIN;

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
  v_subestado_valido uuid;
BEGIN
  IF NOT public.puede_ver_oportunidad(p_oportunidad_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado');
  END IF;

  SELECT etapa_id, subestado_id INTO v_etapa_ant, v_subestado_ant
  FROM public.oportunidades WHERE id = p_oportunidad_id;

  IF v_etapa_ant IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'oportunidad_no_encontrada');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.etapas_embudo e
    WHERE e.id = p_etapa_nueva AND coalesce(e.activo, true)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'etapa_invalida');
  END IF;

  IF p_subestado_nuevo IS NOT NULL THEN
    SELECT id INTO v_subestado_valido
    FROM public.subestados_oportunidad s
    WHERE s.id = p_subestado_nuevo
      AND s.etapa_id = p_etapa_nueva
      AND coalesce(s.activo, true)
    LIMIT 1;

    IF v_subestado_valido IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'subestado_invalido_para_etapa');
    END IF;
  END IF;

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

COMMENT ON FUNCTION public.fn_cambiar_etapa(uuid,uuid,uuid,text) IS 'Cambia etapa/subestado con validación de pertenencia de subestado a etapa, autorización por asesor asignado y registro histórico.';

COMMIT;
