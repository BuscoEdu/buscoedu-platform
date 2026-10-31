-- MF O3 · Solo capa BD (30/10/2026 Europe/Madrid)
-- Qué: completar familia_id (columnas faltantes + vista historial_v) e índices
--      (familia_id y compuestos usados por loadAll / filtros).
-- Qué NO: RPCs (las posee Backend). Sin DROP de datos. Sin tocar puntos.
-- Idempotente: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE.
-- Quién: BD bot BuscoEdu. Por qué: ola O3 tras O1+O2 (#84); OK Jhon t809u.

-- ========== Guarda de puntos m1–m6 (abortar si difieren) ==========
DO $$
DECLARE
  v int[];
  esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v
    FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'mf_o3_guarda_pts: puntos m1-m6 = % (esperado %); aborto', v, esperado;
  END IF;
END $$;

-- ========== Respaldo en schema respaldos ==========
CREATE SCHEMA IF NOT EXISTS respaldos;

-- Puntos previos (para deshacer / auditoría; no se restauran solos)
DO $$ BEGIN
  IF to_regclass('respaldos.familia_mf_o3_previo_puntos') IS NULL THEN
    CREATE TABLE respaldos.familia_mf_o3_previo_puntos AS
      SELECT id, puntos, now() AS tomado_en
        FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  END IF;
END $$;

-- Definición previa de la vista historial (texto)
DO $$ BEGIN
  IF to_regclass('respaldos.familia_mf_o3_previo_vista_historial') IS NULL THEN
    CREATE TABLE respaldos.familia_mf_o3_previo_vista_historial (
      def text NOT NULL,
      tomado_en timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO respaldos.familia_mf_o3_previo_vista_historial(def)
    SELECT pg_get_viewdef('public.familia_historial_v'::regclass, true)
    WHERE to_regclass('public.familia_historial_v') IS NOT NULL;
  END IF;
END $$;

-- Catálogo de columnas familia_id e índices previos
DO $$ BEGIN
  IF to_regclass('respaldos.familia_mf_o3_previo_columnas') IS NULL THEN
    CREATE TABLE respaldos.familia_mf_o3_previo_columnas AS
      SELECT table_name, column_name, is_nullable, data_type, now() AS tomado_en
        FROM information_schema.columns
       WHERE table_schema='public' AND column_name='familia_id'
         AND table_name LIKE 'familia_%';
  END IF;
  IF to_regclass('respaldos.familia_mf_o3_previo_indices') IS NULL THEN
    CREATE TABLE respaldos.familia_mf_o3_previo_indices AS
      SELECT tablename, indexname, indexdef, now() AS tomado_en
        FROM pg_indexes
       WHERE schemaname='public' AND tablename LIKE 'familia_%'
         AND indexdef ILIKE '%familia_id%';
  END IF;
END $$;

-- Sin acceso cliente a los respaldos
REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA respaldos TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA respaldos TO service_role;

-- ========== Asegurar familia_id en tablas de negocio (idempotente) ==========
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'familia_miembros','familia_tareas','familia_deberes','familia_series',
    'familia_premios','familia_solicitudes_premios','familia_historial',
    'familia_notificaciones','familia_mensajes','familia_plantillas_tareas',
    'familia_multas','familia_multas_niveles','familia_multas_aplicadas',
    'familia_config','familia_agenda_actividades','familia_agenda_excepciones',
    'familia_mesadas','familia_mesada_periodos','familia_fotos_storage_borrar',
    'familia_metas','familia_badges','familia_v6c_aplicaciones','familia_sesiones',
    'familia_permisos'
  ]
  LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name=t AND column_name='familia_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN familia_id bigint REFERENCES public.familia_familias(id)',
        t
      );
    END IF;
    -- Backfill solo NULL → casa #1 (no toca filas ya asignadas)
    EXECUTE format('UPDATE public.%I SET familia_id = 1 WHERE familia_id IS NULL', t);
  END LOOP;
END $$;

-- ========== Vista historial: exponer familia_id ==========
-- Motivo: tras O1 la vista seguía sin familia_id (lista congelada pre-columna);
--         el FE filtra eqFam sobre familia_historial_v.
-- Nota: CREATE OR REPLACE no permite insertar columnas en medio → DROP + CREATE.
DO $$
BEGIN
  IF to_regclass('public.familia_historial') IS NULL THEN
    RAISE NOTICE 'mf_o3: sin familia_historial; se omite vista';
    RETURN;
  END IF;
  DROP VIEW IF EXISTS public.familia_historial_v;
  EXECUTE $v$
    CREATE VIEW public.familia_historial_v
      WITH (security_invoker = true) AS
      SELECT h.*,
             ms.estado AS mesada_estado,
             ms.periodo AS mesada_periodo,
             p.fecha_liberacion AS mesada_fecha_liberacion
        FROM public.familia_historial h
        LEFT JOIN public.familia_mesadas ms ON ms.id = h.mesada_id
        LEFT JOIN public.familia_mesada_periodos p ON p.periodo = ms.periodo
  $v$;
  GRANT SELECT ON public.familia_historial_v TO anon, authenticated, service_role;
END $$;

-- ========== Índices familia_id simples (faltaban tras O1 salvo 4 tablas) ==========
CREATE INDEX IF NOT EXISTS familia_premios_familia_id_idx
  ON public.familia_premios (familia_id);
