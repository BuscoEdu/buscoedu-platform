-- MF O3 ops · Limpieza QA m52 + sesiones QA + backfill tareas + familia QA #2
-- Fecha: 2026-10-30 Europe/Madrid · Quién: BD bot BuscoEdu
-- PIN QA2: NO va en este archivo. Aplicar con SET app.qa2_pin desde /home/box/.secrets/qa-buscoedu.env
-- No toca miembros reales 1–6 ni sesiones de Jhon. Sin Auth/email.

-- ========== Guarda puntos m1–m6 ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'mf_o3_ops_guarda_pts: puntos=% esperado=%; aborto', v, esperado;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS respaldos;
REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA respaldos TO service_role;

-- ========== 1) Respaldo + borrado miembro QA 52 (confirmado qa*) ==========
DO $$
DECLARE
  v_alias text; v_nombre text; v_ok boolean := false;
BEGIN
  SELECT alias_entrada, nombre INTO v_alias, v_nombre
    FROM public.familia_miembros WHERE id = 52;
  IF NOT FOUND THEN
    RAISE NOTICE 'mf_o3_ops: miembro 52 ya no existe; se omite borrado';
    RETURN;
  END IF;
  IF lower(coalesce(v_alias,'')) LIKE 'qa%'
     OR lower(coalesce(v_nombre,'')) LIKE 'qa%' THEN
    v_ok := true;
  END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'mf_o3_ops: miembro 52 NO es QA claro (alias/nombre); aborto sin tocar';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('respaldos.familia_mf_o3_ops_m52_miembro') IS NULL THEN
    CREATE TABLE respaldos.familia_mf_o3_ops_m52_miembro AS
      SELECT m.*, now() AS tomado_en FROM public.familia_miembros m WHERE m.id = 52;
  END IF;
  IF to_regclass('respaldos.familia_mf_o3_ops_m52_tareas') IS NULL THEN
    CREATE TABLE respaldos.familia_mf_o3_ops_m52_tareas AS
      SELECT t.*, now() AS tomado_en FROM public.familia_tareas t
       WHERE t.asignada_a=52 OR t.creada_por=52 OR t.marcada_por=52 OR t.conjunto_con=52;
  END IF;
  IF to_regclass('respaldos.familia_mf_o3_ops_m52_hist') IS NULL THEN
    CREATE TABLE respaldos.familia_mf_o3_ops_m52_hist AS
      SELECT h.*, now() AS tomado_en FROM public.familia_historial h
       WHERE h.miembro_id=52 OR h.actor_id=52
          OR h.tarea_id IN (SELECT id FROM public.familia_tareas
                            WHERE asignada_a=52 OR creada_por=52);
  END IF;
  IF to_regclass('respaldos.familia_mf_o3_ops_m52_notif') IS NULL THEN
    CREATE TABLE respaldos.familia_mf_o3_ops_m52_notif AS
      SELECT n.*, now() AS tomado_en FROM public.familia_notificaciones n
       WHERE n.para_id=52
          OR n.tarea_id IN (SELECT id FROM public.familia_tareas
                            WHERE asignada_a=52 OR creada_por=52);
  END IF;
  IF to_regclass('respaldos.familia_mf_o3_ops_m52_sesiones') IS NULL THEN
    CREATE TABLE respaldos.familia_mf_o3_ops_m52_sesiones AS
      SELECT s.*, now() AS tomado_en FROM public.familia_sesiones s WHERE s.miembro_id=52;
  END IF;
  IF to_regclass('respaldos.familia_mf_o3_ops_m52_solicitudes') IS NULL THEN
    CREATE TABLE respaldos.familia_mf_o3_ops_m52_solicitudes AS
      SELECT s.*, now() AS tomado_en FROM public.familia_solicitudes_premios s WHERE s.miembro_id=52;
  END IF;
  IF to_regclass('respaldos.familia_mf_o3_ops_m52_v6c') IS NULL THEN
    CREATE TABLE respaldos.familia_mf_o3_ops_m52_v6c AS
      SELECT a.*, now() AS tomado_en FROM public.familia_v6c_aplicaciones a WHERE a.miembro_id=52;
  END IF;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA respaldos TO service_role;

