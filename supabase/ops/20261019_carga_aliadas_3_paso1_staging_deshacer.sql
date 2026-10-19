-- =====================================================================
-- Deshacer 20261019 · Paso 3/5 · Tabla de trabajo de la carga
-- ATENCIÓN: esta tabla es la base del deshacer del paso 4. Solo borrarla si la
-- carga (paso 4) NO se aplicó o ya se deshizo y no se necesita la traza de ids.
-- No toca el catálogo.
-- =====================================================================
BEGIN;
DO $d$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ofertas_academicas o
             JOIN public.carga_aliadas_20261019 c ON c.oferta_id = o.id
             WHERE o.activo) THEN
    RAISE EXCEPTION 'ABORTADO: hay ofertas de la carga activas; deshacer primero el paso 4.';
  END IF;
END $d$;
DROP TABLE IF EXISTS public.carga_aliadas_20261019;
COMMIT;
