-- Deshacer O9b: quita el trigger y la función; devuelve familia_id a NULL en las filas respaldadas.
BEGIN;
DROP TRIGGER IF EXISTS a_familia_historial_o9b_familia_id ON public.familia_historial;
DROP FUNCTION IF EXISTS public.familia_historial_o9b_familia_id();
UPDATE public.familia_historial h SET familia_id = NULL
  FROM respaldos.familia_o9b_historial_fid_null_previo r WHERE h.id = r.id;
COMMIT;
