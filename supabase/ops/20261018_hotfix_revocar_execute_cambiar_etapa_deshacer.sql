-- =====================================================
-- DESHACER hotfix permisos fn_cambiar_etapa · Base de datos BuscoEdu (bot) · 2026-10-18
-- Devuelve el ACL original (PUBLIC, anon, authenticated, service_role). ⚠ Reabre el hueco.
-- =====================================================
BEGIN;
GRANT EXECUTE ON FUNCTION public.fn_cambiar_etapa(uuid,uuid,uuid,text) TO PUBLIC, anon, authenticated, service_role;
COMMIT;
