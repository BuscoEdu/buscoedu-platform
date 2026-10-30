-- UNDO MF O3 RPC scope (solo rollback local/staging)
-- AVISO: solo para rollback. NO aplica DELETE físico de datos de negocio.
-- Restaura definiciones previas desde respaldos.familia_mf_o3_rpc_previo.
-- Elimina RPCs nuevas de links y ranking; NO toca tabla familia_links ni índices BD.
-- Quién: Backend BuscoEdu (bot).

-- Quitar RPCs nuevas
DROP FUNCTION IF EXISTS public.familia_rpc_link_emitir(text, bigint);
DROP FUNCTION IF EXISTS public.familia_rpc_link_resolver(text);
DROP FUNCTION IF EXISTS public.familia_rpc_ranking(integer, text);
DROP FUNCTION IF EXISTS public.familia_mf_email_dueno(bigint);
DROP FUNCTION IF EXISTS public.familia_mf_sesion_ctx();
DROP FUNCTION IF EXISTS public.familia_mf_familia_de_miembro(integer);
DROP FUNCTION IF EXISTS public.familia_mf_assert_misma_familia(integer, integer);

-- Restaurar defs previas (si hay respaldo)
DO $$
DECLARE r record;
BEGIN
  IF to_regclass('respaldos.familia_mf_o3_rpc_previo') IS NULL THEN
    RAISE NOTICE 'mf_o3_rpc_undo: sin respaldo de defs; se omiten restores';
    RETURN;
  END IF;
  FOR r IN SELECT proname, args, def FROM respaldos.familia_mf_o3_rpc_previo ORDER BY tomado_en, proname LOOP
    BEGIN
      EXECUTE r.def;
      RAISE NOTICE 'mf_o3_rpc_undo: restaurada %(%)', r.proname, r.args;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'mf_o3_rpc_undo: no se pudo restaurar %(%) · %', r.proname, r.args, SQLERRM;
    END;
  END LOOP;
END $$;

-- Email dueño #1: desactivar flag (conserva admin_email; no borra columna)
UPDATE public.familia_familias
   SET email_dueno_activo = false, actualizado_en = now()
 WHERE id = 1 AND lower(nickname) = 'beman27';

-- Guarda puntos
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS NOT NULL AND cardinality(v)=6 AND v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'mf_o3_rpc_undo_guarda_pts: puntos=% esperado=%', v, esperado;
  END IF;
END $$;
