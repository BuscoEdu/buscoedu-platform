-- =====================================================
-- BA-040 · fn_cambiar_etapa rechaza subestado NULL
-- Autor: Base de datos BuscoEdu (bot) · 2026-10-18 · E1 Ola 1/4
-- Qué hace: reemplaza fn_cambiar_etapa (misma firma) con la versión de
--   20260830150200 + una validación nueva: si p_subestado_nuevo es NULL,
--   responde {ok:false, error:'subestado_requerido'} antes de escribir.
-- Para qué: cerrar la puerta a cambios de etapa sin subestado (regla del funnel)
--   con un error legible en vez de una violación NOT NULL.
-- Impacto app: /api/leadcenter/oportunidad/[id]/etapa siempre envía subestado
--   (usa el primero de la etapa si no llega) → sin cambio visible.
-- Idempotente: CREATE OR REPLACE. Deshacer: 20261018_ba040_deshacer.sql.
-- =====================================================
BEGIN;

-- Bloque 1: función con la validación de subestado obligatorio.
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

  -- BA-040: el subestado es obligatorio (oportunidades.subestado_id es NOT NULL
  -- desde 20260906150000). Antes, un NULL terminaba en error 500 por la
  -- restricción; ahora se rechaza con un motivo claro y SIN escribir nada.
  IF p_subestado_nuevo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'subestado_requerido');
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

COMMENT ON FUNCTION public.fn_cambiar_etapa(uuid,uuid,uuid,text) IS 'BA-040: subestado obligatorio. Cambia etapa/subestado con validación de pertenencia de subestado a etapa, autorización por asesor asignado y registro histórico.';

COMMIT;
