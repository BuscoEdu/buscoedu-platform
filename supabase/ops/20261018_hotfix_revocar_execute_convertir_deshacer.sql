-- =====================================================
-- DESHACER hotfix 20261018_hotfix_revocar_execute_convertir
-- Autor: Base de datos BuscoEdu (bot) · 2026-10-18
-- Qué hace: devuelve EXECUTE a PUBLIC, anon y authenticated (ACL original).
-- ⚠ Reabre el hueco (crear leads por RPC sin la API). Usar solo si el hotfix rompe
--   algo y mientras se corrige.
-- =====================================================
BEGIN;
GRANT EXECUTE ON FUNCTION public.fn_convertir_aplicacion(jsonb) TO PUBLIC, anon, authenticated;
COMMIT;
