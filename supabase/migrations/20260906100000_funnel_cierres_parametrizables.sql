-- Funnel BuscoEdu: cierres Ganada/Perdida desde cualquier etapa.
-- Este bloque añade configuración y auditoría sin borrar ni reescribir historia.
BEGIN;

CREATE TABLE IF NOT EXISTS public.funnel_cierre_requisitos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_cierre text NOT NULL CHECK (tipo_cierre IN ('ganada','perdida')),
  codigo text NOT NULL,
  nombre text NOT NULL,
  modo text NOT NULL DEFAULT 'obligatorio' CHECK (modo IN ('obligatorio','opcional','no_utilizado')),
  descripcion text,
  orden integer NOT NULL DEFAULT 1,
  activo boolean NOT NULL DEFAULT true,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tipo_cierre, codigo)
);

CREATE TABLE IF NOT EXISTS public.funnel_causas_perdida (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  orden integer NOT NULL DEFAULT 1,
  requiere_detalle boolean NOT NULL DEFAULT true,
  roles_permitidos jsonb NOT NULL DEFAULT '["asesor","super_admin"]'::jsonb,
  activo boolean NOT NULL DEFAULT true,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.oportunidades_cierres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidad_id uuid NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  tipo_cierre text NOT NULL CHECK (tipo_cierre IN ('ganada','perdida')),
  etapa_anterior_id uuid REFERENCES public.etapas_embudo(id),
  subestado_anterior_id uuid REFERENCES public.subestados_oportunidad(id),
  causa_perdida_id uuid REFERENCES public.funnel_causas_perdida(id),
  comentario text,
  requisitos_validados jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidencias jsonb NOT NULL DEFAULT '[]'::jsonb,
  canal text NOT NULL DEFAULT 'leadcenter',
  actor_tipo text NOT NULL DEFAULT 'usuario',
  actor_id uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  reabierto_en timestamptz,
  reabierto_por uuid,
  motivo_reapertura text
);

CREATE INDEX IF NOT EXISTS idx_oportunidades_cierres_oportunidad
  ON public.oportunidades_cierres(oportunidad_id, creado_en DESC);

INSERT INTO public.funnel_cierre_requisitos (tipo_cierre, codigo, nombre, descripcion, orden)
VALUES
  ('ganada','pago_inscripcion_confirmado','Pago de inscripción confirmado','Debe existir confirmación del pago.',1),
  ('ganada','evidencia_pago','Evidencia o comprobante de pago','Comprobante o referencia verificable.',2),
  ('ganada','programa_seleccionado','Programa académico seleccionado','Programa asociado a la oportunidad.',3),
  ('ganada','universidad_seleccionada','Universidad seleccionada','Institución asociada a la oportunidad.',4),
  ('ganada','fecha_confirmacion','Fecha de confirmación','Fecha en la que se validó la conversión.',5),
  ('ganada','actor_validacion','Actor que validó el cierre','Usuario o agente responsable.',6),
  ('ganada','canal_origen','Canal de origen','Web, WhatsApp u otro canal permitido.',7),
  ('ganada','comentario_cierre','Comentario de cierre','Explicación breve de la conversión.',8),
  ('perdida','causa','Causa parametrizada','Motivo catalogado de pérdida.',1),
  ('perdida','comentario','Explicación de pérdida','Detalle escrito por el responsable.',2)
ON CONFLICT (tipo_cierre, codigo) DO NOTHING;

INSERT INTO public.funnel_causas_perdida (codigo, nombre, orden)
VALUES
  ('precio','Precio',1), ('competencia','Competencia',2),
  ('ilocalizable','Ilocalizable',3), ('no_interesado','No interesado',4),
  ('requisitos_no_cumplidos','Requisitos no cumplidos',5), ('otro','Otro',6)
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE public.oportunidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidades_cierres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_cierre_requisitos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funnel_causas_perdida ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lc_cierres_select ON public.oportunidades_cierres;
CREATE POLICY lc_cierres_select ON public.oportunidades_cierres
  FOR SELECT TO authenticated USING (public.puede_ver_oportunidad(oportunidad_id));
