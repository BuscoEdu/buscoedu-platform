-- Deshacer O9d: quita la versión por familia y restaura la definición previa desde el respaldo.
BEGIN;
DROP FUNCTION IF EXISTS public.familia_rpc_resetear_todo(text, integer, text);
DO $d$ DECLARE v text; BEGIN
  SELECT def INTO v FROM respaldos.familia_o9d_fn_previo WHERE firma = 'familia_rpc_resetear_todo(integer,text,text)';
  IF v IS NULL THEN RAISE EXCEPTION 'sin respaldo O9d'; END IF;
  EXECUTE v;
END $d$;
COMMIT;
