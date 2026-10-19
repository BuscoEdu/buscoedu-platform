-- =====================================================================
-- Deshacer · Paquete prod 20261019 · Bloque 2
-- Restaura lectura_publica_precios EXACTA a 20260815000100_rls_lectura_publica_relacionadas.sql
-- (FOR SELECT TO public USING (true), sin comentario). ⚠ Vuelve a exponer a anon todo el
-- histórico, incluidos los precios pendientes MARCA:. Idempotente. No toca datos.
-- =====================================================================
BEGIN;
DROP POLICY IF EXISTS lectura_publica_precios ON public.precios_oferta;
CREATE POLICY lectura_publica_precios ON public.precios_oferta
  FOR SELECT TO public USING (true);
COMMIT;
