-- =====================================================================
-- Verificación · Paquete prod 20261019 · Bloque 4 · SOLO LECTURA. Criterio: todo en ✓.
-- =====================================================================
WITH t(nombre) AS (VALUES ('carga_aliadas_20261019'),('carga_aliadas_20261019_respaldo'),('carga_aliadas_20261019_demo_previo'))
SELECT 'A ' || nombre AS chequeo,
       CASE WHEN to_regclass('public.' || nombre) IS NULL AND to_regclass('respaldos.' || nombre) IS NOT NULL
            THEN '✓' ELSE '✗' END AS r
  FROM t
UNION ALL SELECT 'B1 anon sin USAGE en respaldos',
       CASE WHEN NOT has_schema_privilege('anon','respaldos','USAGE') THEN '✓' ELSE '✗' END
UNION ALL SELECT 'B2 authenticated sin USAGE en respaldos',
       CASE WHEN NOT has_schema_privilege('authenticated','respaldos','USAGE') THEN '✓' ELSE '✗' END
UNION ALL SELECT 'C1 staging 331 filas',
       CASE WHEN (SELECT count(*) FROM respaldos.carga_aliadas_20261019) = 331 THEN '✓' ELSE '✗' END
UNION ALL SELECT 'C2 demo_previo 500 filas',
       CASE WHEN (SELECT count(*) FROM respaldos.carga_aliadas_20261019_demo_previo) = 500 THEN '✓' ELSE '✗' END;
-- D · md5 de cada tabla: debe ser IGUAL al md5_json que dio el paso de exportar.
SELECT 'carga_aliadas_20261019' AS tabla, md5(jsonb_agg(to_jsonb(t) ORDER BY t.oferta_id)::text) FROM respaldos.carga_aliadas_20261019 t
UNION ALL SELECT 'carga_aliadas_20261019_respaldo', md5(jsonb_agg(to_jsonb(t) ORDER BY t.universidad_id)::text) FROM respaldos.carga_aliadas_20261019_respaldo t
UNION ALL SELECT 'carga_aliadas_20261019_demo_previo', md5(jsonb_agg(to_jsonb(t) ORDER BY t.oferta_id)::text) FROM respaldos.carga_aliadas_20261019_demo_previo t;
