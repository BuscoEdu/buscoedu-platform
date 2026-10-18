-- =====================================================
-- E0 · Paso 3: decisiones del Orquestador sobre los 3 STOP (OK Jhon)
-- Proyecto: khnrnnoxyzuulagemfbh · Autor: Base de datos BuscoEdu · 2026-10-18
-- Una sola transacción; idempotente.
-- =====================================================
BEGIN;

-- Bloque 1 · 143100 recortada: SOLO crea fn_validar_aplicacion (aditivo).
-- Para qué: fn_ba031_convertir_si_consentido la llama y hoy no existe →
-- Aplicar por WhatsApp fallaba con persona existente. No toca fn_convertir_aplicacion.
-- =====================================================
-- FASE 3 · Validación de aplicaciones activas
-- Reglas:
-- 1) No permitir duplicado activo por persona+oferta+periodo.
-- 2) Máximo 3 aplicaciones activas por persona.
--
-- Estados activos definidos explícitamente en esta fase:
--   ['borrador', 'pendiente', 'enviada', 'en_revision']
-- Estados no activos (cerrados/no bloqueantes de nueva solicitud):
--   ['aprobada', 'rechazada', 'retirada', 'cancelada', 'cerrada']
--
-- Nota: en migraciones del repo no existe CHECK de aplicaciones.estado;
-- por eso se fija una lista explícita y versionada aquí.
-- =====================================================

CREATE OR REPLACE FUNCTION public.fn_validar_aplicacion(
  p_persona_id UUID,
  p_oferta_id UUID,
  p_periodo_academico_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aplicacion_id UUID;
  v_duplicadas INT := 0;
  v_activas INT := 0;
  v_estados_activos TEXT[] := ARRAY['borrador', 'pendiente', 'enviada', 'en_revision'];
BEGIN
  IF p_persona_id IS NULL OR p_oferta_id IS NULL OR p_periodo_academico_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'parametros_invalidos');
  END IF;

  -- Lock transaccional por persona para evitar carreras entre pestañas/reintentos simultáneos.
  PERFORM pg_advisory_xact_lock(hashtext('aplicaciones:' || p_persona_id::text));

  SELECT a.id, COUNT(*) OVER()
    INTO v_aplicacion_id, v_duplicadas
  FROM public.aplicaciones a
  WHERE a.persona_id = p_persona_id
    AND a.oferta_id = p_oferta_id
    AND a.periodo_academico_id = p_periodo_academico_id
    AND a.estado = ANY(v_estados_activos)
  ORDER BY a.creado_en DESC
  LIMIT 1;

  IF coalesce(v_duplicadas, 0) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'duplicada',
      'aplicacion_id', v_aplicacion_id
    );
  END IF;

  SELECT COUNT(*)
    INTO v_activas
  FROM public.aplicaciones a
  WHERE a.persona_id = p_persona_id
    AND a.estado = ANY(v_estados_activos);

  IF v_activas >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'limite_alcanzado');
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('ok', false, 'error', 'validacion_error', 'detalle', SQLERRM, 'sqlstate', SQLSTATE);
END;
$$;

COMMENT ON FUNCTION public.fn_validar_aplicacion(UUID, UUID, UUID) IS
'Valida duplicidad activa (persona+oferta+periodo) y limite de 3 aplicaciones activas por persona. Incluye lock transaccional por persona para concurrencia.';

