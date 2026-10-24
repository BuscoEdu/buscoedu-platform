-- =====================================================================
-- v6b_00 · Respaldo previo (BD bot, 2026-10-24). Idempotente (IF NOT EXISTS). Sin acceso por API.
-- Guarda definiciones de funciones que v6b reemplaza y las filas afectadas por backfills.
-- =====================================================================
CREATE SCHEMA IF NOT EXISTS respaldos;
-- Bloque 1: definiciones vigentes (para el deshacer)
CREATE TABLE IF NOT EXISTS respaldos.familia_v6b_previo_fn AS
  SELECT p.oid::regprocedure::text AS objeto, pg_get_functiondef(p.oid) AS definicion, now() AS tomado_en
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('familia_rpc_crear_tarea','familia_rpc_crear_lote',
    'familia_limpiar_fotos_vencidas','familia_limpiar_fotos_vencidas_local','familia_trg_foto_vence');
-- Bloque 2: ids de tareas y plantillas existentes (reciben máx. 1/día e intervalo 0 en B18)
CREATE TABLE IF NOT EXISTS respaldos.familia_v6b_previo_tareas_ids AS SELECT id FROM public.familia_tareas;
CREATE TABLE IF NOT EXISTS respaldos.familia_v6b_previo_plantillas_ids AS SELECT id FROM public.familia_plantillas_tareas;
-- Bloque 3: B16 · deberes PENDIENTES asignados a padres (se convierten a tarea)
CREATE TABLE IF NOT EXISTS respaldos.familia_v6b_previo_b16 AS
  SELECT t.* FROM public.familia_tareas t JOIN public.familia_miembros m ON m.id=t.asignada_a
  WHERE public.familia_es_admin(m) AND (t.clase='deber' OR t.tipo='deber') AND t.estado='pendiente';
REVOKE ALL ON respaldos.familia_v6b_previo_fn, respaldos.familia_v6b_previo_tareas_ids,
  respaldos.familia_v6b_previo_plantillas_ids, respaldos.familia_v6b_previo_b16 FROM anon, authenticated;
