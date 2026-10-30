-- Post-smoke · Desbloqueo login QA en casa real (familia_login_intentos)
-- Fecha: 2026-10-30 Europe/Madrid · Quién: BD bot BuscoEdu
-- Contexto: smoke/QA disparó «Demasiados intentos» en beman27 (fid=1)
--   tras fallos con alias QA (qahijo8808). El límite es por (familia_id, alias_norm),
--   NO por IP ni por casa entera. m1–m6 NO estaban bloqueados; se limpia solo QA.
-- NO toca: filas no-QA, QA2 (fid=2, m53, m54), m1–m6, PINs/tokens.

-- ========== Guarda puntos m1–m6 + QA2 ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'qa_login_desbloq_guarda_pts: puntos=% esperado=%; aborto', v, esperado;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.familia_miembros WHERE id=53 AND familia_id=2)
     OR NOT EXISTS (SELECT 1 FROM public.familia_miembros WHERE id=54 AND familia_id=2) THEN
    RAISE EXCEPTION 'qa_login_desbloq: QA2 m53/m54 ausentes; aborto';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS respaldos;
REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA respaldos TO service_role;

-- ========== 1) Respaldo + borrado de intentos QA de hoy (causan el bloqueo) ==========
-- Criterio: alias_norm LIKE 'qa%' y actualizado hoy (Europe/Madrid). Sin tocar no-QA.
DO $$ BEGIN
  IF to_regclass('respaldos.familia_qa_login_intentos_desbloq') IS NULL THEN
    CREATE TABLE respaldos.familia_qa_login_intentos_desbloq AS
      SELECT i.*, now() AS tomado_en
        FROM public.familia_login_intentos i
       WHERE i.alias_norm LIKE 'qa%'
         AND i.actualizado_en::date = (now() AT TIME ZONE 'Europe/Madrid')::date;
  ELSE
    INSERT INTO respaldos.familia_qa_login_intentos_desbloq
      SELECT i.*, now() AS tomado_en
        FROM public.familia_login_intentos i
       WHERE i.alias_norm LIKE 'qa%'
         AND i.actualizado_en::date = (now() AT TIME ZONE 'Europe/Madrid')::date
         AND NOT EXISTS (
           SELECT 1 FROM respaldos.familia_qa_login_intentos_desbloq b WHERE b.id = i.id
         );
  END IF;
END $$;
REVOKE ALL ON respaldos.familia_qa_login_intentos_desbloq FROM PUBLIC, anon, authenticated;
GRANT ALL ON respaldos.familia_qa_login_intentos_desbloq TO service_role;

DELETE FROM public.familia_login_intentos i
 WHERE i.alias_norm LIKE 'qa%'
   AND i.actualizado_en::date = (now() AT TIME ZONE 'Europe/Madrid')::date;

-- ========== 2) Si m55 reapareció (QA), respaldar y borrar con deps mínimas ==========
DO $$
DECLARE v_alias text; v_ok boolean := false;
BEGIN
  SELECT alias_entrada INTO v_alias FROM public.familia_miembros WHERE id=55;
  IF NOT FOUND THEN
    RAISE NOTICE 'qa_login_desbloq: m55 ausente (ok)';
    RETURN;
  END IF;
  IF lower(coalesce(v_alias,'')) LIKE 'qa%' THEN v_ok := true; END IF;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'qa_login_desbloq: m55 existe pero NO es QA; no se toca';
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.familia_miembros WHERE id=55) THEN
    IF to_regclass('respaldos.familia_qa_login_m55_recheck') IS NULL THEN
      CREATE TABLE respaldos.familia_qa_login_m55_recheck AS
        SELECT m.*, now() AS tomado_en FROM public.familia_miembros m WHERE m.id=55;
      REVOKE ALL ON respaldos.familia_qa_login_m55_recheck FROM PUBLIC, anon, authenticated;
      GRANT ALL ON respaldos.familia_qa_login_m55_recheck TO service_role;
    END IF;
    IF to_regclass('respaldos.familia_qa_login_m55_tareas') IS NULL THEN
      CREATE TABLE respaldos.familia_qa_login_m55_tareas AS
        SELECT t.*, now() AS tomado_en FROM public.familia_tareas t
         WHERE t.asignada_a=55 OR t.creada_por=55 OR t.marcada_por=55 OR t.conjunto_con=55;
      REVOKE ALL ON respaldos.familia_qa_login_m55_tareas FROM PUBLIC, anon, authenticated;
      GRANT ALL ON respaldos.familia_qa_login_m55_tareas TO service_role;
    END IF;
    IF to_regclass('respaldos.familia_qa_login_m55_sesiones') IS NULL THEN
      CREATE TABLE respaldos.familia_qa_login_m55_sesiones AS
        SELECT s.*, now() AS tomado_en FROM public.familia_sesiones s WHERE s.miembro_id=55;
      REVOKE ALL ON respaldos.familia_qa_login_m55_sesiones FROM PUBLIC, anon, authenticated;
      GRANT ALL ON respaldos.familia_qa_login_m55_sesiones TO service_role;
    END IF;
    -- Soft-revoke links a m55 (no DELETE: trigger lo bloquea)
    UPDATE public.familia_links SET revocado_en = now()
     WHERE asignada_a = 55 AND revocado_en IS NULL;
    DELETE FROM public.familia_sesiones WHERE miembro_id=55;
    DELETE FROM public.familia_historial WHERE miembro_id=55;
    DELETE FROM public.familia_tareas
     WHERE asignada_a=55 OR creada_por=55 OR marcada_por=55 OR conjunto_con=55;
    DELETE FROM public.familia_miembros WHERE id=55
      AND lower(coalesce(alias_entrada,'')) LIKE 'qa%';
  END IF;
END $$;

-- Limpiar intentos huérfanos del alias QA aunque no sean «hoy» (idempotente)
DELETE FROM public.familia_login_intentos WHERE alias_norm = 'qahijo8808';

-- ========== Guarda final ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
  n_bloq int;
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'qa_login_desbloq_post_pts: puntos=% esperado=%', v, esperado;
  END IF;
  IF EXISTS (SELECT 1 FROM public.familia_miembros WHERE id=55) THEN
    RAISE EXCEPTION 'qa_login_desbloq_post: m55 aún existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.familia_miembros WHERE id=53 AND familia_id=2)
     OR NOT EXISTS (SELECT 1 FROM public.familia_miembros WHERE id=54 AND familia_id=2) THEN
    RAISE EXCEPTION 'qa_login_desbloq_post: QA2 rota';
  END IF;
  SELECT count(*)::int INTO n_bloq FROM public.familia_login_intentos
   WHERE alias_norm LIKE 'qa%' AND bloqueado_hasta IS NOT NULL AND bloqueado_hasta > now();
  IF n_bloq > 0 THEN
    RAISE EXCEPTION 'qa_login_desbloq_post: aún % bloqueos QA activos', n_bloq;
  END IF;
END $$;
