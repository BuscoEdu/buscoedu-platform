-- Post-deploy O3+O4 (#85) · Limpieza QA m55 + links E2E (no QA2) + sesiones QA
-- Fecha: 2026-10-30 Europe/Madrid · Quién: BD bot BuscoEdu
-- NO toca: QA2 (fid=2, m53, m54), m1–m6, ni sesiones reales.

-- ========== Guarda puntos m1–m6 ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'qa_limpieza_guarda_pts: puntos=% esperado=%; aborto', v, esperado;
  END IF;
  -- QA2 intacta
  IF NOT EXISTS (SELECT 1 FROM public.familia_miembros WHERE id=53 AND familia_id=2)
     OR NOT EXISTS (SELECT 1 FROM public.familia_miembros WHERE id=54 AND familia_id=2) THEN
    RAISE EXCEPTION 'qa_limpieza: QA2 m53/m54 ausentes; aborto';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS respaldos;
REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA respaldos TO service_role;

-- ========== 1) Verificar + respaldar + borrar m55 (QA) ==========
DO $$
DECLARE v_alias text; v_nombre text; v_ok boolean := false;
BEGIN
  SELECT alias_entrada, nombre INTO v_alias, v_nombre FROM public.familia_miembros WHERE id=55;
  IF NOT FOUND THEN
    RAISE NOTICE 'qa_limpieza: m55 ya no existe';
    RETURN;
  END IF;
  IF lower(coalesce(v_alias,'')) LIKE 'qa%' OR lower(coalesce(v_nombre,'')) LIKE 'qa%' THEN
    v_ok := true;
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'qa_limpieza: m55 NO es QA claro; aborto sin tocar';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('respaldos.familia_qa_limp_m55_miembro') IS NULL THEN
    CREATE TABLE respaldos.familia_qa_limp_m55_miembro AS
      SELECT m.*, now() AS tomado_en FROM public.familia_miembros m WHERE m.id=55;
  END IF;
  IF to_regclass('respaldos.familia_qa_limp_m55_tareas') IS NULL THEN
    CREATE TABLE respaldos.familia_qa_limp_m55_tareas AS
      SELECT t.*, now() AS tomado_en FROM public.familia_tareas t
       WHERE t.asignada_a=55 OR t.creada_por=55 OR t.marcada_por=55 OR t.conjunto_con=55;
  END IF;
  IF to_regclass('respaldos.familia_qa_limp_m55_hist') IS NULL THEN
    CREATE TABLE respaldos.familia_qa_limp_m55_hist AS
      SELECT h.*, now() AS tomado_en FROM public.familia_historial h
       WHERE h.miembro_id=55 OR h.actor_id=55
          OR h.tarea_id IN (SELECT id FROM public.familia_tareas WHERE asignada_a=55 OR creada_por=55);
  END IF;
  IF to_regclass('respaldos.familia_qa_limp_m55_notif') IS NULL THEN
    CREATE TABLE respaldos.familia_qa_limp_m55_notif AS
      SELECT n.*, now() AS tomado_en FROM public.familia_notificaciones n
       WHERE n.para_id=55
          OR n.tarea_id IN (SELECT id FROM public.familia_tareas WHERE asignada_a=55 OR creada_por=55);
  END IF;
  IF to_regclass('respaldos.familia_qa_limp_m55_sesiones') IS NULL THEN
    CREATE TABLE respaldos.familia_qa_limp_m55_sesiones AS
      SELECT s.*, now() AS tomado_en FROM public.familia_sesiones s WHERE s.miembro_id=55;
  END IF;
  IF to_regclass('respaldos.familia_qa_limp_m55_solicitudes') IS NULL THEN
    CREATE TABLE respaldos.familia_qa_limp_m55_solicitudes AS
      SELECT s.*, now() AS tomado_en FROM public.familia_solicitudes_premios s WHERE s.miembro_id=55;
  END IF;
  IF to_regclass('respaldos.familia_qa_limp_m55_v6c') IS NULL THEN
    CREATE TABLE respaldos.familia_qa_limp_m55_v6c AS
      SELECT a.*, now() AS tomado_en FROM public.familia_v6c_aplicaciones a WHERE a.miembro_id=55;
  END IF;
END $$;

