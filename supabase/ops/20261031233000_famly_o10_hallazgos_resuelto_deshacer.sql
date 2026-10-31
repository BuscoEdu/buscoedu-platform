-- Deshacer O10: restaura la tarea 496 y quita las 2 columnas nuevas (y los estados 'resuelto' marcados vuelven a 'nuevo').
BEGIN;
UPDATE public.familia_tareas t SET archivada_en = r.archivada_en FROM respaldos.familia_o10_tarea_496_previo r WHERE t.id = r.id;
UPDATE public.famly_hallazgos SET estado = 'nuevo' WHERE resuelto_en IS NOT NULL;
ALTER TABLE public.famly_hallazgos DROP COLUMN IF EXISTS resuelto_en, DROP COLUMN IF EXISTS nota_resolucion;
COMMIT;
