-- =====================================================================
-- Verificación · 20261019_logos_aliadas_public.sql · SOLO LECTURA. Criterio: todo en ✓.
-- Rutas esperadas = las que agrega Backend en la PR #69: public/logos-aliadas/{universidad_id}.{ext}
-- =====================================================================
WITH o(id, universidad_id, ruta) AS (VALUES
  ('c70d65ed-02d0-5115-8588-451eb6ec0c4a'::uuid, '6069f39d-6bd2-5991-b922-24e58ac7137a'::uuid, '/logos-aliadas/6069f39d-6bd2-5991-b922-24e58ac7137a.svg'),
  ('35b13f3a-7dbd-5b02-a918-e0da34c15fba'::uuid, '53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998'::uuid, '/logos-aliadas/53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998.svg'),
  ('ae5d68e6-b234-5d8b-81ec-c0254a39082a'::uuid, '79de384c-1c32-5c80-b5c0-70a12a7fa79d'::uuid, '/logos-aliadas/79de384c-1c32-5c80-b5c0-70a12a7fa79d.svg'),
  ('e47d93cb-a1d9-5ff5-8caf-8ebdcf05e07d'::uuid, '031ff5d5-fc68-519c-88d7-bd37765715b1'::uuid, '/logos-aliadas/031ff5d5-fc68-519c-88d7-bd37765715b1.png'))
SELECT 'A 4/4 filas objetivo activas y principales' AS chequeo,
       CASE WHEN count(*) = 4 THEN '✓' ELSE '✗' END AS r, count(*)::text AS dato
  FROM public.imagenes_universidad i JOIN o ON o.id = i.id
 WHERE i.universidad_id = o.universidad_id AND i.tipo = 'logo' AND i.es_principal AND i.activo
UNION ALL
SELECT 'B 1 logo principal activo por aliada',
       CASE WHEN count(*) FILTER (WHERE n = 1) = 4 THEN '✓' ELSE '✗' END, string_agg(n::text, ',')
  FROM (SELECT o.universidad_id, count(i.id) n FROM o
          LEFT JOIN public.imagenes_universidad i ON i.universidad_id = o.universidad_id
               AND i.tipo = 'logo' AND i.es_principal AND i.activo
         GROUP BY o.universidad_id) x
UNION ALL
SELECT 'C rutas = las de Backend (/logos-aliadas/{id}.{ext})',
       CASE WHEN count(*) = 4 THEN '✓' ELSE '✗' END, count(*)::text
  FROM public.imagenes_universidad i JOIN o ON o.id = i.id AND i.url_storage = o.ruta
UNION ALL
SELECT 'D ninguna ruta de Storage/slug activa para las aliadas',
       CASE WHEN count(*) = 0 THEN '✓' ELSE '✗' END, count(*)::text
  FROM public.imagenes_universidad i JOIN o ON o.universidad_id = i.universidad_id
 WHERE i.tipo = 'logo' AND i.activo AND i.url_storage NOT LIKE '/logos-aliadas/%';
-- Manual tras el deploy: GET https://<dominio>/logos-aliadas/{universidad_id}.{ext} = 200 para las 4.
