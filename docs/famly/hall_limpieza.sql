-- FAMLY O6 hallazgos fase 2 · Limpieza soft fid15 / m86–87 / inv16 / hallazgos
-- Fecha: 2026-10-31 Europe/Madrid · Quién: BD bot BuscoEdu
-- Tras PASS hallazgos. ✗ DELETE físico. ✗ tocar cupo 9 / fid1–2 / m1–6/53/54.

DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'hall_limp_pts: %', v;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.familia_familias f WHERE f.id=15
      AND (f.nombre_visible ILIKE '%qa%' OR f.nombre_visible ILIKE '%ejemplo%'
           OR f.nickname ILIKE '%qa%' OR f.nickname ILIKE '%ejem%' OR f.nickname ILIKE 'o6%')
  ) THEN
    RAISE EXCEPTION 'hall_limp: fid15 no parece QA; aborto';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.familia_admins a
     WHERE a.familia_id=15 AND a.email::text NOT ILIKE '%@qa.invalid'
  ) THEN
    RAISE EXCEPTION 'hall_limp: admin fid15 sin @qa.invalid; aborto';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.familia_miembros m
     WHERE m.familia_id=15 AND m.id IN (1,2,3,4,5,6,53,54)
  ) THEN
    RAISE EXCEPTION 'hall_limp: miembro protegido en fid15; aborto';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS respaldos;
REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA respaldos TO service_role;

DO $$ BEGIN
  IF to_regclass('respaldos.familia_o6_hall_limp_familias') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_hall_limp_familias AS
      SELECT f.*, now() AS tomado_en FROM public.familia_familias f WHERE f.id=15;
  END IF;
  IF to_regclass('respaldos.familia_o6_hall_limp_miembros') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_hall_limp_miembros AS
      SELECT m.*, now() AS tomado_en FROM public.familia_miembros m WHERE m.familia_id=15;
  END IF;
  IF to_regclass('respaldos.familia_o6_hall_limp_admins') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_hall_limp_admins AS
      SELECT a.*, now() AS tomado_en FROM public.familia_admins a WHERE a.familia_id=15;
  END IF;
  IF to_regclass('respaldos.familia_o6_hall_limp_invitaciones') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_hall_limp_invitaciones AS
      SELECT i.*, now() AS tomado_en FROM public.familia_invitaciones i WHERE i.id=16;
  END IF;
  IF to_regclass('respaldos.familia_o6_hall_limp_hallazgos') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_hall_limp_hallazgos AS
      SELECT h.*, now() AS tomado_en FROM public.famly_hallazgos h WHERE h.familia_id=15;
  END IF;
  IF to_regclass('respaldos.familia_o6_hall_limp_sesiones') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_hall_limp_sesiones AS
      SELECT s.*, now() AS tomado_en FROM public.familia_sesiones s
       WHERE s.familia_id=15 OR s.miembro_id IN (86,87);
  END IF;
  IF to_regclass('respaldos.familia_o6_hall_limp_rate_limit') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_hall_limp_rate_limit AS
      SELECT r.*, now() AS tomado_en FROM public.familia_rate_limit r
       WHERE r.clave LIKE 'o6_hallazgo:%' OR r.clave LIKE 'admin:%';
  END IF;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA respaldos TO service_role;

UPDATE public.familia_familias
   SET estado='suspendida', nickname='baja_f15', actualizado_en=now()
 WHERE id=15 AND nickname NOT LIKE 'baja_f%';

UPDATE public.familia_miembros
   SET activo=false, alias_entrada='baja_m'||id::text
 WHERE familia_id=15 AND id NOT IN (1,2,3,4,5,6,53,54)
   AND coalesce(alias_entrada,'') NOT LIKE 'baja_m%';

UPDATE public.familia_admins
   SET activo=false,
       email=('baja_a'||id::text||'@baja.invalid')::extensions.citext
 WHERE familia_id=15 AND email::text NOT LIKE 'baja_a%@baja.invalid';

UPDATE public.familia_invitaciones
   SET revocado_en=now() WHERE id=16 AND revocado_en IS NULL;

UPDATE public.famly_hallazgos
   SET borrado_en=now() WHERE familia_id=15 AND borrado_en IS NULL;

UPDATE public.familia_sesiones
   SET cerrada_en=now()
 WHERE (familia_id=15 OR miembro_id IN (86,87)) AND cerrada_en IS NULL;

DELETE FROM public.familia_rate_limit
 WHERE clave LIKE 'o6_hallazgo:%' OR clave LIKE 'admin:%';

DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77]; cupo int;
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN RAISE EXCEPTION 'hall_limp_post_pts: %', v; END IF;
  SELECT count(*)::int INTO cupo FROM public.familia_invitaciones i
   WHERE public.familia_invitacion_ocupa_cupo(i.es_qa,i.revocado_en,i.usado_en,i.vence_en);
  IF cupo <> 9 THEN RAISE EXCEPTION 'hall_limp_post_cupo: %', cupo; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.familia_miembros WHERE id=53 AND familia_id=2)
     OR NOT EXISTS (SELECT 1 FROM public.familia_miembros WHERE id=54 AND familia_id=2) THEN
    RAISE EXCEPTION 'hall_limp_post: QA2 rota';
  END IF;
END $$;
