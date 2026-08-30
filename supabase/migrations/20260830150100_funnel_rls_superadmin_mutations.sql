BEGIN;

ALTER TABLE public.etapas_embudo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subestados_oportunidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reglas_estancamiento ENABLE ROW LEVEL SECURITY;

-- Etapas: mutaciones solo super_admin.
DROP POLICY IF EXISTS lc_etapas_insert_super ON public.etapas_embudo;
CREATE POLICY lc_etapas_insert_super ON public.etapas_embudo
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS lc_etapas_update_super ON public.etapas_embudo;
CREATE POLICY lc_etapas_update_super ON public.etapas_embudo
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS lc_etapas_delete_super ON public.etapas_embudo;
CREATE POLICY lc_etapas_delete_super ON public.etapas_embudo
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- Subestados: mutaciones solo super_admin.
DROP POLICY IF EXISTS lc_subestados_insert_super ON public.subestados_oportunidad;
CREATE POLICY lc_subestados_insert_super ON public.subestados_oportunidad
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS lc_subestados_update_super ON public.subestados_oportunidad;
CREATE POLICY lc_subestados_update_super ON public.subestados_oportunidad
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS lc_subestados_delete_super ON public.subestados_oportunidad;
CREATE POLICY lc_subestados_delete_super ON public.subestados_oportunidad
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- Reglas: mutaciones solo super_admin.
DROP POLICY IF EXISTS lc_reglas_insert_super ON public.reglas_estancamiento;
CREATE POLICY lc_reglas_insert_super ON public.reglas_estancamiento
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS lc_reglas_update_super ON public.reglas_estancamiento;
CREATE POLICY lc_reglas_update_super ON public.reglas_estancamiento
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS lc_reglas_delete_super ON public.reglas_estancamiento;
CREATE POLICY lc_reglas_delete_super ON public.reglas_estancamiento
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

COMMIT;
