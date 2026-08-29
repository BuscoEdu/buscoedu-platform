-- =====================================================
-- LEAD CENTER — FASE 1 · Migración 4
-- Funciones de identidad + RLS del CRM para asesor / super_admin
-- =====================================================
-- REGLA CLAVE (Parte II §18 del prompt):
--   auth.uid()
--   -> usuarios_internos.auth_user_id
--   -> usuarios_internos.id
--   -> asignación vigente de la oportunidad (oportunidades.asesor_asignado_id)
--
-- Este script SOLO AGREGA políticas nombradas con prefijo `lc_`. No elimina ni
-- reemplaza políticas públicas existentes (p. ej. lectura pública de catálogo o
-- INSERT anónimo en visitantes/eventos_negocio del explorador). `ENABLE ROW
-- LEVEL SECURITY` es idempotente. Todas las escrituras del flujo de conversión
-- (persona anónima) se hacen por RPC con service role y NO dependen de estas
-- políticas.
-- =====================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers de identidad (SECURITY DEFINER para poder leer usuarios_internos)
-- ---------------------------------------------------------------------------

-- id interno del usuario autenticado (o NULL si no es usuario interno activo).
CREATE OR REPLACE FUNCTION public.usuario_interno_id()
RETURNS UUID AS $$
  SELECT ui.id
  FROM public.usuarios_internos ui
  WHERE ui.auth_user_id = auth.uid()
    AND ui.activo = true
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.usuario_interno_id() IS 'Mapea auth.uid() -> usuarios_internos.id (activo). NULL si no aplica.';

-- ¿el usuario autenticado es asesor o super_admin activo?
CREATE OR REPLACE FUNCTION public.es_asesor_o_super()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON r.id = ui.rol_id
    WHERE ui.auth_user_id = auth.uid()
      AND ui.activo = true
      AND r.codigo IN ('super_admin','asesor')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.es_asesor_o_super() IS 'true si el usuario autenticado es asesor o super_admin activo.';

-- ¿el usuario puede ver ESTA oportunidad? (super todo; asesor solo asignadas)
CREATE OR REPLACE FUNCTION public.puede_ver_oportunidad(p_oportunidad_id UUID)
RETURNS BOOLEAN AS $$
  SELECT
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.oportunidades o
      WHERE o.id = p_oportunidad_id
        AND o.asesor_asignado_id = public.usuario_interno_id()
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.puede_ver_oportunidad(UUID) IS 'super_admin ve todo; asesor solo oportunidades cuya asignación vigente es suya.';

-- ¿el usuario puede ver ESTA persona? (super todo; asesor si tiene alguna
-- oportunidad asignada de esa persona)
CREATE OR REPLACE FUNCTION public.puede_ver_persona(p_persona_id UUID)
RETURNS BOOLEAN AS $$
  SELECT
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.oportunidades o
      WHERE o.persona_id = p_persona_id
        AND o.asesor_asignado_id = public.usuario_interno_id()
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.puede_ver_persona(UUID) IS 'super_admin ve todas; asesor solo personas con al menos una oportunidad asignada a él.';

-- ---------------------------------------------------------------------------
-- Habilitar RLS (idempotente) en tablas del CRM del Lead Center
-- ---------------------------------------------------------------------------
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oportunidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aplicaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propuestas_comerciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.versiones_propuesta_comercial ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_etapas_oportunidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_scoring_oportunidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asignaciones_oportunidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tareas_crm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notas_crm ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes_conversacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hechos_extraidos_naia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consentimientos_persona ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferencias_universidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicaciones_transaccionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preferencias_educativas_persona ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perfil_progresivo_persona ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etapas_embudo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subestados_oportunidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reglas_estancamiento ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Catálogos del embudo: lectura para cualquier asesor/super
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS lc_etapas_select ON public.etapas_embudo;
CREATE POLICY lc_etapas_select ON public.etapas_embudo
  FOR SELECT TO authenticated USING (public.es_asesor_o_super());

