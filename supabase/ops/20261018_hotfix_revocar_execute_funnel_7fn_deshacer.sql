-- =====================================================
-- DESHACER fase 1 permisos 7 funciones del embudo · Base de datos BuscoEdu (bot) · 2026-10-18
-- Devuelve el ACL original (PUBLIC, anon, authenticated, service_role). ⚠ Reabre el hueco.
-- =====================================================
BEGIN;
GRANT EXECUTE ON FUNCTION public.fn_cerrar_ganada(uuid,jsonb,text), public.fn_cerrar_perdida(uuid,uuid,text,text), public.fn_cerrar_oportunidad(uuid,text,text,text,jsonb,jsonb,text), public.fn_reabrir_oportunidad(uuid,uuid,uuid,text,text), public.fn_registrar_contacto(uuid,uuid,text,text,text,boolean,timestamptz,text), public.fn_crear_oportunidad_universidad(), public.fn_evaluar_estancamiento(integer) TO PUBLIC, anon, authenticated, service_role;
COMMIT;
-- Nota: este GRANT también devuelve authenticated a fn_evaluar_estancamiento (deshace la fase 2).
