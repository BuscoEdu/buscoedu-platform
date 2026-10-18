-- =====================================================
-- HOTFIX (PREPARADO, NO APLICADO) · permisos de fn_cambiar_etapa(uuid,uuid,uuid,text)
-- Autor: Base de datos BuscoEdu (bot) · 2026-10-18 · esperando OK de Jhon vía Orquestador
-- Por qué: es SECURITY DEFINER, no valida quién llama (no usa auth.uid()) y tiene EXECUTE
--   para PUBLIC, anon y authenticated → con la llave pública se puede mover de etapa
--   cualquier oportunidad por RPC.
-- Respaldo ACL (prod, 2026-10-18): {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- Llamadores reales:
--   · Código: SOLO app/api/leadcenter/oportunidad/[id]/etapa/route.ts → getServerSupabase()
--     (llave anon + cookies del usuario del Lead Center) ⇒ corre como authenticated.
--   · BD: ninguna otra función la llama.
-- Deshacer: supabase/ops/20261018_hotfix_revocar_execute_cambiar_etapa_deshacer.sql
-- =====================================================

-- FASE 1 (segura hoy, no rompe el Lead Center): quitar PUBLIC y anon.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.fn_cambiar_etapa(uuid,uuid,uuid,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cambiar_etapa(uuid,uuid,uuid,text) TO authenticated, service_role;
COMMIT;

-- FASE 2 (SOLO después de que el route use getServiceRoleClient() tras validar la sesión
-- y ese cambio esté desplegado; si no, el Lead Center no podrá cambiar etapas):
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.fn_cambiar_etapa(uuid,uuid,uuid,text) FROM authenticated;
-- COMMIT;

-- Verificación (fase 1: anon=false, authenticated=true, service_role=true; fase 2: authenticated=false)
SELECT has_function_privilege('anon','public.fn_cambiar_etapa(uuid,uuid,uuid,text)','execute') AS anon,
       has_function_privilege('authenticated','public.fn_cambiar_etapa(uuid,uuid,uuid,text)','execute') AS authenticated,
       has_function_privilege('service_role','public.fn_cambiar_etapa(uuid,uuid,uuid,text)','execute') AS service_role;
