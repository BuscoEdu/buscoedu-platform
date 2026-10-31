-- Deshacer Ola 8: quita el trigger y la función; devuelve familia_id a NULL en las filas respaldadas.
BEGIN;
DROP TRIGGER IF EXISTS a_familia_tareas_o8_familia_id ON public.familia_tareas;
DROP FUNCTION IF EXISTS public.familia_tareas_o8_familia_id();
UPDATE public.familia_tareas t SET familia_id = NULL
  FROM respaldos.familia_o8_tareas_fid_null_previo r WHERE t.id = r.id;
COMMIT;
