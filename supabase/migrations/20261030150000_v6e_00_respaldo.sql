-- v6e_00 · Respaldo previo al corte Familia v6e (O0–O6). Idempotente.
-- Quién: Orquestador BuscoEdu / executor. Por qué: poder deshacer columnas/RPC nuevas.
CREATE SCHEMA IF NOT EXISTS respaldos;

DO $$ BEGIN
  IF to_regclass('respaldos.familia_v6e_previo_tareas') IS NULL THEN
    CREATE TABLE respaldos.familia_v6e_previo_tareas AS
      SELECT id, estado, estado_vencida, puntos, puntos_aplicados, puntos_sumados,
             asignada_a, pierde_pts, puntos_penalizacion_dia, habilita_en, fecha_limite,
             ventana_min, archivada_en, now() AS tomado_en
      FROM public.familia_tareas WHERE archivada_en IS NULL;
  END IF;
  IF to_regclass('respaldos.familia_v6e_previo_miembros') IS NULL THEN
    CREATE TABLE respaldos.familia_v6e_previo_miembros AS
      SELECT id, puntos, pin, rol_v6d, es_admin, now() AS tomado_en FROM public.familia_miembros;
  END IF;
  IF to_regclass('respaldos.familia_v6e_previo_premios') IS NULL THEN
    CREATE TABLE respaldos.familia_v6e_previo_premios AS
      SELECT id, tipo, asignado_a, activo, stock, now() AS tomado_en FROM public.familia_premios;
  END IF;
  IF to_regclass('respaldos.familia_v6e_previo_config') IS NULL THEN
    CREATE TABLE respaldos.familia_v6e_previo_config AS
      SELECT *, now() AS tomado_en FROM public.familia_config;
  END IF;
  IF to_regclass('cron.job') IS NOT NULL AND to_regclass('respaldos.familia_v6e_previo_cron') IS NULL THEN
    CREATE TABLE respaldos.familia_v6e_previo_cron AS
      SELECT jobid, jobname, schedule, command, active, now() AS tomado_en FROM cron.job
      WHERE jobname ILIKE 'familia%';
  END IF;
END $$;
