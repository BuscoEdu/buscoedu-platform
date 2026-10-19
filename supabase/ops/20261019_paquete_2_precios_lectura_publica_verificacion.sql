-- =====================================================================
-- Verificación · Paquete prod 20261019 · Bloque 2 · precios_oferta
-- SOLO LECTURA. La prueba por rol corre en una transacción que termina en ROLLBACK.
-- Criterio: todas las filas en ✓.
-- =====================================================================

-- Bloque A · Definición de policies
SELECT 'A1 policy pública acotada (no USING true)' AS chequeo,
       CASE WHEN qual NOT IN ('true') AND qual ILIKE '%estado_validacion%validado%'
             AND qual ILIKE '%ofertas_academicas%' AND roles = '{anon,authenticated}' THEN '✓' ELSE '✗' END AS r
  FROM pg_policies WHERE schemaname='public' AND tablename='precios_oferta' AND policyname='lectura_publica_precios'
UNION ALL
SELECT 'A2 4 policies super_admin intactas',
       CASE WHEN count(*) = 4 THEN '✓' ELSE '✗' END
  FROM pg_policies WHERE schemaname='public' AND tablename='precios_oferta' AND policyname LIKE 'solo_super_admin_%'
UNION ALL
SELECT 'A3 RLS activo', CASE WHEN relrowsecurity THEN '✓' ELSE '✗' END
  FROM pg_class WHERE oid='public.precios_oferta'::regclass;

-- Bloque B · Prueba con rol anon y authenticated sin sesión (transacción revertida)
BEGIN;
SET LOCAL role anon;
SELECT 'B1 anon: 0 pendientes/no validados' AS chequeo,
       CASE WHEN count(*) FILTER (WHERE estado_validacion <> 'validado') = 0 THEN '✓' ELSE '✗' END AS r,
       count(*) AS filas_visibles_anon
  FROM public.precios_oferta
UNION ALL
SELECT 'B2 anon: 0 con nota MARCA:',
       CASE WHEN count(*) = 0 THEN '✓' ELSE '✗' END, count(*)
  FROM public.precios_oferta WHERE descripcion_condiciones LIKE 'MARCA:%'
UNION ALL
SELECT 'B3 anon: 0 de ofertas no visibles (demo ocultas, etc.)',
       CASE WHEN count(*) = 0 THEN '✓' ELSE '✗' END, count(*)
  FROM public.precios_oferta p
 WHERE NOT EXISTS (SELECT 1 FROM public.ofertas_academicas o
                    WHERE o.id = p.oferta_id AND o.activo AND o.estado_publicacion='publicado'
                      AND o.estado_validacion='validado' AND o.vigente_desde <= current_date
                      AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date))
UNION ALL
SELECT 'B4 anon: 0 precios inactivos/vencidos',
       CASE WHEN count(*) = 0 THEN '✓' ELSE '✗' END, count(*)
  FROM public.precios_oferta
 WHERE es_precio_activo IS NOT TRUE OR vigente_hasta < current_date;
RESET role;
SET LOCAL role authenticated;   -- sin JWT: auth.uid() = NULL ⇒ no es super_admin
SELECT 'B5 authenticated sin sesión: 0 no validados' AS chequeo,
       CASE WHEN count(*) FILTER (WHERE estado_validacion <> 'validado') = 0 THEN '✓' ELSE '✗' END AS r,
       count(*) AS filas_visibles
  FROM public.precios_oferta;
RESET role;
ROLLBACK;

-- Bloque C · Esperado para anon (como postgres): mismo número que B1.filas_visibles_anon
SELECT 'C1 esperado visibles para público' AS chequeo, count(*) AS esperado
  FROM public.precios_oferta p JOIN public.ofertas_academicas o ON o.id = p.oferta_id
 WHERE p.es_precio_activo AND p.estado_validacion='validado'
   AND (p.vigente_desde IS NULL OR p.vigente_desde <= current_date)
   AND (p.vigente_hasta IS NULL OR p.vigente_hasta >= current_date)
   AND o.activo AND o.estado_publicacion='publicado' AND o.estado_validacion='validado'
   AND o.vigente_desde <= current_date AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date);
