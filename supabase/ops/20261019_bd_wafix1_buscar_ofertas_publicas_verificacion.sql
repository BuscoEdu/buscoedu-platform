-- =====================================================================
-- Verificación · WA-fix-1 (BD) · buscar_ofertas_publicas · SOLO LECTURA. Criterio: todo en ✓.
-- Valores esperados con el catálogo de prod del 19/10 (291 visibles, 196 virtuales).
-- =====================================================================
-- Nota: el «3» del análisis de las 19:38 eran las ofertas con «sistemas» en el nombre; una es
--   «Especialización en Sistemas Integrados de Gestión». Con AND, «ingenieria de sistemas» = 2.
SELECT 'V1 «ingenieria de sistemas» = 2 (AND entre tokens)' AS chequeo,
       CASE WHEN (SELECT count(*) FROM public.buscar_ofertas_publicas('ingenieria de sistemas', NULL, NULL, NULL, NULL, 200, 0)) = 2
             AND NOT (SELECT bool_or(fue_respaldo_area) FROM public.buscar_ofertas_publicas('ingenieria de sistemas', NULL, NULL, NULL, NULL, 200, 0)) THEN '✓' ELSE '✗' END AS r
UNION ALL SELECT 'V1b «sistemas» = 3',
       CASE WHEN (SELECT count(*) FROM public.buscar_ofertas_publicas('sistemas', NULL, NULL, NULL, NULL, 200, 0)) = 3 THEN '✓' ELSE '✗' END
UNION ALL SELECT 'V2 con tilde = sin tilde',
       CASE WHEN (SELECT array_agg(oferta_id ORDER BY oferta_id) FROM public.buscar_ofertas_publicas('Ingeniería de Sistemas', NULL, NULL, NULL, NULL, 200, 0))
               = (SELECT array_agg(oferta_id ORDER BY oferta_id) FROM public.buscar_ofertas_publicas('ingenieria de sistemas', NULL, NULL, NULL, NULL, 200, 0)) THEN '✓' ELSE '✗' END
UNION ALL SELECT 'V3 administracion + virtual + Bogotá = 16',
       CASE WHEN (SELECT max(total_count) FROM public.buscar_ofertas_publicas('administracion', 'virtual',
                  (SELECT id FROM public.ciudades WHERE nombre = 'Bogotá' LIMIT 1), NULL, NULL, 20, 0)) = 16 THEN '✓' ELSE '✗' END
UNION ALL SELECT 'V4 administracion + virtual + Medellín = 16',
       CASE WHEN (SELECT max(total_count) FROM public.buscar_ofertas_publicas('administracion', 'virtual',
                  (SELECT id FROM public.ciudades WHERE nombre = 'Medellín' LIMIT 1), NULL, NULL, 20, 0)) = 16 THEN '✓' ELSE '✗' END
UNION ALL SELECT 'V5 sin filtros = 291 visibles',
       CASE WHEN (SELECT max(total_count) FROM public.buscar_ofertas_publicas(NULL, NULL, NULL, NULL, NULL, 1, 0)) = 291 THEN '✓' ELSE '✗' END
UNION ALL SELECT 'V6 respaldo por área marca el flag',
       CASE WHEN (SELECT bool_and(fue_respaldo_area) FROM public.buscar_ofertas_publicas('tecnologia xyzzy', NULL, NULL, NULL, NULL, 200, 0)) IS NOT FALSE THEN '✓' ELSE '✗' END
UNION ALL SELECT 'V7 anon puede ejecutar',
       CASE WHEN has_function_privilege('anon', 'public.buscar_ofertas_publicas(text,text,uuid,text,uuid,int,int)', 'execute') THEN '✓' ELSE '✗' END
UNION ALL SELECT 'V8 SECURITY INVOKER',
       CASE WHEN NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.buscar_ofertas_publicas(text,text,uuid,text,uuid,int,int)'::regprocedure) THEN '✓' ELSE '✗' END
UNION ALL SELECT 'V9 0 ofertas demo en el resultado',
       CASE WHEN NOT EXISTS (SELECT 1 FROM public.buscar_ofertas_publicas(NULL, NULL, NULL, NULL, NULL, 200, 0) b
                              JOIN public.ofertas_academicas o ON o.id = b.oferta_id JOIN public.universidades u ON u.id = o.universidad_id
                             WHERE u.es_demo OR o.es_demo) THEN '✓' ELSE '✗' END;
