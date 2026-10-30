-- MF O3 · familia_links (tokens opacos WhatsApp/deep link) · 30/10/2026 Europe/Madrid
-- Qué: tabla de enlaces opacos {familia_id, tipo, ref_id} ↔ token.
-- Acceso: solo RPCs SECURITY DEFINER de Backend (familia_rpc_link_emitir/resolver);
--         esta migración NO crea esas RPCs.
-- Quién: BD bot BuscoEdu. Por qué: Orq GO O3 + O4 links; OK Jhon t809u.

-- ========== Guarda de puntos m1–m6 ==========
DO $$
DECLARE
  v int[];
  esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v
    FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'mf_o3_links_guarda_pts: puntos = % (esperado %); aborto', v, esperado;
  END IF;
END $$;

-- ========== Respaldo (catálogo previo: no había tabla) ==========
CREATE SCHEMA IF NOT EXISTS respaldos;
DO $$ BEGIN
  IF to_regclass('respaldos.familia_mf_o3_links_previo') IS NULL THEN
    CREATE TABLE respaldos.familia_mf_o3_links_previo (
      nota text NOT NULL,
      tomado_en timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO respaldos.familia_mf_o3_links_previo(nota)
    VALUES (
      CASE WHEN to_regclass('public.familia_links') IS NULL
           THEN 'antes: tabla ausente'
           ELSE 'antes: tabla ya existía (idempotente)'
      END
    );
  END IF;
END $$;
REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA respaldos TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA respaldos TO service_role;

-- ========== Tabla familia_links ==========
CREATE TABLE IF NOT EXISTS public.familia_links (
  id           bigserial PRIMARY KEY,
  familia_id   bigint NOT NULL REFERENCES public.familia_familias(id),
  tipo         text NOT NULL,
  ref_id       bigint NOT NULL,
  -- Token opaco: ≥32 bytes aleatorios en hex (64 chars, URL-safe)
  token        text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  creado_en    timestamptz NOT NULL DEFAULT now(),
  expira_en    timestamptz NULL,
  revocado_en  timestamptz NULL,
  CONSTRAINT familia_links_token_len CHECK (char_length(token) >= 43),
  CONSTRAINT familia_links_tipo_len CHECK (char_length(tipo) BETWEEN 1 AND 40)
);

-- Unicidad del token (UNIQUE en columna + índice explícito idempotente)
CREATE UNIQUE INDEX IF NOT EXISTS familia_links_token_uidx
  ON public.familia_links (token);

-- Búsqueda por casa + tipo + recurso
CREATE INDEX IF NOT EXISTS familia_links_fam_tipo_ref_idx
  ON public.familia_links (familia_id, tipo, ref_id);

-- ========== RLS: habilitada, sin policies → anon/authenticated no leen/escriben ==========
ALTER TABLE public.familia_links ENABLE ROW LEVEL SECURITY;
-- Sin CREATE POLICY a propósito: acceso solo vía service_role / SECURITY DEFINER.
REVOKE ALL ON public.familia_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.familia_links TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.familia_links_id_seq TO service_role;

-- ========== Bloquear DELETE físico: revocar con revocado_en ==========
CREATE OR REPLACE FUNCTION public.familia_links_bloquear_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- No se permite borrar filas; hay que poner revocado_en.
  RAISE EXCEPTION 'familia_links: DELETE físico prohibido; use revocado_en'
    USING ERRCODE = 'restrict_violation',
          HINT = 'mf_o3_links_no_delete';
END;
$$;

DROP TRIGGER IF EXISTS familia_links_no_delete ON public.familia_links;
CREATE TRIGGER familia_links_no_delete
  BEFORE DELETE ON public.familia_links
  FOR EACH ROW
  EXECUTE FUNCTION public.familia_links_bloquear_delete();

REVOKE ALL ON FUNCTION public.familia_links_bloquear_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_links_bloquear_delete() TO service_role;

-- ========== Guarda final de puntos ==========
DO $$
DECLARE
  v int[];
  esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v
    FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'mf_o3_links_guarda_pts_post: puntos = % (esperado %); aborto', v, esperado;
  END IF;
END $$;