-- ========== 2) Links E2E (NO QA2): respaldo + revocado_en (trigger bloquea DELETE) ==========
DO $$ BEGIN
  IF to_regclass('respaldos.familia_qa_limp_links_e2e') IS NULL THEN
    CREATE TABLE respaldos.familia_qa_limp_links_e2e AS
      SELECT l.*, now() AS tomado_en
        FROM public.familia_links l
        LEFT JOIN public.familia_tareas t ON l.tipo='tarea' AND t.id=l.ref_id
       WHERE l.revocado_en IS NULL
         AND l.familia_id IS DISTINCT FROM 2  -- no tocar QA2
         AND (
           t.asignada_a = 55
           OR t.creada_por = 55
           OR coalesce(t.titulo,'') ILIKE '%QA%'
           OR l.creado_en >= timestamptz '2026-10-30 00:00:00+01'
              AND EXISTS (
                SELECT 1 FROM public.familia_miembros m
                 WHERE m.id = t.asignada_a
                   AND m.id NOT IN (53,54)
                   AND m.id NOT BETWEEN 1 AND 6
                   AND (lower(coalesce(m.alias_entrada,'')) LIKE 'qa%'
                        OR lower(coalesce(m.nombre,'')) LIKE 'qa%')
              )
         );
  END IF;
END $$;

UPDATE public.familia_links l
   SET revocado_en = now()
 WHERE l.revocado_en IS NULL
   AND l.id IN (SELECT id FROM respaldos.familia_qa_limp_links_e2e);

REVOKE ALL ON ALL TABLES IN SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA respaldos TO service_role;

-- ========== 3) Sesiones QA (solo m55 / qa* fuera de QA2 y fuera de m1–6) ==========
DO $$ BEGIN
  IF to_regclass('respaldos.familia_qa_limp_sesiones_qa') IS NULL THEN
    CREATE TABLE respaldos.familia_qa_limp_sesiones_qa AS
      SELECT s.*, now() AS tomado_en
        FROM public.familia_sesiones s
        JOIN public.familia_miembros m ON m.id = s.miembro_id
       WHERE s.miembro_id = 55
          OR (
            s.miembro_id NOT BETWEEN 1 AND 6
            AND s.miembro_id NOT IN (53,54)
            AND m.familia_id IS DISTINCT FROM 2
            AND (lower(coalesce(m.alias_entrada,'')) LIKE 'qa%'
                 OR lower(coalesce(m.nombre,'')) LIKE 'qa%')
          );
  END IF;
END $$;

DELETE FROM public.familia_sesiones s
 WHERE EXISTS (SELECT 1 FROM respaldos.familia_qa_limp_sesiones_qa b WHERE b.token = s.token);

-- ========== Dependientes m55 + borrar miembro ==========
DELETE FROM public.familia_notificaciones
 WHERE para_id = 55
    OR tarea_id IN (SELECT id FROM public.familia_tareas WHERE asignada_a=55 OR creada_por=55 OR marcada_por=55 OR conjunto_con=55);
DELETE FROM public.familia_historial
 WHERE miembro_id=55 OR actor_id=55
    OR tarea_id IN (SELECT id FROM public.familia_tareas WHERE asignada_a=55 OR creada_por=55 OR marcada_por=55 OR conjunto_con=55);
DELETE FROM public.familia_v6c_aplicaciones
 WHERE miembro_id=55
    OR tarea_id IN (SELECT id FROM public.familia_tareas WHERE asignada_a=55 OR creada_por=55);
DELETE FROM public.familia_solicitudes_premios WHERE miembro_id=55;
DELETE FROM public.familia_login_intentos WHERE alias_norm='qahijo8808';
DELETE FROM public.familia_tareas
 WHERE asignada_a=55 OR creada_por=55 OR marcada_por=55 OR conjunto_con=55;
DELETE FROM public.familia_miembros WHERE id=55
  AND (lower(coalesce(alias_entrada,'')) LIKE 'qa%' OR lower(coalesce(nombre,'')) LIKE 'qa%');

-- ========== Guardas finales ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77]; nulos int;
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'qa_limpieza_guarda_pts_post: puntos=% esperado=%', v, esperado;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.familia_miembros WHERE id=53 AND familia_id=2)
     OR NOT EXISTS (SELECT 1 FROM public.familia_miembros WHERE id=54 AND familia_id=2) THEN
    RAISE EXCEPTION 'qa_limpieza: QA2 m53/m54 desaparecieron';
  END IF;
  IF EXISTS (SELECT 1 FROM public.familia_miembros WHERE id=55) THEN
    RAISE EXCEPTION 'qa_limpieza: m55 sigue existiendo';
  END IF;
  SELECT count(*) INTO nulos FROM public.familia_tareas WHERE familia_id IS NULL;
  IF nulos <> 0 THEN
    RAISE EXCEPTION 'qa_limpieza: % tareas con familia_id NULL', nulos;
  END IF;
END $$;