-- Soft-revoke links de tareas QA si existieran
UPDATE public.familia_links
   SET revocado_en = coalesce(revocado_en, now())
 WHERE tipo = 'tarea'
   AND ref_id IN (SELECT id FROM public.familia_tareas WHERE asignada_a=52 OR creada_por=52)
   AND revocado_en IS NULL;

DELETE FROM public.familia_notificaciones
 WHERE para_id = 52
    OR tarea_id IN (SELECT id FROM public.familia_tareas WHERE asignada_a=52 OR creada_por=52 OR marcada_por=52 OR conjunto_con=52);
DELETE FROM public.familia_historial
 WHERE miembro_id = 52 OR actor_id = 52
    OR tarea_id IN (SELECT id FROM public.familia_tareas WHERE asignada_a=52 OR creada_por=52 OR marcada_por=52 OR conjunto_con=52);
DELETE FROM public.familia_v6c_aplicaciones WHERE miembro_id = 52
   OR tarea_id IN (SELECT id FROM public.familia_tareas WHERE asignada_a=52 OR creada_por=52);
DELETE FROM public.familia_solicitudes_premios WHERE miembro_id = 52;
DELETE FROM public.familia_sesiones WHERE miembro_id = 52;
DELETE FROM public.familia_login_intentos WHERE alias_norm = 'qamfo33447';
DELETE FROM public.familia_tareas
 WHERE asignada_a=52 OR creada_por=52 OR marcada_por=52 OR conjunto_con=52;
DELETE FROM public.familia_miembros WHERE id = 52
  AND (lower(coalesce(alias_entrada,'')) LIKE 'qa%' OR lower(coalesce(nombre,'')) LIKE 'qa%');

-- ========== 2) Sesiones E2E/QA (no tocar sesiones de miembros 1–6) ==========
DO $$ BEGIN
  IF to_regclass('respaldos.familia_mf_o3_ops_sesiones_qa') IS NULL THEN
    CREATE TABLE respaldos.familia_mf_o3_ops_sesiones_qa AS
      SELECT s.*, now() AS tomado_en
        FROM public.familia_sesiones s
        JOIN public.familia_miembros m ON m.id = s.miembro_id
       WHERE s.creado_en >= date '2026-10-30'
         AND s.miembro_id NOT BETWEEN 1 AND 6
         AND (
           lower(coalesce(m.alias_entrada,'')) LIKE 'qa%'
           OR lower(coalesce(m.nombre,'')) LIKE 'qa%'
           OR s.familia_id IN (SELECT id FROM public.familia_familias WHERE lower(nickname) LIKE 'qa%')
         );
  END IF;
END $$;

DELETE FROM public.familia_sesiones s
 WHERE EXISTS (
   SELECT 1 FROM respaldos.familia_mf_o3_ops_sesiones_qa b
    WHERE b.token = s.token
 );

UPDATE public.familia_sesiones s
   SET cerrada_en = coalesce(cerrada_en, now())
  FROM public.familia_miembros m
 WHERE m.id = s.miembro_id
   AND s.miembro_id NOT BETWEEN 1 AND 6
   AND s.cerrada_en IS NULL
   AND (lower(coalesce(m.alias_entrada,'')) LIKE 'qa%' OR lower(coalesce(m.nombre,'')) LIKE 'qa%');

REVOKE ALL ON ALL TABLES IN SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA respaldos TO service_role;

-- ========== 3) Backfill familia_tareas.familia_id NULL ← asignada_a / creada_por ==========
DO $$ BEGIN
  IF to_regclass('respaldos.familia_mf_o3_ops_tareas_null_fid') IS NULL THEN
    CREATE TABLE respaldos.familia_mf_o3_ops_tareas_null_fid AS
      SELECT t.id, t.asignada_a, t.creada_por, t.familia_id, now() AS tomado_en
        FROM public.familia_tareas t
       WHERE t.familia_id IS NULL;
  END IF;
