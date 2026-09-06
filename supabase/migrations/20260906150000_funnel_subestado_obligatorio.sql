-- Regla estructural del funnel:
-- cada etapa tiene al menos una subetapa y cada oportunidad siempre apunta a
-- una subetapa perteneciente a su etapa.
BEGIN;

DO $$
DECLARE
  v_nuevo uuid;
  v_nuevo_subestado uuid;
  v_orden integer;
  v_stage record;
  v_subestado uuid;
BEGIN
  -- Canonicalizar la etapa inicial sin borrar ni renombrar configuraciones
  -- históricas existentes.
  SELECT id INTO v_nuevo
  FROM public.etapas_embudo
  WHERE lower(trim(nombre)) = 'nuevo'
  ORDER BY activo DESC, orden ASC NULLS LAST
  LIMIT 1;

  IF v_nuevo IS NULL THEN
    SELECT coalesce(max(orden), 0) + 1 INTO v_orden FROM public.etapas_embudo;
    INSERT INTO public.etapas_embudo
      (nombre, descripcion, orden, color, es_etapa_final_ganada, es_etapa_final_perdida, activo)
    VALUES ('Nuevo', 'Oportunidad recién creada, sin gestión', v_orden, '#2563EB', false, false, true)
    RETURNING id INTO v_nuevo;
  END IF;

  SELECT id INTO v_nuevo_subestado
  FROM public.subestados_oportunidad
  WHERE etapa_id = v_nuevo AND lower(trim(nombre)) = 'nuevo'
  ORDER BY activo DESC, orden ASC NULLS LAST
  LIMIT 1;

  IF v_nuevo_subestado IS NULL THEN
    SELECT coalesce(max(orden), 0) + 1 INTO v_orden
    FROM public.subestados_oportunidad WHERE etapa_id = v_nuevo;
    INSERT INTO public.subestados_oportunidad
      (etapa_id, nombre, descripcion, orden, tiempo_maximo_horas, activo)
    VALUES (v_nuevo, 'Nuevo', 'Subetapa inicial de la oportunidad', v_orden, 24, true)
    RETURNING id INTO v_nuevo_subestado;
  END IF;

  -- No permitimos etapas sin hijos. Para etapas antiguas sin configuración se
  -- crea un hijo neutro, preservando todo el historial existente.
  FOR v_stage IN SELECT id FROM public.etapas_embudo LOOP
    IF NOT EXISTS (SELECT 1 FROM public.subestados_oportunidad s WHERE s.etapa_id = v_stage.id) THEN
      INSERT INTO public.subestados_oportunidad
        (etapa_id, nombre, descripcion, orden, tiempo_maximo_horas, activo)
      VALUES (v_stage.id, 'General', 'Subetapa inicial de la etapa', 1, 24, true);
    END IF;
  END LOOP;

  -- Las oportunidades que estaban en Nuevo con el valor histórico "Sin
  -- contactar" pasan a la subetapa canónica Nuevo.
  UPDATE public.oportunidades
  SET etapa_id = v_nuevo,
      subestado_id = v_nuevo_subestado,
      actualizado_en = coalesce(actualizado_en, now())
  WHERE etapa_id IS NULL;

  UPDATE public.oportunidades o
  SET subestado_id = v_nuevo_subestado,
      actualizado_en = coalesce(o.actualizado_en, now())
  WHERE o.etapa_id = v_nuevo
    AND (o.subestado_id IS NULL OR EXISTS (
      SELECT 1 FROM public.subestados_oportunidad old_s
      WHERE old_s.id = o.subestado_id AND lower(trim(old_s.nombre)) = 'sin contactar'
    ));

  -- Backfill general para cualquier oportunidad histórica sin subetapa o con
  -- una subetapa que pertenece a otra etapa.
  FOR v_stage IN SELECT id FROM public.etapas_embudo LOOP
    SELECT s.id INTO v_subestado
    FROM public.subestados_oportunidad s
    WHERE s.etapa_id = v_stage.id AND coalesce(s.activo, true)
    ORDER BY s.orden ASC NULLS LAST, s.id
    LIMIT 1;

    UPDATE public.oportunidades o
    SET subestado_id = v_subestado,
        actualizado_en = coalesce(o.actualizado_en, now())
    WHERE o.etapa_id = v_stage.id
      AND (o.subestado_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.subestados_oportunidad s2
        WHERE s2.id = o.subestado_id AND s2.etapa_id = v_stage.id
      ));
  END LOOP;
