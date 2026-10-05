-- =====================================================
-- A1 · Demo WApp: hilo en intenciones de aplicar + flag es_qa
-- PR único fix/a1-catalogo-demowapp (Ola 1/3 BD).
-- Aditiva, idempotente y reversible (rollback en docs/bd/README-a1-hilo-es-qa.md).
-- No aplicar desde aquí: Jhon la pega en el SQL Editor antes del merge.
-- =====================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Hilo activo en la intención de aplicar.
-- Filas del 27-sep quedan NULL (no se deduce su hilo = no se inventa).
-- BE responde 409 hilo_no_coincide si la clave existe con otro hilo o NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE public.intenciones_aplicar_demowapp
  ADD COLUMN IF NOT EXISTS oportunidad_hilo_id uuid NULL
  REFERENCES public.oportunidades(id);

COMMENT ON COLUMN public.intenciones_aplicar_demowapp.oportunidad_hilo_id IS
  'A1. Oportunidad del hilo activo que inició la intención. NULL en filas previas a A1.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_intenciones_aplicar_demowapp_clave_hilo
  ON public.intenciones_aplicar_demowapp (clave_idempotencia, oportunidad_hilo_id);

CREATE INDEX IF NOT EXISTS idx_intenciones_aplicar_demowapp_hilo
  ON public.intenciones_aplicar_demowapp (oportunidad_hilo_id)
  WHERE oportunidad_hilo_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Flag es_qa. Default false: las filas actuales no se tocan.
-- Leads hacia universidad = aplicaciones + transferencias_universidad.
-- ---------------------------------------------------------------------------
ALTER TABLE public.personas      ADD COLUMN IF NOT EXISTS es_qa boolean NOT NULL DEFAULT false;
ALTER TABLE public.oportunidades ADD COLUMN IF NOT EXISTS es_qa boolean NOT NULL DEFAULT false;
ALTER TABLE public.aplicaciones  ADD COLUMN IF NOT EXISTS es_qa boolean NOT NULL DEFAULT false;
ALTER TABLE public.transferencias_universidad ADD COLUMN IF NOT EXISTS es_qa boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_personas_es_qa      ON public.personas (id) WHERE es_qa;
CREATE INDEX IF NOT EXISTS idx_oportunidades_es_qa ON public.oportunidades (id) WHERE es_qa;
CREATE INDEX IF NOT EXISTS idx_aplicaciones_es_qa  ON public.aplicaciones (id) WHERE es_qa;
CREATE INDEX IF NOT EXISTS idx_transferencias_universidad_es_qa
  ON public.transferencias_universidad (id) WHERE es_qa;

COMMENT ON COLUMN public.oportunidades.es_qa IS
  'A1. Dato de prueba: fuera de cobro, conteos, B2B, notificaciones y exportes. Solo visible a super-admin.';

-- Cobro fail-closed: una transferencia QA nunca puede quedar facturable.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'transferencias_universidad_qa_no_facturable') THEN
    ALTER TABLE public.transferencias_universidad
      ADD CONSTRAINT transferencias_universidad_qa_no_facturable
      CHECK (NOT (es_qa AND coalesce(es_facturable, false)));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Conversión del hilo: misma firma y misma lógica fail-closed de BA-031;
