-- DESHACER · RPC familia_rpc_admin_hallazgo_crear
-- Fecha: 2026-10-31 Europe/Madrid · Quién: Backend BuscoEdu (bot)
-- Solo quita la RPC. NO toca public.famly_hallazgos (dueño BD).

DROP FUNCTION IF EXISTS public.familia_rpc_admin_hallazgo_crear(text, text);

DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  IF to_regclass('public.familia_miembros') IS NULL THEN RETURN; END IF;
  SELECT array_agg(puntos ORDER BY id) INTO v
    FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS NOT NULL AND cardinality(v) = 6 AND v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'hallazgo_rpc_undo_pts: %', v;
  END IF;
END $$;
