-- =====================================================================
-- Deshacer · Paquete prod 20261019 · Bloque 2
-- Restaura lectura_publica_precios EXACTA a la definición VIVA en prod antes del paquete
-- (leída 2026-10-19 17:57 Madrid, respaldo en respaldos/20261019_paquete_prod/01_*.json):
-- BA-020 ya estaba aplicado ⇒ TO public, precio activo + validado + vigente, sin exigir oferta
-- visible y sin comentario. (No es USING (true) como decía 20260815000100.) Idempotente.
-- =====================================================================
BEGIN;
DROP POLICY IF EXISTS lectura_publica_precios ON public.precios_oferta;
CREATE POLICY lectura_publica_precios ON public.precios_oferta
  FOR SELECT TO public
  USING (
    es_precio_activo IS TRUE
    AND estado_validacion = 'validado'
    AND (vigente_desde IS NULL OR vigente_desde <= CURRENT_DATE)
    AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)
  );
COMMIT;
