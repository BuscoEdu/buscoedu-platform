-- =====================================================================
-- 20261018_canal_qa_e1_deshacer.sql
-- Qué: deshace 20261018_canal_qa_e1.sql. Autor: Base de datos BuscoEdu.
-- Idempotente. Sin delete del canal: se desactiva (activo = false).
-- =====================================================================
BEGIN;

-- Bloque 1: desactivar el canal qa_e1 (soft delete).
UPDATE public.canales_ia SET activo = false
WHERE codigo = 'qa_e1' AND activo IS DISTINCT FROM false;

-- Bloque 2: el tope. topes_gasto_ia NO tiene columna activo, así que no se
-- puede "desactivar". Con el canal inactivo el tope queda inerte. Por la
-- excepción de la regla (fila nueva creada en este mismo cambio) se elimina
-- la fila del tope SOLO si no tiene historia: sin bitácora ni alertas ni
-- ejecuciones del canal. Si tiene historia, se conserva intacta.
DELETE FROM public.topes_gasto_ia t
USING public.canales_ia c
WHERE t.canal_id = c.id AND c.codigo = 'qa_e1'
  AND NOT EXISTS (SELECT 1 FROM public.bitacora_topes_gasto_ia b WHERE b.tope_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM public.alertas_gasto_ia a WHERE a.canal_id = c.id)
  AND NOT EXISTS (SELECT 1 FROM public.ejecuciones_agente_ia e WHERE e.canal_id = c.id);

COMMIT;
