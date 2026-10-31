-- FAMLY · Tabla public.famly_hallazgos (solo schema; RPC la hace Backend)
-- Fecha: 2026-10-31 Europe/Madrid · Quién: BD bot BuscoEdu
-- Orq GO / Jhon t836u/t867u. Sin contrato BE previo en repo (búsqueda sin RPC/API hallazgos).
-- PK bigserial como familia_invitaciones/familia_admins. miembro_id integer (FK familia_miembros).

-- ========== Guarda pts / cupo ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77]; cupo int;
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'hallazgos_guarda_pts: puntos=% esperado=%', v, esperado;
  END IF;
  SELECT count(*)::int INTO cupo FROM public.familia_invitaciones i
   WHERE public.familia_invitacion_ocupa_cupo(i.es_qa, i.revocado_en, i.usado_en, i.vence_en);
  IF cupo IS DISTINCT FROM 9 THEN
    RAISE EXCEPTION 'hallazgos_guarda_cupo: % (esperado 9)', cupo;
  END IF;
END $$;

-- ========== Si ya existiera: respaldo y no recrear a ciegas ==========
DO $$
BEGIN
  IF to_regclass('public.famly_hallazgos') IS NOT NULL THEN
    CREATE SCHEMA IF NOT EXISTS respaldos;
    REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;
    GRANT USAGE ON SCHEMA respaldos TO service_role;
    IF to_regclass('respaldos.famly_hallazgos_pre') IS NULL THEN
      EXECUTE $c$CREATE TABLE respaldos.famly_hallazgos_pre AS
        SELECT h.*, now() AS tomado_en FROM public.famly_hallazgos h$c$;
      REVOKE ALL ON respaldos.famly_hallazgos_pre FROM PUBLIC, anon, authenticated;
      GRANT ALL ON respaldos.famly_hallazgos_pre TO service_role;
    END IF;
    RAISE NOTICE 'famly_hallazgos ya existía; respaldo tomado; se alinea grants/RLS abajo';
  END IF;
END $$;

-- ========== Tabla ==========
CREATE TABLE IF NOT EXISTS public.famly_hallazgos (
  id           bigserial PRIMARY KEY,
  familia_id   bigint NOT NULL REFERENCES public.familia_familias(id),
  miembro_id   integer NOT NULL REFERENCES public.familia_miembros(id),
  tipo         text NOT NULL,
  descripcion  text NOT NULL,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  estado       text NOT NULL DEFAULT 'nuevo',
  borrado_en   timestamptz NULL,
  CONSTRAINT famly_hallazgos_tipo_chk
    CHECK (tipo IN ('error', 'sugerencia')),
  CONSTRAINT famly_hallazgos_desc_len_chk
    CHECK (char_length(descripcion) BETWEEN 5 AND 2000),
  CONSTRAINT famly_hallazgos_estado_chk
    CHECK (estado IN ('nuevo', 'revisado', 'resuelto', 'descartado'))
);

COMMENT ON TABLE public.famly_hallazgos IS
  'FAMLY: errores/sugerencias reportados por admin de una familia. Soft-delete vía borrado_en. RPC = BE.';

-- ========== Índice ==========
CREATE INDEX IF NOT EXISTS famly_hallazgos_familia_creado_idx
  ON public.famly_hallazgos (familia_id, creado_en DESC);

-- ========== RLS 0 policies + grants ==========
ALTER TABLE public.famly_hallazgos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.famly_hallazgos FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.famly_hallazgos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.famly_hallazgos_id_seq TO service_role;

-- ========== Guarda final ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'hallazgos_post_pts: %', v;
  END IF;
END $$;