END $$;

-- Toda oportunidad queda obligada a tener subetapa.
ALTER TABLE public.oportunidades
  ALTER COLUMN subestado_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_validar_subestado_oportunidad()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.etapa_id IS NULL OR NEW.subestado_id IS NULL THEN
    RAISE EXCEPTION 'Una oportunidad debe tener etapa y subetapa';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.subestados_oportunidad s
    WHERE s.id = NEW.subestado_id AND s.etapa_id = NEW.etapa_id
  ) THEN
    RAISE EXCEPTION 'La subetapa no pertenece a la etapa de la oportunidad';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_subestado_oportunidad ON public.oportunidades;
CREATE TRIGGER trg_validar_subestado_oportunidad
BEFORE INSERT OR UPDATE OF etapa_id, subestado_id ON public.oportunidades
FOR EACH ROW EXECUTE FUNCTION public.fn_validar_subestado_oportunidad();

CREATE OR REPLACE FUNCTION public.fn_proteger_ultima_subetapa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND OLD.activo IS TRUE AND NEW.activo IS FALSE))
     AND NOT EXISTS (
       SELECT 1 FROM public.subestados_oportunidad s
       WHERE s.etapa_id = OLD.etapa_id AND s.id <> OLD.id AND coalesce(s.activo, true)
     ) THEN
    RAISE EXCEPTION 'Cada etapa debe conservar al menos una subetapa activa';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_ultima_subetapa ON public.subestados_oportunidad;
CREATE TRIGGER trg_proteger_ultima_subetapa
BEFORE DELETE OR UPDATE OF activo ON public.subestados_oportunidad
FOR EACH ROW EXECUTE FUNCTION public.fn_proteger_ultima_subetapa();

-- Las oportunidades institucionales creadas automáticamente también nacen
-- dentro del funnel y ya no dejan etapa/subetapa nulas.
CREATE OR REPLACE FUNCTION public.fn_crear_oportunidad_universidad()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_etapa uuid;
  v_subestado uuid;
BEGIN
  SELECT id INTO v_etapa
  FROM public.etapas_embudo
  WHERE activo = true AND coalesce(es_etapa_final_ganada, false) = false
    AND coalesce(es_etapa_final_perdida, false) = false
  ORDER BY orden ASC NULLS LAST LIMIT 1;
  SELECT id INTO v_subestado
  FROM public.subestados_oportunidad
  WHERE etapa_id = v_etapa AND coalesce(activo, true)
  ORDER BY orden ASC NULLS LAST LIMIT 1;

  INSERT INTO public.oportunidades
    (codigo, tipo_oportunidad, universidad_id, nombre, etapa_id, subestado_id,
     estado, temperatura, puntaje, origen, canal_origen, creado_en, actualizado_en)
  SELECT
    'OP-UNI-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    'universidad', NEW.id, coalesce(NEW.nombre_corto, NEW.nombre_oficial, 'Universidad'),
    v_etapa, v_subestado, 'activa', 'tibio', 0, 'registro_universidad',
    'crud_universidades', now(), now()
  WHERE v_etapa IS NOT NULL AND v_subestado IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.oportunidades o
      WHERE o.universidad_id = NEW.id AND o.tipo_oportunidad = 'universidad' AND o.estado <> 'archivada'
    );
  RETURN NEW;
END;
$$;

COMMIT;
