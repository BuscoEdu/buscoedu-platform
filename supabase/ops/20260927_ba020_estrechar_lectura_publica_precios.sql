-- BA-020 | Estrechar lectura pública de precios_oferta
-- Contexto: lectura_publica_precios usa USING (true) y, por OR con otras policies,
-- permite a anon ver todo el histórico. Este script NO borra datos ni quita RLS.
-- Revisar el SELECT de verificación antes de COMMIT. No ejecutar sin OK de Jhon.

BEGIN;

-- Bloque 1: inventario previo (cuántas filas vería anon hoy vs tras el filtro).
SELECT
  count(*) FILTER (WHERE true) AS filas_totales,
  count(*) FILTER (
    WHERE es_precio_activo IS TRUE
      AND estado_validacion = 'validado'
      AND (vigente_desde IS NULL OR vigente_desde <= CURRENT_DATE)
      AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)
  ) AS filas_publicables
FROM public.precios_oferta;

-- Bloque 2: reemplazar la policy abierta por una acotada al precio activo vigente validado.
DROP POLICY IF EXISTS lectura_publica_precios ON public.precios_oferta;
CREATE POLICY lectura_publica_precios ON public.precios_oferta
  FOR SELECT
  TO public
  USING (
    es_precio_activo IS TRUE
    AND estado_validacion = 'validado'
    AND (vigente_desde IS NULL OR vigente_desde <= CURRENT_DATE)
    AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)
  );

-- Bloque 3: las policies solo_super_admin_* de escritura/lectura admin se mantienen.
-- No se tocan aquí.

COMMIT;
