-- =====================================================================
-- Paquete prod 20261019 · Bloque 2 · Policy lectura_publica_precios (precios_oferta)
-- Autor: Base de datos BuscoEdu · 2026-10-19 · NO aplicado en prod (espera OK).
-- Base: supabase/ops/20260927_ba020_estrechar_lectura_publica_precios.sql (BA-020, nunca corrido).
-- Viva en prod (leída 19/10 17:57 Madrid): BA-020 ya aplicado (TO public, activo+validado+vigente).
--   Falta: roles explícitos y exigir oferta visible. (El repo decía USING (true), 20260815000100.)
-- Antes de BA-020: FOR SELECT TO public USING (true) ⇒ anon veía TODO el histórico,
--   incluidos los 187 precios pendientes con nota MARCA: de la carga del 19/10.
-- Qué hace: anon y authenticated solo leen precios activos, validados, vigentes y de una
--   oferta visible en el portal (mismo criterio que obtenerOfertas). Diferencia con BA-020:
--   (1) roles explícitos anon, authenticated en vez de public; (2) exige oferta visible.
-- Qué NO toca: solo_super_admin_select/insert/update/delete_precios_oferta (super_admin sigue
--   viendo y editando todo, por OR de policies); service_role ignora RLS; RLS sigue activo.
-- Lectores revisados: app/admin/precios/* (cliente navegador con sesión super_admin → policy
--   solo_super_admin_select, sin cambio); app/api/admin/cargas-catalogo (service_role, solo INSERT);
--   Lead Center, /api/naia, WhatsApp y portal NO leen precios_oferta.
-- Idempotente: DROP POLICY IF EXISTS + CREATE POLICY. Deshacer: ..._deshacer.sql.
-- =====================================================================
BEGIN;

-- Bloque 1 · Reemplazar la policy abierta por la acotada
DROP POLICY IF EXISTS lectura_publica_precios ON public.precios_oferta;
CREATE POLICY lectura_publica_precios ON public.precios_oferta
  FOR SELECT
  TO anon, authenticated
  USING (
    es_precio_activo IS TRUE
    AND estado_validacion = 'validado'
    AND (vigente_desde IS NULL OR vigente_desde <= current_date)
    AND (vigente_hasta IS NULL OR vigente_hasta >= current_date)
    AND EXISTS (
      SELECT 1 FROM public.ofertas_academicas o
       WHERE o.id = precios_oferta.oferta_id
         AND o.activo IS TRUE
         AND o.estado_publicacion = 'publicado'
         AND o.estado_validacion = 'validado'
         AND o.vigente_desde <= current_date
         AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date)
    )
  );

COMMENT ON POLICY lectura_publica_precios ON public.precios_oferta IS
  'Paquete 20261019 (BA-020): público solo ve precios activos, validados, vigentes y de oferta visible.';

-- Bloque 2 · Control: RLS sigue activo y quedan las 4 policies de super_admin
DO $c$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.precios_oferta'::regclass) THEN
    RAISE EXCEPTION 'ABORTADO: RLS no está activo en precios_oferta.';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='precios_oferta'
        AND policyname LIKE 'solo_super_admin_%') <> 4 THEN
    RAISE EXCEPTION 'ABORTADO: no están las 4 policies solo_super_admin_* de precios_oferta.';
  END IF;
END $c$;

COMMIT;
