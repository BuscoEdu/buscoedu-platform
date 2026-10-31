-- Deshacer O7b: restaura las 2 funciones exactamente como estaban (definiciones en respaldos.familia_o7b_fn_previo).
-- Alternativa equivalente: re-ejecutar supabase/migrations/20261101110000_famly_o7_miembros_por_nick.sql
DO $d$
DECLARE r record;
BEGIN
  FOR r IN SELECT def FROM respaldos.familia_o7b_fn_previo LOOP
    EXECUTE r.def;  -- cada def es un CREATE OR REPLACE FUNCTION completo
  END LOOP;
END $d$;