DROP POLICY IF EXISTS lc_cierre_config_select ON public.funnel_cierre_requisitos;
CREATE POLICY lc_cierre_config_select ON public.funnel_cierre_requisitos
  FOR SELECT TO authenticated USING (public.es_asesor_o_super());
DROP POLICY IF EXISTS lc_causas_perdida_select ON public.funnel_causas_perdida;
CREATE POLICY lc_causas_perdida_select ON public.funnel_causas_perdida
  FOR SELECT TO authenticated USING (public.es_asesor_o_super());

CREATE OR REPLACE FUNCTION public.fn_cerrar_oportunidad(
  p_oportunidad_id uuid,
  p_tipo_cierre text,
  p_causa_codigo text DEFAULT NULL,
  p_comentario text DEFAULT NULL,
  p_requisitos jsonb DEFAULT '{}'::jsonb,
  p_evidencias jsonb DEFAULT '[]'::jsonb,
  p_canal text DEFAULT 'leadcenter'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := public.usuario_interno_id();
  v_op public.oportunidades%ROWTYPE;
  v_cerrada uuid;
  v_subestado uuid;
  v_causa uuid;
  v_faltantes text[] := ARRAY[]::text[];
BEGIN
  IF NOT public.puede_ver_oportunidad(p_oportunidad_id) THEN
    RETURN jsonb_build_object('ok',false,'error','no_autorizado');
  END IF;
  IF p_tipo_cierre NOT IN ('ganada','perdida') THEN
    RETURN jsonb_build_object('ok',false,'error','tipo_cierre_invalido');
  END IF;
  SELECT * INTO v_op FROM public.oportunidades WHERE id = p_oportunidad_id FOR UPDATE;
  IF v_op.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','oportunidad_no_encontrada'); END IF;

  IF p_tipo_cierre = 'ganada' THEN
    -- Requisitos obligatorios se leen del CRUD; el payload identifica los ya validados.
    SELECT array_agg(r.nombre ORDER BY r.orden) INTO v_faltantes
    FROM public.funnel_cierre_requisitos r
    WHERE r.tipo_cierre='ganada' AND r.activo=true AND r.modo='obligatorio'
      AND coalesce((p_requisitos ->> r.codigo)::boolean, false) IS NOT TRUE;
    IF coalesce(array_length(v_faltantes,1),0) > 0 THEN
      RETURN jsonb_build_object('ok',false,'error','requisitos_ganada_incompletos','faltantes',to_jsonb(v_faltantes));
    END IF;
  ELSE
    IF nullif(trim(coalesce(p_causa_codigo,'')),'') IS NULL OR nullif(trim(coalesce(p_comentario,'')),'') IS NULL THEN
      RETURN jsonb_build_object('ok',false,'error','causa_y_comentario_requeridos');
    END IF;
    SELECT id INTO v_causa FROM public.funnel_causas_perdida WHERE codigo=p_causa_codigo AND activo=true;
    IF v_causa IS NULL THEN RETURN jsonb_build_object('ok',false,'error','causa_perdida_invalida'); END IF;
  END IF;

  SELECT id INTO v_cerrada FROM public.etapas_embudo WHERE lower(nombre)='cerrada' AND activo=true LIMIT 1;
  IF v_cerrada IS NULL THEN RETURN jsonb_build_object('ok',false,'error','etapa_cerrada_no_configurada'); END IF;
  SELECT id INTO v_subestado FROM public.subestados_oportunidad
    WHERE etapa_id=v_cerrada AND lower(nombre)=p_tipo_cierre AND activo=true LIMIT 1;
  IF v_subestado IS NULL THEN RETURN jsonb_build_object('ok',false,'error','subestado_cierre_no_configurado'); END IF;

  UPDATE public.oportunidades SET etapa_id=v_cerrada, subestado_id=v_subestado,
    estado=p_tipo_cierre, causa_perdida=CASE WHEN p_tipo_cierre='perdida' THEN p_causa_codigo ELSE NULL END,
    razon_perdida=CASE WHEN p_tipo_cierre='perdida' THEN p_comentario ELSE NULL END,
    fecha_cierre=now(), actualizado_en=now()
  WHERE id=p_oportunidad_id;
  INSERT INTO public.oportunidades_cierres
    (oportunidad_id,tipo_cierre,etapa_anterior_id,subestado_anterior_id,causa_perdida_id,comentario,requisitos_validados,evidencias,canal,actor_id)
  VALUES (p_oportunidad_id,p_tipo_cierre,v_op.etapa_id,v_op.subestado_id,v_causa,p_comentario,p_requisitos,p_evidencias,p_canal,v_uid);
  INSERT INTO public.historial_etapas_oportunidad
    (oportunidad_id,etapa_anterior_id,etapa_nueva_id,subestado_anterior_id,subestado_nuevo_id,motivo,cambiado_por,canal,creado_en)
  VALUES (p_oportunidad_id,v_op.etapa_id,v_cerrada,v_op.subestado_id,v_subestado,coalesce(p_comentario,'Cierre '||p_tipo_cierre),v_uid,p_canal,now());
  RETURN jsonb_build_object('ok',true,'tipo_cierre',p_tipo_cierre,'etapa_id',v_cerrada,'subestado_id',v_subestado);
END; $$;

CREATE OR REPLACE FUNCTION public.fn_reabrir_oportunidad(
  p_oportunidad_id uuid, p_etapa_nueva uuid, p_subestado_nuevo uuid DEFAULT NULL, p_motivo text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := public.usuario_interno_id(); v_op public.oportunidades%ROWTYPE; v_cerrada uuid;
BEGIN
  IF NOT public.puede_ver_oportunidad(p_oportunidad_id) THEN RETURN jsonb_build_object('ok',false,'error','no_autorizado'); END IF;
  IF nullif(trim(coalesce(p_motivo,'')),'') IS NULL THEN RETURN jsonb_build_object('ok',false,'error','motivo_reapertura_requerido'); END IF;
  SELECT * INTO v_op FROM public.oportunidades WHERE id=p_oportunidad_id FOR UPDATE;
  SELECT id INTO v_cerrada FROM public.etapas_embudo WHERE lower(nombre)='cerrada' LIMIT 1;
  IF v_op.id IS NULL OR v_op.etapa_id <> v_cerrada THEN RETURN jsonb_build_object('ok',false,'error','oportunidad_no_cerrada'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.etapas_embudo WHERE id=p_etapa_nueva AND activo=true) THEN RETURN jsonb_build_object('ok',false,'error','etapa_invalida'); END IF;
  IF p_subestado_nuevo IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.subestados_oportunidad WHERE id=p_subestado_nuevo AND etapa_id=p_etapa_nueva AND activo=true) THEN RETURN jsonb_build_object('ok',false,'error','subestado_invalido_para_etapa'); END IF;
  UPDATE public.oportunidades SET etapa_id=p_etapa_nueva, subestado_id=p_subestado_nuevo, estado='activa', fecha_cierre=NULL, causa_perdida=NULL, razon_perdida=NULL, actualizado_en=now() WHERE id=p_oportunidad_id;
  UPDATE public.oportunidades_cierres SET reabierto_en=now(), reabierto_por=v_uid, motivo_reapertura=p_motivo WHERE oportunidad_id=p_oportunidad_id AND reabierto_en IS NULL;
  INSERT INTO public.historial_etapas_oportunidad (oportunidad_id,etapa_anterior_id,etapa_nueva_id,subestado_anterior_id,subestado_nuevo_id,motivo,cambiado_por,canal,creado_en)
  VALUES (p_oportunidad_id,v_op.etapa_id,p_etapa_nueva,v_op.subestado_id,p_subestado_nuevo,'Reapertura: '||p_motivo,v_uid,'leadcenter',now());
  RETURN jsonb_build_object('ok',true);
END; $$;

COMMENT ON TABLE public.oportunidades_cierres IS 'Auditoría inmutable de cierres Ganada/Perdida y sus reaperturas.';
COMMENT ON FUNCTION public.fn_cerrar_oportunidad IS 'Cierra una oportunidad desde cualquier etapa validando requisitos configurados en el CRUD.';
COMMENT ON FUNCTION public.fn_reabrir_oportunidad IS 'Reabre una oportunidad cerrada conservando cierre, motivo y trazabilidad.';
COMMIT;
