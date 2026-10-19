-- =====================================================================
-- Paquete prod 20261019 · Bloque 4 · Paso previo OBLIGATORIO: exportar las 3 tablas de trabajo
-- SOLO LECTURA. Correr ANTES de 20261019_paquete_4_tablas_trabajo_a_respaldos.sql.
-- Contenido: solo catálogo (ids, códigos, nombres de programas/IES, estados, conteos); sin
--   datos personales. Aun así, guardar la salida en /home/box/.secrets/respaldos/ (700/600)
--   como 20261019_tablas_trabajo_{staging,respaldo,demo_previo}.json, no en el repo.
--   (demo_previo ya tiene copia en supabase/ops/respaldos/20261019_carga_aliadas/05_demo_previo.json).
-- Cada consulta devuelve: tabla, filas, md5 del JSON y el JSON. El md5 se compara en la verificación.
-- =====================================================================
SELECT 'carga_aliadas_20261019' AS tabla, count(*) AS filas,
       md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oferta_id)::text,'')) AS md5_json,
       jsonb_agg(to_jsonb(t) ORDER BY t.oferta_id) AS json
  FROM public.carga_aliadas_20261019 t;
SELECT 'carga_aliadas_20261019_respaldo' AS tabla, count(*) AS filas,
       md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.universidad_id)::text,'')) AS md5_json,
       jsonb_agg(to_jsonb(t) ORDER BY t.universidad_id) AS json
  FROM public.carga_aliadas_20261019_respaldo t;
SELECT 'carga_aliadas_20261019_demo_previo' AS tabla, count(*) AS filas,
       md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.oferta_id)::text,'')) AS md5_json,
       jsonb_agg(to_jsonb(t) ORDER BY t.oferta_id) AS json
  FROM public.carga_aliadas_20261019_demo_previo t;