CREATE INDEX IF NOT EXISTS familia_solicitudes_familia_id_idx
  ON public.familia_solicitudes_premios (familia_id);
CREATE INDEX IF NOT EXISTS familia_mensajes_familia_id_idx
  ON public.familia_mensajes (familia_id);
CREATE INDEX IF NOT EXISTS familia_plantillas_familia_id_idx
  ON public.familia_plantillas_tareas (familia_id);
CREATE INDEX IF NOT EXISTS familia_deberes_familia_id_idx
  ON public.familia_deberes (familia_id);
CREATE INDEX IF NOT EXISTS familia_config_familia_id_idx
  ON public.familia_config (familia_id);
CREATE INDEX IF NOT EXISTS familia_series_familia_id_idx
  ON public.familia_series (familia_id);
CREATE INDEX IF NOT EXISTS familia_agenda_act_familia_id_idx
  ON public.familia_agenda_actividades (familia_id);
CREATE INDEX IF NOT EXISTS familia_agenda_exc_familia_id_idx
  ON public.familia_agenda_excepciones (familia_id);
CREATE INDEX IF NOT EXISTS familia_mesadas_familia_id_idx
  ON public.familia_mesadas (familia_id);
CREATE INDEX IF NOT EXISTS familia_mesada_per_familia_id_idx
  ON public.familia_mesada_periodos (familia_id);
CREATE INDEX IF NOT EXISTS familia_multas_familia_id_idx
  ON public.familia_multas (familia_id);
CREATE INDEX IF NOT EXISTS familia_multas_niv_familia_id_idx
  ON public.familia_multas_niveles (familia_id);
CREATE INDEX IF NOT EXISTS familia_multas_apl_familia_id_idx
  ON public.familia_multas_aplicadas (familia_id);
CREATE INDEX IF NOT EXISTS familia_permisos_familia_id_idx
  ON public.familia_permisos (familia_id);
CREATE INDEX IF NOT EXISTS familia_fotos_bor_familia_id_idx
  ON public.familia_fotos_storage_borrar (familia_id);
CREATE INDEX IF NOT EXISTS familia_sesiones_familia_id_idx
  ON public.familia_sesiones (familia_id);
CREATE INDEX IF NOT EXISTS familia_metas_familia_id_idx
  ON public.familia_metas (familia_id);
CREATE INDEX IF NOT EXISTS familia_badges_familia_id_idx
  ON public.familia_badges (familia_id);
CREATE INDEX IF NOT EXISTS familia_v6c_apl_familia_id_idx
  ON public.familia_v6c_aplicaciones (familia_id);
-- Refuerzo idempotente de los 4 de O1
CREATE INDEX IF NOT EXISTS familia_tareas_familia_id_idx
  ON public.familia_tareas (familia_id);
CREATE INDEX IF NOT EXISTS familia_notifs_familia_id_idx
  ON public.familia_notificaciones (familia_id);
CREATE INDEX IF NOT EXISTS familia_hist_familia_id_idx
  ON public.familia_historial (familia_id);
CREATE INDEX IF NOT EXISTS familia_miembros_familia_id_idx
  ON public.familia_miembros (familia_id);

-- ========== Índices compuestos usados por consultas (loadAll / filtros) ==========
-- Notifs: eq familia_id + para_id + orden creado_en
CREATE INDEX IF NOT EXISTS familia_notifs_fam_para_creado_idx
  ON public.familia_notificaciones (familia_id, para_id, creado_en DESC);
-- Tareas: loadAll por casa ordenadas por creado_en; filtro por asignada
CREATE INDEX IF NOT EXISTS familia_tareas_fam_creado_idx
  ON public.familia_tareas (familia_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS familia_tareas_fam_asignada_idx
  ON public.familia_tareas (familia_id, asignada_a)
  WHERE archivada_en IS NULL;
-- Historial: loadAll por casa
CREATE INDEX IF NOT EXISTS familia_hist_fam_creado_idx
  ON public.familia_historial (familia_id, creado_en DESC);
-- Agenda: por casa + miembro (activas)
CREATE INDEX IF NOT EXISTS familia_agenda_fam_miembro_idx
  ON public.familia_agenda_actividades (familia_id, miembro_id)
  WHERE archivada_en IS NULL;
-- Mensajes / solicitudes / mesadas / sesiones
CREATE INDEX IF NOT EXISTS familia_mensajes_fam_creado_idx
  ON public.familia_mensajes (familia_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS familia_solicitudes_fam_creado_idx
  ON public.familia_solicitudes_premios (familia_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS familia_mesadas_fam_miembro_idx
  ON public.familia_mesadas (familia_id, miembro_id);
CREATE INDEX IF NOT EXISTS familia_sesiones_fam_miembro_idx
  ON public.familia_sesiones (familia_id, miembro_id);

-- ========== Guarda final de puntos (mismo criterio) ==========
DO $$
DECLARE
  v int[];
  esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v
    FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'mf_o3_guarda_pts_post: puntos m1-m6 = % (esperado %); aborto', v, esperado;
  END IF;
END $$;

-- Nota BD→Backend/FE: familia_id sigue nullable a propósito.
-- El FE aún inserta sin familia_id en varios sitios; NOT NULL se aplaza
-- hasta que FE/BE escriban familia_id en todos los INSERT/RPC.