DROP POLICY IF EXISTS lc_subestados_select ON public.subestados_oportunidad;
CREATE POLICY lc_subestados_select ON public.subestados_oportunidad
  FOR SELECT TO authenticated USING (public.es_asesor_o_super());

DROP POLICY IF EXISTS lc_reglas_select ON public.reglas_estancamiento;
CREATE POLICY lc_reglas_select ON public.reglas_estancamiento
  FOR SELECT TO authenticated USING (public.es_asesor_o_super());

-- ---------------------------------------------------------------------------
-- OPORTUNIDADES: super todo; asesor solo asignadas
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS lc_oportunidades_select ON public.oportunidades;
CREATE POLICY lc_oportunidades_select ON public.oportunidades
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR asesor_asignado_id = public.usuario_interno_id()
  );

DROP POLICY IF EXISTS lc_oportunidades_update ON public.oportunidades;
CREATE POLICY lc_oportunidades_update ON public.oportunidades
  FOR UPDATE TO authenticated
  USING (
    public.is_super_admin()
    OR asesor_asignado_id = public.usuario_interno_id()
  )
  WITH CHECK (
    public.is_super_admin()
    OR asesor_asignado_id = public.usuario_interno_id()
  );

-- ---------------------------------------------------------------------------
-- PERSONAS: super todas; asesor solo personas de sus oportunidades
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS lc_personas_select ON public.personas;
CREATE POLICY lc_personas_select ON public.personas
  FOR SELECT TO authenticated
  USING (public.puede_ver_persona(id));

-- ---------------------------------------------------------------------------
-- Tablas hijas de oportunidad: alcance por puede_ver_oportunidad()
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS lc_aplicaciones_select ON public.aplicaciones;
CREATE POLICY lc_aplicaciones_select ON public.aplicaciones
  FOR SELECT TO authenticated USING (public.puede_ver_oportunidad(oportunidad_id));

DROP POLICY IF EXISTS lc_propuestas_select ON public.propuestas_comerciales;
CREATE POLICY lc_propuestas_select ON public.propuestas_comerciales
  FOR SELECT TO authenticated USING (public.puede_ver_oportunidad(oportunidad_id));

DROP POLICY IF EXISTS lc_versiones_select ON public.versiones_propuesta_comercial;
CREATE POLICY lc_versiones_select ON public.versiones_propuesta_comercial
  FOR SELECT TO authenticated USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.propuestas_comerciales p
      WHERE p.id = versiones_propuesta_comercial.propuesta_id
        AND public.puede_ver_oportunidad(p.oportunidad_id)
    )
  );

DROP POLICY IF EXISTS lc_hist_etapas_select ON public.historial_etapas_oportunidad;
CREATE POLICY lc_hist_etapas_select ON public.historial_etapas_oportunidad
  FOR SELECT TO authenticated USING (public.puede_ver_oportunidad(oportunidad_id));

DROP POLICY IF EXISTS lc_hist_scoring_select ON public.historial_scoring_oportunidad;
CREATE POLICY lc_hist_scoring_select ON public.historial_scoring_oportunidad
  FOR SELECT TO authenticated USING (public.puede_ver_oportunidad(oportunidad_id));

DROP POLICY IF EXISTS lc_asignaciones_select ON public.asignaciones_oportunidad;
CREATE POLICY lc_asignaciones_select ON public.asignaciones_oportunidad
  FOR SELECT TO authenticated USING (public.puede_ver_oportunidad(oportunidad_id));

DROP POLICY IF EXISTS lc_transferencias_select ON public.transferencias_universidad;
CREATE POLICY lc_transferencias_select ON public.transferencias_universidad
  FOR SELECT TO authenticated USING (public.puede_ver_oportunidad(oportunidad_id));

DROP POLICY IF EXISTS lc_comunicaciones_select ON public.comunicaciones_transaccionales;
CREATE POLICY lc_comunicaciones_select ON public.comunicaciones_transaccionales
  FOR SELECT TO authenticated USING (
    oportunidad_id IS NULL AND public.is_super_admin()
    OR public.puede_ver_oportunidad(oportunidad_id)
  );

