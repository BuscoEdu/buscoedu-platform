-- Distingue el relacionamiento B2C (estudiante) del B2B (universidad) sin crear
-- otro CRM. Las oportunidades institucionales comparten trazabilidad, pero no
-- entran en las automatizaciones de estancamiento diseñadas para estudiantes.
BEGIN;

ALTER TABLE public.oportunidades
  ADD COLUMN IF NOT EXISTS tipo_oportunidad text NOT NULL DEFAULT 'estudiante',
  ADD COLUMN IF NOT EXISTS codigo text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oportunidades_tipo_oportunidad_check') THEN
    ALTER TABLE public.oportunidades ADD CONSTRAINT oportunidades_tipo_oportunidad_check
      CHECK (tipo_oportunidad IN ('estudiante', 'universidad'));
  END IF;
END $$;

UPDATE public.oportunidades
SET codigo = coalesce(codigo, 'OP-' || upper(substr(replace(id::text, '-', ''), 1, 8)))
WHERE codigo IS NULL;

ALTER TABLE public.oportunidades ALTER COLUMN codigo SET DEFAULT ('OP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)));
CREATE UNIQUE INDEX IF NOT EXISTS idx_oportunidades_codigo_unique ON public.oportunidades(codigo) WHERE codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_oportunidades_tipo_estado ON public.oportunidades(tipo_oportunidad, estado);

CREATE OR REPLACE FUNCTION public.fn_crear_oportunidad_universidad()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.oportunidades (codigo, tipo_oportunidad, universidad_id, nombre, estado, temperatura, puntaje, origen, canal_origen, creado_en, actualizado_en)
  SELECT
    'OP-UNI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    'universidad', NEW.id, coalesce(NEW.nombre_corto, NEW.nombre_oficial, 'Universidad'),
    'activa', 'tibio', 0, 'registro_universidad', 'crud_universidades', now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.oportunidades o
    WHERE o.universidad_id = NEW.id AND o.tipo_oportunidad = 'universidad' AND o.estado <> 'archivada'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_universidad_crea_oportunidad ON public.universidades;
CREATE TRIGGER trg_universidad_crea_oportunidad
AFTER INSERT ON public.universidades
FOR EACH ROW EXECUTE FUNCTION public.fn_crear_oportunidad_universidad();

-- El motor actual queda reservado al flujo de estudiantes. Las oportunidades
-- institucionales permanecen visibles y se gestionan en su propio embudo sin
-- que se creen tareas, reducciones de score ni mensajes B2C por error.
CREATE OR REPLACE FUNCTION public.fn_evaluar_estancamiento(p_limite integer DEFAULT 200)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row record; v_ultima_act timestamptz; v_horas numeric; v_ya_marcada boolean; v_procesadas integer := 0; v_tareas integer := 0; v_score integer := 0; v_nurturing integer := 0; v_escaladas integer := 0;
BEGIN
  FOR v_row IN
    SELECT o.id, o.subestado_id, o.puntaje, o.actualizado_en, o.persona_id,
      r.tiempo_maximo_horas, r.accion_recomendada, r.reduce_score, r.escalar_a_humano, r.crear_tarea, r.mover_a_nurturing
    FROM public.oportunidades o JOIN public.reglas_estancamiento r ON r.etapa_id=o.etapa_id AND (r.subestado_id IS NULL OR r.subestado_id=o.subestado_id) AND coalesce(r.activo,true)
    WHERE o.estado='activa' AND o.tipo_oportunidad='estudiante' ORDER BY o.actualizado_en ASC LIMIT p_limite
  LOOP
    SELECT max(creado_en) INTO v_ultima_act FROM public.historial_etapas_oportunidad WHERE oportunidad_id=v_row.id;
    v_horas := extract(epoch FROM (now()-coalesce(v_ultima_act,v_row.actualizado_en,now())))/3600.0;
    IF v_horas < coalesce(v_row.tiempo_maximo_horas,24) THEN CONTINUE; END IF;
    SELECT exists(SELECT 1 FROM public.tareas_crm WHERE oportunidad_id=v_row.id AND tipo_tarea='automatica_estancamiento' AND estado='pendiente') INTO v_ya_marcada;
    IF v_ya_marcada THEN CONTINUE; END IF;
    v_procesadas:=v_procesadas+1;
    IF coalesce(v_row.crear_tarea,true) THEN INSERT INTO public.tareas_crm(oportunidad_id,persona_id,titulo,tipo_tarea,prioridad,estado,descripcion,fecha_vencimiento,creado_en,actualizado_en) VALUES(v_row.id,v_row.persona_id,'Retomar oportunidad estancada','automatica_estancamiento','alta','pendiente',coalesce(v_row.accion_recomendada,'La oportunidad superó el tiempo máximo en su etapa.'),now()+interval '1 day',now(),now()); v_tareas:=v_tareas+1; END IF;
    IF coalesce(v_row.reduce_score,false) THEN UPDATE public.oportunidades SET puntaje=greatest(0,coalesce(puntaje,0)-5),actualizado_en=now() WHERE id=v_row.id; INSERT INTO public.historial_scoring_oportunidad(oportunidad_id,evento_origen,puntos_restados,puntaje_resultante,explicacion,generado_por,creado_en) VALUES(v_row.id,'inactividad',5,greatest(0,coalesce(v_row.puntaje,0)-5),'Reducción automática por estancamiento en la etapa.','automatizacion',now()); v_score:=v_score+1; END IF;
    IF coalesce(v_row.mover_a_nurturing,false) THEN UPDATE public.oportunidades SET temperatura='frio',actualizado_en=now() WHERE id=v_row.id; v_nurturing:=v_nurturing+1; END IF;
    IF coalesce(v_row.escalar_a_humano,false) THEN INSERT INTO public.notas_crm(oportunidad_id,persona_id,contenido,es_privada,creado_en,actualizado_en) VALUES(v_row.id,v_row.persona_id,'[Automatización] Oportunidad estancada: se recomienda escalar a un asesor humano.',true,now(),now()); v_escaladas:=v_escaladas+1; END IF;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'procesadas',v_procesadas,'tareas_creadas',v_tareas,'scores_reducidos',v_score,'movidas_nurturing',v_nurturing,'escaladas',v_escaladas,'evaluado_en',now());
EXCEPTION WHEN others THEN RETURN jsonb_build_object('ok',false,'error','excepcion','detalle',SQLERRM); END;
$$;

COMMENT ON COLUMN public.oportunidades.tipo_oportunidad IS 'estudiante: admisiones B2C; universidad: gestión institucional B2B.';
COMMIT;
