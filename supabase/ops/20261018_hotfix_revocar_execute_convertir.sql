-- =====================================================
-- HOTFIX PROD · Revocar EXECUTE público de fn_convertir_aplicacion(jsonb)
-- Autor: Base de datos BuscoEdu (bot) · 2026-10-18 · OK de Jhon vía Orquestador
-- Por qué: la función es SECURITY DEFINER y tenía EXECUTE para PUBLIC, anon y
--   authenticated → cualquiera con la llave pública podía crear personas, leads y
--   transferencias por RPC sin pasar por la API. El único llamador real es el
--   servidor (/api/leadcenter/convertir con service_role) y fn_ba031_convertir_si_consentido
--   (SECURITY DEFINER, dueño postgres, no depende de este permiso).
-- Alcance: SOLO permisos. No cambia el código de la función ni aplica migraciones.
-- Respaldo (ACL antes): {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- Deshacer: supabase/ops/20261018_hotfix_revocar_execute_convertir_deshacer.sql
-- =====================================================
BEGIN;
-- Bloque 1: quitar el permiso a todos los roles del cliente.
REVOKE EXECUTE ON FUNCTION public.fn_convertir_aplicacion(jsonb) FROM PUBLIC, anon, authenticated;
-- Bloque 2: asegurar el permiso del servidor.
GRANT EXECUTE ON FUNCTION public.fn_convertir_aplicacion(jsonb) TO service_role;
COMMIT;

-- Bloque 3: verificación (debe dar anon=false, authenticated=false, service_role=true).
SELECT has_function_privilege('anon', 'public.fn_convertir_aplicacion(jsonb)', 'execute') AS anon,
       has_function_privilege('authenticated', 'public.fn_convertir_aplicacion(jsonb)', 'execute') AS authenticated,
       has_function_privilege('service_role', 'public.fn_convertir_aplicacion(jsonb)', 'execute') AS service_role;
