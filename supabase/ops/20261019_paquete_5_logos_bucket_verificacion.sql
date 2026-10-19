-- =====================================================================
-- Verificación · Paquete prod 20261019 · Logos: bucket `logos-aliadas` vs ruta de Backend
-- SOLO LECTURA. No sube ni registra nada (los logos los sube Backend con
-- scripts/subir-logos-aliadas.mjs, ruta `{universidad_id}/logo.{ext}`, service_role).
-- Revisión en repo (20261019_carga_aliadas_1_bucket.sql): las 3 policies de storage.objects
--   solo exigen bucket_id = 'logos-aliadas' + super_admin activo; NINGUNA restringe la ruta
--   (ni slug ni foldername) ⇒ la ruta por universidad_id está permitida. Sin fix.
-- Criterio: todo en ✓.
-- =====================================================================
SELECT 'A1 bucket público, 500 KB, png/svg/webp' AS chequeo,
       CASE WHEN public AND file_size_limit = 512000
             AND allowed_mime_types @> ARRAY['image/png','image/svg+xml','image/webp']
             AND cardinality(allowed_mime_types) = 3 THEN '✓' ELSE '✗' END AS r
  FROM storage.buckets WHERE id = 'logos-aliadas'
UNION ALL
SELECT 'A2 3 policies logos_aliadas_*',
       CASE WHEN count(*) = 3 THEN '✓' ELSE '✗' END
  FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname LIKE 'logos_aliadas_%'
UNION ALL
SELECT 'A3 ninguna policy del bucket filtra por ruta/slug',
       CASE WHEN count(*) = 0 THEN '✓' ELSE '✗' END
  FROM pg_policies
 WHERE schemaname='storage' AND tablename='objects'
   AND (coalesce(qual,'') || coalesce(with_check,'')) ILIKE '%logos-aliadas%'
   AND (coalesce(qual,'') || coalesce(with_check,'')) ~* '(foldername|\mname\M|slug|storage\.filename|like)'
UNION ALL
SELECT 'A4 índice único de logo principal por universidad_id',
       CASE WHEN pg_get_indexdef('public.uq_imagenes_universidad_logo_principal'::regclass)
                 ILIKE '%(universidad_id)%WHERE%tipo%logo%es_principal%activo%' THEN '✓' ELSE '✗' END
UNION ALL
SELECT 'A5 sin filas de logo con ruta por slug (Bloque 3 del 17/10 no corrido)',
       CASE WHEN count(*) = 0 THEN '✓' ELSE '✗' END
  FROM public.imagenes_universidad
 WHERE tipo = 'logo' AND url_storage IN ('poli/logo.svg','areandina/logo.svg','unir/logo.svg','asturias/logo-web.png');

-- Después de que Backend suba: esperado 4 filas con objeto_existe = true
SELECT i.universidad_id, i.url_storage, i.activo,
       EXISTS (SELECT 1 FROM storage.objects so
                WHERE so.bucket_id='logos-aliadas' AND so.name = i.url_storage) AS objeto_existe
  FROM public.imagenes_universidad i
 WHERE i.tipo='logo' AND i.universidad_id IN ('6069f39d-6bd2-5991-b922-24e58ac7137a','53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998',
                                              '79de384c-1c32-5c80-b5c0-70a12a7fa79d','031ff5d5-fc68-519c-88d7-bd37765715b1');
