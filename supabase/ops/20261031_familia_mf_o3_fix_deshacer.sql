-- UNDO MF O3 fix QA (20261031100000) · Backend BuscoEdu (bot)
-- Restaura las definiciones vigentes tras 20261031090000_familia_mf_o3_rpc_scope
-- desde respaldos.familia_mf_o3_fix_previo. AVISO: solo rollback.
-- No DELETE físico de datos. No toca tabla familia_links.

DROP FUNCTION IF EXISTS public.familia_mf_familia_sesion_o_actor(integer);

-- Quitar versiones del fix antes de restaurar (evita "cannot remove parameter defaults")
DROP FUNCTION IF EXISTS public.familia_rpc_link_emitir(text, bigint);
DROP FUNCTION IF EXISTS public.familia_v6d_base_crear_tarea(text, integer, integer, text, integer, text, text, text, text, text, boolean, timestamptz, timestamptz, integer, integer, integer, bigint, text, integer);
DROP FUNCTION IF EXISTS public.familia_rpc_crear_tarea(text, integer, integer, text, integer, text, text, text, text, text, boolean, timestamptz, timestamptz, integer, integer, integer, bigint, text, integer, boolean, boolean);
DROP FUNCTION IF EXISTS public.familia_v6c_serie_generar(uuid, timestamptz);
DROP FUNCTION IF EXISTS public.familia_v6d_base_serie_crear(integer, text, text, integer[], text, time, jsonb, text, text, integer, integer, integer, text, text, integer, boolean, smallint, boolean, text);
DROP FUNCTION IF EXISTS public.familia_v6d_base_crear_lote(integer, text, text, text, integer, timestamptz, text, integer, integer, integer, integer[], text, text, text, text, text, integer);

DO $$
DECLARE r record;
BEGIN
  IF to_regclass('respaldos.familia_mf_o3_fix_previo') IS NULL THEN
    RAISE NOTICE 'mf_o3_fix_undo: sin respaldo; se omite restore';
    RETURN;
  END IF;
  FOR r IN
    SELECT proname, args, def
      FROM respaldos.familia_mf_o3_fix_previo
     ORDER BY tomado_en, proname
  LOOP
    BEGIN
      EXECUTE r.def;
      RAISE NOTICE 'mf_o3_fix_undo: restaurada %(%)', r.proname, r.args;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'mf_o3_fix_undo: fallo %(%) · %', r.proname, r.args, SQLERRM;
    END;
  END LOOP;
END $$;

DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS NOT NULL AND cardinality(v)=6 AND v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'mf_o3_fix_undo_guarda_pts: puntos=% esperado=%', v, esperado;
  END IF;
END $$;
