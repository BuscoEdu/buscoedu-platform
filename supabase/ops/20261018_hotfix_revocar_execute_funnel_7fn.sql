-- =====================================================
-- HOTFIX APLICADO en prod 2026-10-18 ~16:30 Madrid (OK de Jhon) · Fase 1 en 7 funciones + fase 2 en fn_evaluar_estancamiento
-- Autor: Base de datos BuscoEdu (bot) · 2026-10-18 · espera OK de Jhon vía Orquestador
-- Por qué: las 7 son SECURITY DEFINER (dueño postgres) con EXECUTE para PUBLIC y anon →
--   sin sesión se puede cerrar/reabrir oportunidades, registrar contactos o correr el
--   estancamiento en masa por RPC con la llave pública.
-- Respaldo ACL (prod 2026-10-18, igual en las 7):
--   {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- Llamadores reales:
--   · Lead Center (getServerSupabase = authenticated): cerrar-ganada, cerrar-perdida, reabrir,
--     contacto, cierre (fn_cerrar_oportunidad / fn_reabrir_oportunidad) → conservan permiso.
--   · Cron /api/cron/automatizaciones → fn_evaluar_estancamiento con service_role → conserva.
--   · fn_crear_oportunidad_universidad = función de trigger (trg_universidad_crea_oportunidad
--     ON universidades); Postgres no revisa EXECUTE al disparar el trigger → sin impacto.
--   · En BD: ninguna otra función las llama. Sin pg_cron, pg_net ni edge functions.
-- Ensayo en prod con ROLLBACK (2026-10-18): anon = 42501 en las 6 invocables; authenticated
--   ejecuta (5 devuelven no_autorizado con ids falsos; estancamiento con límite 0 = ok);
--   ACL intacto tras el rollback.
-- Deshacer: supabase/ops/20261018_hotfix_revocar_execute_funnel_7fn_deshacer.sql
-- =====================================================

-- Bloque 1: quitar el permiso a PUBLIC y anon.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.fn_cerrar_ganada(uuid,jsonb,text), public.fn_cerrar_perdida(uuid,uuid,text,text), public.fn_cerrar_oportunidad(uuid,text,text,text,jsonb,jsonb,text), public.fn_reabrir_oportunidad(uuid,uuid,uuid,text,text), public.fn_registrar_contacto(uuid,uuid,text,text,text,boolean,timestamptz,text), public.fn_crear_oportunidad_universidad(), public.fn_evaluar_estancamiento(integer) FROM PUBLIC, anon;
-- Bloque 2: asegurar permisos de Lead Center (authenticated) y servidor (service_role).
GRANT  EXECUTE ON FUNCTION public.fn_cerrar_ganada(uuid,jsonb,text), public.fn_cerrar_perdida(uuid,uuid,text,text), public.fn_cerrar_oportunidad(uuid,text,text,text,jsonb,jsonb,text), public.fn_reabrir_oportunidad(uuid,uuid,uuid,text,text), public.fn_registrar_contacto(uuid,uuid,text,text,text,boolean,timestamptz,text), public.fn_crear_oportunidad_universidad(), public.fn_evaluar_estancamiento(integer) TO authenticated, service_role;
COMMIT;

-- Bloque 3: verificación (esperado: anon=false, authenticated=true, service_role=true en las 7).
SELECT p.oid::regprocedure AS funcion,
       has_function_privilege('anon', p.oid, 'execute') AS anon,
       has_function_privilege('authenticated', p.oid, 'execute') AS authenticated,
       has_function_privilege('service_role', p.oid, 'execute') AS service_role,
       p.proacl::text AS acl
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN ('fn_cerrar_ganada','fn_cerrar_perdida','fn_cerrar_oportunidad','fn_reabrir_oportunidad',
                    'fn_registrar_contacto','fn_crear_oportunidad_universidad','fn_evaluar_estancamiento');

-- FASE 2 (APLICADA solo en fn_evaluar_estancamiento): fn_evaluar_estancamiento no valida quién llama y solo la usa el
-- cron (service_role) → también se le podría quitar authenticated:
REVOKE EXECUTE ON FUNCTION public.fn_evaluar_estancamiento(integer) FROM authenticated;  -- APLICADO (fase 2)