-- -----------------------------------------------------
-- NOTA E0 (2026-10-18, Base de datos BuscoEdu, decisión Orquestador con OK Jhon):
-- Se RETIRÓ de esta migración la reescritura de fn_convertir_aplicacion.
-- Motivo: validaba DESPUÉS de crear persona/oportunidad/asignación y, con
-- 'duplicada' o 'limite_alcanzado', devolvía ok=false sin deshacer → oportunidades
-- huérfanas. Prod conserva la versión de 20260830103000.
-- Deuda E1: llamar fn_validar_aplicacion ANTES de cualquier escritura (o RAISE).
-- fn_ba031_convertir_si_consentido ya valida antes y deshace con RAISE.
-- -----------------------------------------------------

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT '20260830143100', 'fase3_validar_aplicacion', ARRAY[$mig$BEGIN;

-- =====================================================
-- FASE 3 · Validación de aplicaciones activas
-- Reglas:
-- 1) No permitir duplicado activo por persona+oferta+periodo.
-- 2) Máximo 3 aplicaciones activas por persona.
--
-- Estados activos definidos explícitamente en esta fase:
--   ['borrador', 'pendiente', 'enviada', 'en_revision']
-- Estados no activos (cerrados/no bloqueantes de nueva solicitud):
--   ['aprobada', 'rechazada', 'retirada', 'cancelada', 'cerrada']
--
-- Nota: en migraciones del repo no existe CHECK de aplicaciones.estado;
-- por eso se fija una lista explícita y versionada aquí.
-- =====================================================

CREATE OR REPLACE FUNCTION public.fn_validar_aplicacion(
  p_persona_id UUID,
  p_oferta_id UUID,
  p_periodo_academico_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aplicacion_id UUID;
  v_duplicadas INT := 0;
  v_activas INT := 0;
  v_estados_activos TEXT[] := ARRAY['borrador', 'pendiente', 'enviada', 'en_revision'];
BEGIN
  IF p_persona_id IS NULL OR p_oferta_id IS NULL OR p_periodo_academico_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'parametros_invalidos');
  END IF;

  -- Lock transaccional por persona para evitar carreras entre pestañas/reintentos simultáneos.
  PERFORM pg_advisory_xact_lock(hashtext('aplicaciones:' || p_persona_id::text));

  SELECT a.id, COUNT(*) OVER()
    INTO v_aplicacion_id, v_duplicadas
  FROM public.aplicaciones a
  WHERE a.persona_id = p_persona_id
    AND a.oferta_id = p_oferta_id
    AND a.periodo_academico_id = p_periodo_academico_id
    AND a.estado = ANY(v_estados_activos)
  ORDER BY a.creado_en DESC
  LIMIT 1;

  IF coalesce(v_duplicadas, 0) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'duplicada',
      'aplicacion_id', v_aplicacion_id
    );
  END IF;

  SELECT COUNT(*)
    INTO v_activas
  FROM public.aplicaciones a
  WHERE a.persona_id = p_persona_id
    AND a.estado = ANY(v_estados_activos);

  IF v_activas >= 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'limite_alcanzado');
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('ok', false, 'error', 'validacion_error', 'detalle', SQLERRM, 'sqlstate', SQLSTATE);
END;
$$;

COMMENT ON FUNCTION public.fn_validar_aplicacion(UUID, UUID, UUID) IS
'Valida duplicidad activa (persona+oferta+periodo) y limite de 3 aplicaciones activas por persona. Incluye lock transaccional por persona para concurrencia.';

-- -----------------------------------------------------
-- NOTA E0 (2026-10-18, Base de datos BuscoEdu, decisión Orquestador con OK Jhon):
-- Se RETIRÓ de esta migración la reescritura de fn_convertir_aplicacion.
-- Motivo: validaba DESPUÉS de crear persona/oportunidad/asignación y, con
-- 'duplicada' o 'limite_alcanzado', devolvía ok=false sin deshacer → oportunidades
-- huérfanas. Prod conserva la versión de 20260830103000.
-- Deuda E1: llamar fn_validar_aplicacion ANTES de cualquier escritura (o RAISE).
-- fn_ba031_convertir_si_consentido ya valida antes y deshace con RAISE.
-- -----------------------------------------------------

COMMIT;
$mig$]
WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20260830143100');

-- Bloque 2 · 20260815 ×2 renombradas en el repo (antes chocaban en versión).
-- Su efecto ya está en prod (verificado); solo se registran, sin DDL.
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
SELECT v.version, v.name, ARRAY[]::text[]
FROM (VALUES
  ('20260815000000','add_visitante_id_to_eventos_negocio'),
  ('20260815000100','rls_lectura_publica_relacionadas')
) AS v(version, name)
WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations s WHERE s.version = v.version);

-- 150100: descartada por decisión; NO se aplica ni se registra.

COMMIT;