END $$;
REVOKE ALL ON TABLE respaldos.familia_mf_o3_ops_tareas_null_fid FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE respaldos.familia_mf_o3_ops_tareas_null_fid TO service_role;

UPDATE public.familia_tareas t
   SET familia_id = m.familia_id
  FROM public.familia_miembros m
 WHERE t.familia_id IS NULL
   AND t.asignada_a = m.id
   AND m.familia_id IS NOT NULL;

UPDATE public.familia_tareas t
   SET familia_id = m.familia_id
  FROM public.familia_miembros m
 WHERE t.familia_id IS NULL
   AND t.creada_por = m.id
   AND m.familia_id IS NOT NULL;

UPDATE public.familia_tareas
   SET familia_id = 1
 WHERE familia_id IS NULL;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.familia_tareas WHERE familia_id IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'mf_o3_ops: quedan % tareas con familia_id NULL', n;
  END IF;
END $$;

-- ========== 4) Segunda familia QA (sin Auth/email) · PIN vía GUC app.qa2_pin ==========
DO $$
DECLARE
  v_pin text := nullif(current_setting('app.qa2_pin', true), '');
  v_fid bigint;
  v_cfg int;
  v_ya boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.familia_familias f
    JOIN public.familia_miembros a ON a.familia_id=f.id AND lower(a.alias_entrada)='qa2-admin'
    JOIN public.familia_miembros h ON h.familia_id=f.id AND lower(h.alias_entrada)='qa2-hijo'
    WHERE lower(f.nickname)='qa2mfcasa'
  ) INTO v_ya;
  IF v_ya THEN
    RAISE NOTICE 'mf_o3_ops: familia QA2 ya existe; se omite alta';
    RETURN;
  END IF;
  IF v_pin IS NULL OR char_length(v_pin) < 4 THEN
    RAISE EXCEPTION 'mf_o3_ops: falta GUC app.qa2_pin (cargar desde /home/box/.secrets/qa-buscoedu.env; no commitear)';
  END IF;

  INSERT INTO public.familia_familias (nombre_visible, nickname, link_token, estado, admin_email, email_dueno_activo)
  SELECT 'QA Familia 2', 'qa2mfcasa', encode(gen_random_bytes(12), 'hex'), 'activa', NULL, false
  WHERE NOT EXISTS (SELECT 1 FROM public.familia_familias WHERE lower(nickname)='qa2mfcasa');

  SELECT id INTO v_fid FROM public.familia_familias WHERE lower(nickname)='qa2mfcasa';

  INSERT INTO public.familia_miembros (nombre, rol, puntos, pin, es_admin, rol_v6d, familia_id, alias_entrada, emoji)
  SELECT 'QA2 Admin', 'Padre', 0, v_pin, true, 'padre_admin', v_fid, 'qa2-admin', '🧪'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.familia_miembros m WHERE m.familia_id=v_fid AND lower(m.alias_entrada)='qa2-admin'
  );

  INSERT INTO public.familia_miembros (nombre, rol, puntos, pin, es_admin, rol_v6d, familia_id, alias_entrada, emoji)
  SELECT 'QA2 Hijo', 'Hijo', 0, v_pin, false, 'hijo', v_fid, 'qa2-hijo', '🧒'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.familia_miembros m WHERE m.familia_id=v_fid AND lower(m.alias_entrada)='qa2-hijo'
  );

  SELECT coalesce(max(id),0)+1 INTO v_cfg FROM public.familia_config;
  INSERT INTO public.familia_config (id, nombre_familia, familia_id, zona_horaria)
  SELECT v_cfg, 'QA Familia 2', v_fid, 'Europe/Madrid'
  WHERE NOT EXISTS (SELECT 1 FROM public.familia_config c WHERE c.familia_id=v_fid);
END $$;

-- ========== Guarda final puntos ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'mf_o3_ops_guarda_pts_post: puntos=% esperado=%; aborto', v, esperado;
  END IF;
END $$;
