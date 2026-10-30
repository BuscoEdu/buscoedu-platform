-- DESHACER · FAMLY O6 admin RPC (local / ops)
-- Fecha: 2026-10-30 Europe/Madrid · Quién: Backend BuscoEdu (bot)
-- Quita RPCs O6 admin/nick/miembros. NO toca tablas BD (invitaciones/admins/rate_limit).
-- NO toca puntos beman27 ni columnas aditivas (activo/es_admin/rol_v6d).

DROP FUNCTION IF EXISTS public.familia_rpc_miembro_desactivar(integer);
DROP FUNCTION IF EXISTS public.familia_rpc_miembro_pin(integer, text);
DROP FUNCTION IF EXISTS public.familia_rpc_miembro_editar(integer, text, text, text);
DROP FUNCTION IF EXISTS public.familia_rpc_miembro_crear(text, text, text, text);
DROP FUNCTION IF EXISTS public.familia_rpc_miembros_listar();
DROP FUNCTION IF EXISTS public.familia_mf_o6_exige_admin();
DROP FUNCTION IF EXISTS public.familia_rpc_admin_login(text, text);
DROP FUNCTION IF EXISTS public.familia_rpc_admin_registrar(text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.familia_rpc_nick_sugerir(text);
DROP FUNCTION IF EXISTS public.familia_mf_o6_next_miembro_id();
DROP FUNCTION IF EXISTS public.familia_mf_o6_nick_ok(text);
-- sesion_ctx / pin_seguro: se dejan (pueden ser de O1–O3); no se dropean aquí.

DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  IF to_regclass('public.familia_miembros') IS NULL THEN RETURN; END IF;
  SELECT array_agg(puntos ORDER BY id) INTO v
    FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS NOT NULL AND cardinality(v) = 6 AND v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'o6_admin_undo_pts: %', v;
  END IF;
END $$;
