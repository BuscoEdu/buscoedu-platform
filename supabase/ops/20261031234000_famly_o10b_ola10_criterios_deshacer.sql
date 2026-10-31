-- Deshacer O10b: quita triggers/funciones/RPC/columna nuevos y devuelve aprobada_para_hacer de las tareas respaldadas.
BEGIN;
-- Bloque 1: tareas del backfill vuelven a su valor previo
UPDATE public.familia_tareas t SET aprobada_para_hacer = r.aprobada_para_hacer
  FROM respaldos.familia_o10b_tareas_aph_previo r WHERE t.id = r.id;
-- Bloque 2: triggers y funciones
DROP TRIGGER IF EXISTS b_familia_tareas_o10b_aph_padre ON public.familia_tareas;
DROP TRIGGER IF EXISTS z_familia_tareas_o10b_subasta_sin_tomar ON public.familia_tareas;
DROP TRIGGER IF EXISTS b_familia_miembros_o10b_nacimiento ON public.familia_miembros;
DROP FUNCTION IF EXISTS public.familia_o10b_aph_padre();
DROP FUNCTION IF EXISTS public.familia_o10b_subasta_sin_tomar();
DROP FUNCTION IF EXISTS public.familia_o10b_nacimiento_rango();
DROP FUNCTION IF EXISTS public.familia_rpc_config_antidup(integer, integer);
-- Bloque 3: columna de horas anti-duplicado
ALTER TABLE public.familia_config DROP CONSTRAINT IF EXISTS familia_config_antidup_horas_chk;
ALTER TABLE public.familia_config DROP COLUMN IF EXISTS antidup_horas;
COMMIT;
