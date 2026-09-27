-- =====================================================
-- BA-031 · Funnel aplicar → registro → consentimiento
-- en el hilo de Demo WhatsApp, antes de cualquier lead.
-- =====================================================
-- No toca Meta Cloud ni el canal web.
-- No modifica fn_convertir_aplicacion: la envuelve y,
-- si esa RPC escribe y luego responde ok=false, revierte.
-- No aplicar en producción desde este cambio: el SQL queda
-- listo para pegar (ver docs/backend/README-ba031.md).
-- =====================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Borrador del hilo. No es oportunidad, aplicación ni catálogo.
-- persona/oportunidad/aplicación solo pueden llenarse en paso 'aceptada'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intenciones_aplicar_demowapp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oferta_id uuid NOT NULL REFERENCES public.ofertas_academicas(id),
  paso text NOT NULL,
  clave_idempotencia text NOT NULL,
  nombre_completo text,
  correo text,
  celular_e164 text,
  pais_celular text,
  visitante_id uuid,
  modelo_negocio text,
  oferta_nombre text,
  consentimientos jsonb NOT NULL DEFAULT '[]'::jsonb,
  traza_consentimiento jsonb,
  mensajes jsonb NOT NULL DEFAULT '[]'::jsonb,
  persona_id uuid REFERENCES public.personas(id),
  oportunidad_id uuid REFERENCES public.oportunidades(id),
  aplicacion_id uuid REFERENCES public.aplicaciones(id),
  ip_origen text,
  motivo_cierre text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  resuelto_en timestamptz,
  CONSTRAINT intenciones_aplicar_demowapp_paso_check CHECK (
    paso IN (
      'mi_lista',
      'iniciada',
      'datos',
      'consentimiento',
      'aceptada',
      'rechazada',
      'abandonada'
    )
  ),
  CONSTRAINT intenciones_aplicar_demowapp_lead_solo_aceptada CHECK (
    (
      paso = 'aceptada'
      AND persona_id IS NOT NULL
      AND oportunidad_id IS NOT NULL
      AND aplicacion_id IS NOT NULL
    )
    OR (
      paso <> 'aceptada'
      AND persona_id IS NULL
      AND oportunidad_id IS NULL
      AND aplicacion_id IS NULL
    )
  )
);

COMMENT ON TABLE public.intenciones_aplicar_demowapp IS
  'BA-031. Intención de aplicar en el hilo Demo WhatsApp. No es un lead: la oportunidad solo se liga si paso = aceptada.';
COMMENT ON COLUMN public.intenciones_aplicar_demowapp.paso IS
  'mi_lista | iniciada | datos | consentimiento | aceptada | rechazada | abandonada. Mi lista no transiciona a lead.';
COMMENT ON COLUMN public.intenciones_aplicar_demowapp.traza_consentimiento IS
  'Snapshot del consentimiento del hilo, con oportunidad_id solo tras aceptar.';
COMMENT ON COLUMN public.intenciones_aplicar_demowapp.mensajes IS
  'Burbujas del funnel antes de que exista conversación CRM (la conversación exige oportunidad).';

CREATE UNIQUE INDEX IF NOT EXISTS uq_intenciones_aplicar_demowapp_clave
  ON public.intenciones_aplicar_demowapp (clave_idempotencia);

CREATE INDEX IF NOT EXISTS idx_intenciones_aplicar_demowapp_oferta_paso
  ON public.intenciones_aplicar_demowapp (oferta_id, paso);

CREATE INDEX IF NOT EXISTS idx_intenciones_aplicar_demowapp_oportunidad
  ON public.intenciones_aplicar_demowapp (oportunidad_id)
  WHERE oportunidad_id IS NOT NULL;

-- Lectura para super admin. Escritura solo vía service role (bypass RLS).
ALTER TABLE public.intenciones_aplicar_demowapp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ba031_intenciones_select_super ON public.intenciones_aplicar_demowapp;
CREATE POLICY ba031_intenciones_select_super
  ON public.intenciones_aplicar_demowapp
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Conversión del hilo. Reusa fn_convertir_aplicacion.
-- Fail-closed: sin consentimiento_aceptado, sin obligatorios,
-- sin autorización de contacto (y sin transferencia si la oferta es
-- por_lead) no llama a la conversión.
-- Si la RPC interna deja filas y responde ok=false, RAISE revierte.
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

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.fn_ba031_convertir_si_consentido(jsonb) IS
  'BA-031. Crea persona+oportunidad+aplicación solo con consentimiento aceptado. Si fn_convertir_aplicacion escribe y falla, la transacción se revierte.';

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

COMMIT;
