-- =====================================================================
-- O10 · famly_hallazgos: marcar resuelto con fecha y nota + archivar la tarea vencida 496
-- Autor: BD BuscoEdu (bot) · 2026-10-31 · APLICADA en prod 2026-10-31 (GO Orq, OK Jhon t954u)
-- Idempotente · aditivo · ✗ DELETE. Deshacer: 20261031233000_famly_o10_hallazgos_resuelto_deshacer.sql
-- =====================================================================
BEGIN;

-- Bloque 1: columnas nuevas (el CHECK de estado ya admite 'resuelto')
ALTER TABLE public.famly_hallazgos ADD COLUMN IF NOT EXISTS resuelto_en timestamptz;
ALTER TABLE public.famly_hallazgos ADD COLUMN IF NOT EXISTS nota_resolucion text;
COMMENT ON COLUMN public.famly_hallazgos.nota_resolucion IS 'Qué se hizo y en qué commit (se llena al pasar QA en prod)';

-- Bloque 2: respaldo de la tarea 496 antes del soft delete (#8)
CREATE TABLE IF NOT EXISTS respaldos.familia_o10_tarea_496_previo AS
  SELECT id, estado, archivada_en, now() respaldado_en FROM public.familia_tareas WHERE id = 496;
REVOKE ALL ON respaldos.familia_o10_tarea_496_previo FROM anon, authenticated;

-- Bloque 3: soft delete de la 496 («Sacar la basura», vencida el 26/10 sin hacerse), solo si sigue igual
UPDATE public.familia_tareas SET archivada_en = now()
 WHERE id = 496 AND familia_id = 1 AND estado = 'aviso_aprobada' AND archivada_en IS NULL;

COMMIT;

-- Uso al pasar QA (uno por hallazgo):
-- UPDATE public.famly_hallazgos SET estado='resuelto', resuelto_en=now(), nota_resolucion='<qué + commit>' WHERE id=<n> AND estado<>'resuelto';
