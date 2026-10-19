-- =====================================================================
-- Deshacer 20261019 · Paso 5/5 · Vuelve a mostrar las 10 demo
-- Restaura activo y estado_publicacion EXACTOS de cada oferta demo desde
-- public.carga_aliadas_20261019_demo_previo (copia también en
-- supabase/ops/respaldos/20261019_carga_aliadas/05_demo_previo.json). Idempotente.
-- =====================================================================
BEGIN;
UPDATE public.ofertas_academicas o
   SET activo = p.activo, estado_publicacion = p.estado_publicacion
  FROM public.carga_aliadas_20261019_demo_previo p
 WHERE o.id = p.oferta_id
   AND (o.activo IS DISTINCT FROM p.activo OR o.estado_publicacion IS DISTINCT FROM p.estado_publicacion);
COMMIT;
-- Verificación: esperado 0 filas distintas del respaldo
SELECT count(*) AS distintas FROM public.ofertas_academicas o
JOIN public.carga_aliadas_20261019_demo_previo p ON p.oferta_id = o.id
WHERE o.activo IS DISTINCT FROM p.activo OR o.estado_publicacion IS DISTINCT FROM p.estado_publicacion;
