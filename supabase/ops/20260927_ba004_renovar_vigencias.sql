-- BA-004 | Renovación controlada de vigencias comerciales
-- Fecha elegida: 2026-12-31.
-- Compatible con Supabase SQL Editor: SIN TEMP TABLE (filtro repetido).
-- NO elimina registros ni cambia el filtro de vigencia del portal.
-- Pegá el script completo → Run una sola vez.

BEGIN;

-- 1) Verificación previa: activas + publicadas + validadas + vencidas.
SELECT
  o.id,
  o.nombre_oferta,
  o.vigente_desde,
  o.vigente_hasta,
  o.activo,
  o.estado_publicacion,
  o.estado_validacion
FROM public.ofertas_academicas AS o
WHERE o.activo IS TRUE
  AND o.estado_publicacion = 'publicado'
  AND o.estado_validacion = 'validado'
  AND o.vigente_hasta < CURRENT_DATE
  AND (o.vigente_desde IS NULL OR o.vigente_desde <= CURRENT_DATE)
ORDER BY o.vigente_hasta, o.nombre_oferta;

-- 2) Precios activos vencidos de ofertas del conjunto (antes de tocar ofertas).
UPDATE public.precios_oferta AS p
SET vigente_hasta = DATE '2026-12-31'
WHERE p.es_precio_activo IS TRUE
  AND p.vigente_hasta < CURRENT_DATE
  AND EXISTS (
    SELECT 1
    FROM public.ofertas_academicas AS o
    WHERE o.id = p.oferta_id
      AND o.activo IS TRUE
      AND o.estado_publicacion = 'publicado'
      AND o.estado_validacion = 'validado'
      AND o.vigente_hasta < CURRENT_DATE
      AND (o.vigente_desde IS NULL OR o.vigente_desde <= CURRENT_DATE)
  );

-- 3) Beneficios activos vencidos del mismo conjunto.
UPDATE public.beneficios_oferta AS b
SET vigente_hasta = DATE '2026-12-31'
WHERE b.activo IS TRUE
  AND b.vigente_hasta < CURRENT_DATE
  AND EXISTS (
    SELECT 1
    FROM public.ofertas_academicas AS o
    WHERE o.id = b.oferta_id
      AND o.activo IS TRUE
      AND o.estado_publicacion = 'publicado'
      AND o.estado_validacion = 'validado'
      AND o.vigente_hasta < CURRENT_DATE
      AND (o.vigente_desde IS NULL OR o.vigente_desde <= CURRENT_DATE)
  );

-- 4) Renovar ofertas del conjunto hasta 2026-12-31.
UPDATE public.ofertas_academicas AS o
SET vigente_hasta = DATE '2026-12-31'
WHERE o.activo IS TRUE
  AND o.estado_publicacion = 'publicado'
  AND o.estado_validacion = 'validado'
  AND o.vigente_hasta < CURRENT_DATE
  AND (o.vigente_desde IS NULL OR o.vigente_desde <= CURRENT_DATE);

-- 5) Verificación posterior: ofertas renovadas.
SELECT
  o.id,
  o.nombre_oferta,
  o.vigente_desde,
  o.vigente_hasta,
  o.activo,
  o.estado_publicacion,
  o.estado_validacion
FROM public.ofertas_academicas AS o
WHERE o.activo IS TRUE
  AND o.estado_publicacion = 'publicado'
  AND o.estado_validacion = 'validado'
  AND o.vigente_hasta = DATE '2026-12-31'
  AND (o.vigente_desde IS NULL OR o.vigente_desde <= CURRENT_DATE)
ORDER BY o.nombre_oferta;

COMMIT;
