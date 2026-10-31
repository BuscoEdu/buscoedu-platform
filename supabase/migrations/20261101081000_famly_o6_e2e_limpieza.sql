-- FAMLY O6 E2E fase 2 · Limpieza soft fid14 / m83–85 / admin qa / inv15
-- Fecha: 2026-10-31 Europe/Madrid · Quién: BD bot BuscoEdu
-- Tras E2E PASS inv15. Incluye m83 (admin miembro de fid14; user citó 84–85).
-- ✗ tocar cupo 9 reales, fid1/2, m1–6/53/54. Sesiones: cerrada_en (✗ DELETE).

DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'e2e_limp_pts: puntos=% esperado=%', v, esperado;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.familia_familias f
     WHERE f.id=14 AND (f.nombre_visible ILIKE '%ejemplo%' OR f.nickname ILIKE '%qa%' OR f.nickname ILIKE '%ejem%')
  ) THEN
    RAISE EXCEPTION 'e2e_limp: fid14 no parece QA; aborto';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.familia_admins a
     WHERE a.familia_id=14 AND a.email::text NOT ILIKE '%@qa.invalid'
  ) THEN
    RAISE EXCEPTION 'e2e_limp: admin fid14 sin @qa.invalid; aborto';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.familia_miembros m
     WHERE m.familia_id=14 AND m.id IN (1,2,3,4,5,6,53,54)
  ) THEN
    RAISE EXCEPTION 'e2e_limp: miembro protegido en fid14; aborto';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS respaldos;
REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA respaldos TO service_role;

DO $$ BEGIN
  IF to_regclass('respaldos.familia_o6_e2e_limp_familias') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_e2e_limp_familias AS
      SELECT f.*, now() AS tomado_en FROM public.familia_familias f WHERE f.id=14;
  END IF;
  IF to_regclass('respaldos.familia_o6_e2e_limp_miembros') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_e2e_limp_miembros AS
      SELECT m.*, now() AS tomado_en FROM public.familia_miembros m WHERE m.familia_id=14;
  END IF;
  IF to_regclass('respaldos.familia_o6_e2e_limp_admins') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_e2e_limp_admins AS
      SELECT a.*, now() AS tomado_en FROM public.familia_admins a WHERE a.familia_id=14;
  END IF;
  IF to_regclass('respaldos.familia_o6_e2e_limp_invitaciones') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_e2e_limp_invitaciones AS
      SELECT i.*, now() AS tomado_en FROM public.familia_invitaciones i WHERE i.id=15;
  END IF;
  IF to_regclass('respaldos.familia_o6_e2e_limp_sesiones') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_e2e_limp_sesiones AS
      SELECT s.*, now() AS tomado_en FROM public.familia_sesiones s
       WHERE s.familia_id=14 OR s.miembro_id IN (83,84,85);
  END IF;
  IF to_regclass('respaldos.familia_o6_e2e_limp_rate_limit') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_e2e_limp_rate_limit AS
      SELECT r.*, now() AS tomado_en FROM public.familia_rate_limit r;
  END IF;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA respaldos TO service_role;

-- Soft familia
UPDATE public.familia_familias
   SET estado='suspendida', nickname='baja_f14', actualizado_en=now()
 WHERE id=14 AND nickname NOT LIKE 'baja_f%';

-- Soft miembros (todos de fid14: 83–85)
UPDATE public.familia_miembros
   SET activo=false, alias_entrada='baja_m'||id::text
 WHERE familia_id=14
   AND id NOT IN (1,2,3,4,5,6,53,54)
   AND coalesce(alias_entrada,'') NOT LIKE 'baja_m%';

-- Soft admin
UPDATE public.familia_admins
   SET activo=false,
       email=('baja_a'||id::text||'@baja.invalid')::extensions.citext
 WHERE familia_id=14
   AND email::text NOT LIKE 'baja_a%@baja.invalid';

-- Revocar inv15
UPDATE public.familia_invitaciones
   SET revocado_en=now()
 WHERE id=15 AND revocado_en IS NULL;

-- Cerrar sesiones QA (✗ DELETE)
UPDATE public.familia_sesiones
   SET cerrada_en=now()
 WHERE (familia_id=14 OR miembro_id IN (83,84,85))
   AND cerrada_en IS NULL;

-- rate_limit residual
DELETE FROM public.familia_rate_limit;

DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
  cupo int;
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'e2e_limp_post_pts: %', v;
  END IF;
  SELECT count(*)::int INTO cupo FROM public.familia_invitaciones i
   WHERE public.familia_invitacion_ocupa_cupo(i.es_qa,i.revocado_en,i.usado_en,i.vence_en);
  IF cupo <> 9 THEN
    RAISE EXCEPTION 'e2e_limp_post_cupo: % (esperado 9)', cupo;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.familia_miembros WHERE id=53 AND familia_id=2)
     OR NOT EXISTS (SELECT 1 FROM public.familia_miembros WHERE id=54 AND familia_id=2) THEN
    RAISE EXCEPTION 'e2e_limp_post: QA2 rota';
  END IF;
END $$;
