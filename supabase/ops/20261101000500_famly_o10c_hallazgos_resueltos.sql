-- =====================================================================
-- O10c · Marcar hallazgos de Ola 10 como resueltos (QA PROD aacc4b7 PASS 21/0)
-- Autor: BD BuscoEdu (bot) · 2026-11-01 · orden Orq (OK Jhon t954u)
-- Idempotente · ✗ DELETE · ✗ sugerencias 9,10,11,12,14. Deshacer: *_o10c_*_deshacer.sql
-- =====================================================================
BEGIN;
-- Bloque 1: respaldo de las 9 filas antes del cambio
CREATE TABLE IF NOT EXISTS respaldos.famly_o10c_hallazgos_previo AS
  SELECT id, estado, resuelto_en, nota_resolucion, now() respaldado_en
    FROM public.famly_hallazgos WHERE id IN (4,5,6,7,8,13,15,16,17);
REVOKE ALL ON respaldos.famly_o10c_hallazgos_previo FROM anon, authenticated;

-- Bloque 2: marcar resuelto (solo si aún no lo está y no está borrado)
UPDATE public.famly_hallazgos
   SET estado = 'resuelto', resuelto_en = now(),
       nota_resolucion = 'Ola 10 · commit aacc4b7 · dpl_B2CoCkvT · QA PASS'
       || CASE WHEN id = 7 THEN ' · verificación padre no-admin solo lectura pendiente' ELSE '' END
 WHERE id IN (4,5,6,7,8,13,15,16,17) AND estado <> 'resuelto' AND borrado_en IS NULL;
COMMIT;
