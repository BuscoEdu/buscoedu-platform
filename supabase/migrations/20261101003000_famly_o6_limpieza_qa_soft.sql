-- FAMLY O6 · Limpieza soft QA (fid 12/13 + admins o6*@qa.invalid + inv es_qa + rate_limit)
-- Fecha: 2026-10-31 Europe/Madrid · Quién: BD bot BuscoEdu
-- Soft: suspende familias, desactiva miembros/admins, reescribe nick/email/alias únicos,
--       revoca invitaciones QA (✗ DELETE). ✗ tocar fid 1/2 ni m1–6/53/54.
-- Guarda originales en respaldos.*.

-- ========== Guarda pts ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'o6_limp_qa_pts: puntos=% esperado=%', v, esperado;
  END IF;
  -- Abortar si algún target no es QA
  IF EXISTS (
    SELECT 1 FROM public.familia_familias f
     WHERE f.id IN (12,13)
       AND NOT (f.nickname ILIKE '%qa%' OR f.nickname ILIKE 'o6%')
  ) THEN
    RAISE EXCEPTION 'o6_limp_qa: familia 12/13 no parece QA; aborto';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.familia_admins a
     WHERE a.familia_id IN (12,13)
       AND a.email::text NOT ILIKE '%@qa.invalid'
  ) THEN
    RAISE EXCEPTION 'o6_limp_qa: admin de 12/13 sin @qa.invalid; aborto';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.familia_miembros m
     WHERE m.familia_id IN (12,13) AND m.id IN (1,2,3,4,5,6,53,54)
  ) THEN
    RAISE EXCEPTION 'o6_limp_qa: miembro protegido en 12/13; aborto';
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS respaldos;
REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA respaldos TO service_role;

-- ========== Respaldos ==========
DO $$ BEGIN
  IF to_regclass('respaldos.familia_o6_limp_familias') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_limp_familias AS
      SELECT f.*, now() AS tomado_en FROM public.familia_familias f WHERE f.id IN (12,13);
  ELSE
    INSERT INTO respaldos.familia_o6_limp_familias
    SELECT f.*, now() FROM public.familia_familias f
     WHERE f.id IN (12,13)
       AND NOT EXISTS (SELECT 1 FROM respaldos.familia_o6_limp_familias b WHERE b.id=f.id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('respaldos.familia_o6_limp_miembros') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_limp_miembros AS
      SELECT m.*, now() AS tomado_en FROM public.familia_miembros m WHERE m.familia_id IN (12,13);
  ELSE
    INSERT INTO respaldos.familia_o6_limp_miembros
    SELECT m.*, now() FROM public.familia_miembros m
     WHERE m.familia_id IN (12,13)
       AND NOT EXISTS (SELECT 1 FROM respaldos.familia_o6_limp_miembros b WHERE b.id=m.id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('respaldos.familia_o6_limp_admins') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_limp_admins AS
      SELECT a.*, now() AS tomado_en FROM public.familia_admins a
       WHERE a.familia_id IN (12,13)
          OR a.email::text ILIKE 'o6a-%@qa.invalid'
          OR a.email::text ILIKE 'o6b-%@qa.invalid';
  ELSE
    INSERT INTO respaldos.familia_o6_limp_admins
    SELECT a.*, now() FROM public.familia_admins a
     WHERE (a.familia_id IN (12,13)
            OR a.email::text ILIKE 'o6a-%@qa.invalid'
            OR a.email::text ILIKE 'o6b-%@qa.invalid')
       AND NOT EXISTS (SELECT 1 FROM respaldos.familia_o6_limp_admins b WHERE b.id=a.id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('respaldos.familia_o6_limp_invitaciones') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_limp_invitaciones AS
      SELECT i.*, now() AS tomado_en FROM public.familia_invitaciones i WHERE i.es_qa;
  ELSE
    INSERT INTO respaldos.familia_o6_limp_invitaciones
    SELECT i.*, now() FROM public.familia_invitaciones i
     WHERE i.es_qa
       AND NOT EXISTS (SELECT 1 FROM respaldos.familia_o6_limp_invitaciones b WHERE b.id=i.id);
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('respaldos.familia_o6_limp_rate_limit') IS NULL THEN
    CREATE TABLE respaldos.familia_o6_limp_rate_limit AS
      SELECT r.*, now() AS tomado_en FROM public.familia_rate_limit r;
  ELSE
    INSERT INTO respaldos.familia_o6_limp_rate_limit
    SELECT r.*, now() FROM public.familia_rate_limit r
     WHERE NOT EXISTS (
       SELECT 1 FROM respaldos.familia_o6_limp_rate_limit b
        WHERE b.clave=r.clave AND b.ventana_inicio=r.ventana_inicio
     );
  END IF;
END $$;

REVOKE ALL ON ALL TABLES IN SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA respaldos TO service_role;

-- ========== Soft: familias → suspendida + nick liberado ==========
-- nick CHECK ^[a-z0-9_-]{5,20}$: usar baja_f<id> (único, ≤20)
UPDATE public.familia_familias f
   SET estado = 'suspendida',
       nickname = 'baja_f' || f.id::text,
       actualizado_en = now()
 WHERE f.id IN (12,13)
   AND f.nickname NOT LIKE 'baja_f%';

-- ========== Soft: miembros → activo=false + alias liberado ==========
UPDATE public.familia_miembros m
   SET activo = false,
       alias_entrada = 'baja_m' || m.id::text
 WHERE m.familia_id IN (12,13)
   AND m.id NOT IN (1,2,3,4,5,6,53,54)
   AND coalesce(m.alias_entrada,'') NOT LIKE 'baja_m%';

-- ========== Soft: admins → activo=false + email liberado ==========
-- email CHECK length>3; UNIQUE citext → baja_a<id>@baja.invalid
UPDATE public.familia_admins a
   SET activo = false,
       email = ('baja_a' || a.id::text || '@baja.invalid')::extensions.citext
 WHERE (
     a.familia_id IN (12,13)
     OR a.email::text ILIKE 'o6a-%@qa.invalid'
     OR a.email::text ILIKE 'o6b-%@qa.invalid'
   )
   AND a.email::text NOT LIKE 'baja_a%@baja.invalid';

-- ========== Revocar invitaciones QA (anti-DELETE) ==========
UPDATE public.familia_invitaciones
   SET revocado_en = now()
 WHERE es_qa = true
   AND revocado_en IS NULL;

-- ========== rate_limit residual ==========
DELETE FROM public.familia_rate_limit;

-- ========== Guarda final ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'o6_limp_qa_post_pts: puntos=% esperado=%', v, esperado;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.familia_miembros WHERE id=53 AND familia_id=2)
     OR NOT EXISTS (SELECT 1 FROM public.familia_miembros WHERE id=54 AND familia_id=2) THEN
    RAISE EXCEPTION 'o6_limp_qa_post: QA2 rota';
  END IF;
END $$;