-- Conversaciones / mensajes / hechos NaIA
DROP POLICY IF EXISTS lc_conversaciones_select ON public.conversaciones;
CREATE POLICY lc_conversaciones_select ON public.conversaciones
  FOR SELECT TO authenticated USING (
    public.is_super_admin()
    OR (oportunidad_id IS NOT NULL AND public.puede_ver_oportunidad(oportunidad_id))
    OR (persona_id IS NOT NULL AND public.puede_ver_persona(persona_id))
  );

DROP POLICY IF EXISTS lc_mensajes_select ON public.mensajes_conversacion;
CREATE POLICY lc_mensajes_select ON public.mensajes_conversacion
  FOR SELECT TO authenticated USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.conversaciones c
      WHERE c.id = mensajes_conversacion.conversacion_id
        AND (
          (c.oportunidad_id IS NOT NULL AND public.puede_ver_oportunidad(c.oportunidad_id))
          OR (c.persona_id IS NOT NULL AND public.puede_ver_persona(c.persona_id))
        )
    )
  );

DROP POLICY IF EXISTS lc_hechos_select ON public.hechos_extraidos_naia;
CREATE POLICY lc_hechos_select ON public.hechos_extraidos_naia
  FOR SELECT TO authenticated USING (public.puede_ver_persona(persona_id));

-- Consentimientos / preferencias / perfil de la persona
DROP POLICY IF EXISTS lc_consentimientos_select ON public.consentimientos_persona;
CREATE POLICY lc_consentimientos_select ON public.consentimientos_persona
  FOR SELECT TO authenticated USING (public.puede_ver_persona(persona_id));

DROP POLICY IF EXISTS lc_preferencias_select ON public.preferencias_educativas_persona;
CREATE POLICY lc_preferencias_select ON public.preferencias_educativas_persona
  FOR SELECT TO authenticated USING (public.puede_ver_persona(persona_id));

DROP POLICY IF EXISTS lc_perfil_select ON public.perfil_progresivo_persona;
CREATE POLICY lc_perfil_select ON public.perfil_progresivo_persona
  FOR SELECT TO authenticated USING (public.puede_ver_persona(persona_id));

-- ---------------------------------------------------------------------------
-- NOTAS y TAREAS: lectura + escritura por asesor asignado / super
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS lc_notas_select ON public.notas_crm;
CREATE POLICY lc_notas_select ON public.notas_crm
  FOR SELECT TO authenticated USING (public.puede_ver_oportunidad(oportunidad_id));

DROP POLICY IF EXISTS lc_notas_insert ON public.notas_crm;
CREATE POLICY lc_notas_insert ON public.notas_crm
  FOR INSERT TO authenticated WITH CHECK (public.puede_ver_oportunidad(oportunidad_id));

DROP POLICY IF EXISTS lc_tareas_select ON public.tareas_crm;
CREATE POLICY lc_tareas_select ON public.tareas_crm
  FOR SELECT TO authenticated USING (public.puede_ver_oportunidad(oportunidad_id));

DROP POLICY IF EXISTS lc_tareas_insert ON public.tareas_crm;
CREATE POLICY lc_tareas_insert ON public.tareas_crm
  FOR INSERT TO authenticated WITH CHECK (public.puede_ver_oportunidad(oportunidad_id));

DROP POLICY IF EXISTS lc_tareas_update ON public.tareas_crm;
CREATE POLICY lc_tareas_update ON public.tareas_crm
  FOR UPDATE TO authenticated
  USING (public.puede_ver_oportunidad(oportunidad_id))
  WITH CHECK (public.puede_ver_oportunidad(oportunidad_id));

-- ---------------------------------------------------------------------------
-- EVENTOS_NEGOCIO: agregar SELECT para asesor/super SIN tocar el INSERT anónimo
-- existente del explorador (política pública creada fuera del repo).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS lc_eventos_select ON public.eventos_negocio;
CREATE POLICY lc_eventos_select ON public.eventos_negocio
  FOR SELECT TO authenticated USING (public.es_asesor_o_super());

COMMIT;
