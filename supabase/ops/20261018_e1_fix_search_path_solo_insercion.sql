-- =====================================================
-- E1 · Fijar search_path de fn_ia_solo_insercion (advisor function_search_path_mutable)
-- Autor: Base de datos BuscoEdu (bot) · 2026-10-18 · dentro del OK E1 (Orquestador)
-- APLICADO en prod khnrnnoxyzuulagemfbh 2026-10-18 ~16:15 (Madrid). Evidencia: proconfig = {search_path=public}
-- Idempotente: repetirlo deja el mismo valor.
-- Deshacer: ALTER FUNCTION public.fn_ia_solo_insercion() RESET search_path;
-- =====================================================
ALTER FUNCTION public.fn_ia_solo_insercion() SET search_path = public;
