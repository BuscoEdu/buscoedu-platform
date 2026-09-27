-- BA-004 | Renovación controlada de vigencias comerciales
-- Fecha elegida: 2026-12-31 (cierre comercial razonable para la campaña actual).
-- Este script NO elimina registros ni cambia el filtro de vigencia del portal.
-- Ejecutar manualmente en Supabase después de revisar el SELECT previo.

BEGIN;

-- Bloque 1: congelar el conjunto objetivo para que las verificaciones y los
-- tres updates trabajen exactamente sobre las mismas ofertas.
DROP TABLE IF EXISTS pg_temp.ba004_ofertas_objetivo;
CREATE TEMP TABLE ba004_ofertas_objetivo ON COMMIT DROP AS
SELECT o.id
FROM public.ofertas_academicas AS o
WHERE o.activo IS TRUE
  AND o.estado_publicacion = 'publicado'
  AND o.estado_validacion = 'validado'
  AND o.vigente_hasta < CURRENT_DATE
  AND (o.vigente_desde IS NULL OR o.vigente_desde <= CURRENT_DATE);

-- Bloque 2: verificación previa. Debe mostrar únicamente ofertas activas,
-- publicadas y validadas que hoy están vencidas.
SELECT
  o.id,
  o.nombre_oferta,
  o.vigente_desde,
  o.vigente_hasta,
  o.activo,
  o.estado_publicacion,
  o.estado_validacion
FROM public.ofertas_academicas AS o
JOIN ba004_ofertas_objetivo AS t ON t.id = o.id
ORDER BY o.vigente_hasta, o.nombre_oferta;

-- Bloque 3: renovar las ofertas visibles del conjunto objetivo hasta el
-- 2026-12-31. El filtro de src/lib/ofertas.ts permanece sin cambios.
UPDATE public.ofertas_academicas AS o
SET vigente_hasta = DATE '2026-12-31'
FROM ba004_ofertas_objetivo AS t
WHERE t.id = o.id;

-- Bloque 4: alinear solo precios marcados como activos. Los precios
-- históricos/inactivos conservan su vigencia para no alterar el versionado.
UPDATE public.precios_oferta AS p
SET vigente_hasta = DATE '2026-12-31'
FROM ba004_ofertas_objetivo AS t
WHERE p.oferta_id = t.id
  AND p.es_precio_activo IS TRUE
  AND p.vigente_hasta < CURRENT_DATE;

-- Bloque 5: alinear solo beneficios activos ligados a las ofertas renovadas.
-- No se hace DELETE físico ni se cambia el estado de validación/publicación.
UPDATE public.beneficios_oferta AS b
SET vigente_hasta = DATE '2026-12-31'
FROM ba004_ofertas_objetivo AS t
WHERE b.oferta_id = t.id
  AND b.activo IS TRUE
  AND b.vigente_hasta < CURRENT_DATE;

-- Bloque 6: verificación posterior de fechas. Comparar con el SELECT previo;
-- las filas actualizadas deben quedar con vigente_hasta = 2026-12-31.
SELECT
  o.id,
  o.nombre_oferta,
  o.vigente_desde,
  o.vigente_hasta,
  o.activo,
  o.estado_publicacion,
  o.estado_validacion
FROM public.ofertas_academicas AS o
JOIN ba004_ofertas_objetivo AS t ON t.id = o.id
ORDER BY o.vigente_hasta, o.nombre_oferta;

-- Bloque 7: verificación posterior de precios y beneficios alineados.
SELECT
  'precios_oferta' AS tabla,
  p.id,
  p.oferta_id,
  p.vigente_hasta,
  p.es_precio_activo AS registro_activo
FROM public.precios_oferta AS p
JOIN ba004_ofertas_objetivo AS t ON t.id = p.oferta_id
WHERE p.es_precio_activo IS TRUE
UNION ALL
SELECT
  'beneficios_oferta' AS tabla,
  b.id,
  b.oferta_id,
  b.vigente_hasta,
  b.activo AS registro_activo
FROM public.beneficios_oferta AS b
JOIN ba004_ofertas_objetivo AS t ON t.id = b.oferta_id
WHERE b.activo IS TRUE
ORDER BY tabla, oferta_id, id;

COMMIT;