-- solo agrega la herencia de es_qa tras una conversión ok.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ba031_convertir_si_consentido(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oferta uuid := nullif(p_payload->>'oferta_id', '')::uuid;
  v_celular text := nullif(p_payload->>'celular_e164', '');
  v_modelo text;
  v_periodo uuid;
  v_persona uuid;
  v_validacion jsonb;
  v_result jsonb;
  v_es_qa boolean;
BEGIN
  -- Solo el booleano JSON true. El texto "true" no cuenta.
  IF jsonb_typeof(p_payload->'consentimiento_aceptado') IS DISTINCT FROM 'boolean'
     OR p_payload->'consentimiento_aceptado' IS DISTINCT FROM 'true'::jsonb THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consentimiento_no_aceptado');
  END IF;

  IF v_oferta IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'oferta_id_requerida');
  END IF;

  IF v_celular IS NULL OR length(v_celular) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'celular_requerido');
  END IF;

  SELECT coalesce(modelo_negocio, 'por_inscrito'), periodo_academico_id
    INTO v_modelo, v_periodo
  FROM public.ofertas_academicas
  WHERE id = v_oferta
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'oferta_inexistente');
  END IF;

  IF v_periodo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'oferta_sin_periodo');
  END IF;

  -- Obligatorios del catálogo vigente. Ausente o no-true = no otorgado.
  IF EXISTS (
    SELECT 1
    FROM public.tipos_consentimiento t
    WHERE t.activo = true
      AND t.es_obligatorio = true
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(coalesce(p_payload->'consentimientos', '[]'::jsonb)) c
        WHERE c->>'codigo' = t.codigo
          AND jsonb_typeof(c->'otorgado') = 'boolean'
          AND c->'otorgado' = 'true'::jsonb
      )
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consentimiento_obligatorio_faltante');
  END IF;

  IF v_modelo = 'por_lead' AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_payload->'consentimientos', '[]'::jsonb)) c
    WHERE c->>'codigo' = 'transferencia_universidad'
      AND jsonb_typeof(c->'otorgado') = 'boolean'
      AND c->'otorgado' = 'true'::jsonb
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consentimiento_transferencia_requerido');
  END IF;

  -- Aplicar no es autorizar contacto. Tratamiento de datos, solo, no abre lead.
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_payload->'consentimientos', '[]'::jsonb)) c
    WHERE c->>'codigo' IN ('contacto', 'contacto_whatsapp', 'transferencia_universidad')
      AND jsonb_typeof(c->'otorgado') = 'boolean'
      AND c->'otorgado' = 'true'::jsonb
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consentimiento_no_aceptado');
  END IF;

  SELECT id INTO v_persona
  FROM public.personas
  WHERE celular_e164 = v_celular
  ORDER BY creado_en DESC
  LIMIT 1;

  -- Misma regla que fn_validar_aplicacion, antes de escribir.
  IF v_persona IS NOT NULL THEN
    v_validacion := public.fn_validar_aplicacion(v_persona, v_oferta, v_periodo);
    IF coalesce((v_validacion->>'ok')::boolean, false) IS NOT TRUE THEN
      RETURN v_validacion;
    END IF;
  END IF;

  v_result := public.fn_convertir_aplicacion(p_payload);

  -- La RPC histórica inserta la oportunidad y, si la validación falla
  -- después, responde ok=false sin deshacer. Aquí sí se deshace.
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'ba031_sin_lead:%', coalesce(v_result->>'error', 'rpc_error');
  END IF;

  -- A1: el lead hereda es_qa de la persona/oportunidad (o del payload que
  -- arma el servidor para sesiones QA). Los leads QA SÍ se crean, pero
  -- nunca son facturables ni cuentan para negocio.
  SELECT coalesce((p_payload->'es_qa') = 'true'::jsonb, false)
      OR coalesce((SELECT p.es_qa FROM public.personas p
                   WHERE p.id = nullif(v_result->>'persona_id','')::uuid), false)
      OR coalesce((SELECT o.es_qa FROM public.oportunidades o
                   WHERE o.id = nullif(v_result->>'oportunidad_id','')::uuid), false)
    INTO v_es_qa;

  IF v_es_qa THEN
    UPDATE public.personas SET es_qa = true
     WHERE id = nullif(v_result->>'persona_id','')::uuid AND es_qa = false;
    UPDATE public.oportunidades SET es_qa = true
     WHERE id = nullif(v_result->>'oportunidad_id','')::uuid AND es_qa = false;
    UPDATE public.aplicaciones SET es_qa = true
     WHERE id = nullif(v_result->>'aplicacion_id','')::uuid;
    UPDATE public.transferencias_universidad
       SET es_qa = true, es_facturable = false
     WHERE oportunidad_id = nullif(v_result->>'oportunidad_id','')::uuid;
    v_result := v_result || jsonb_build_object('es_qa', true);
  END IF;

  RETURN v_result;
END;
$$;


COMMENT ON FUNCTION public.fn_ba031_convertir_si_consentido(jsonb) IS
  'BA-031 + A1. Crea persona+oportunidad+aplicación solo con consentimiento aceptado. Leads QA se crean marcados es_qa y no facturables.';

-- Grants iguales a BA-031 (CREATE OR REPLACE los conserva; se reafirman).
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.fn_ba031_convertir_si_consentido(jsonb) FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_ba031_convertir_si_consentido(jsonb) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.fn_ba031_convertir_si_consentido(jsonb) FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.fn_ba031_convertir_si_consentido(jsonb) TO service_role';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Vistas: el repo no define vistas de Lead Center, cobro, B2B ni exportes
-- (consultas viven en src/ → filtro es_qa lo aplica BE en la Ola 1).
-- ---------------------------------------------------------------------------

COMMIT;

NOTIFY pgrst, 'reload schema';
