-- FAMLY O6 · Cupo 9 solo invitaciones reales activas + es_qa + seq miembros
-- Fecha: 2026-10-30 Europe/Madrid · Quién: BD bot BuscoEdu
-- Cupo: cuenta NOT es_qa AND revocado_en IS NULL AND (usado_en IS NOT NULL OR vence_en > now()).
--   Vencidas sin usar NO cuentan. QA no cuenta.
-- Secuencia: familia_mf_o6_next_miembro_id usa nextval si hay serial; setval(max).

-- ========== Guarda pts ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  IF to_regclass('public.familia_miembros') IS NULL THEN RETURN; END IF;
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS NOT NULL AND cardinality(v) = 6 AND v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'o6_cupo_guarda_pts: puntos=% esperado=%', v, esperado;
  END IF;
END $$;

-- ========== Columna es_qa ==========
ALTER TABLE public.familia_invitaciones
  ADD COLUMN IF NOT EXISTS es_qa boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.familia_invitaciones.es_qa IS
  'O6: true = invitación QA (no cuenta en cupo de 9 reales).';

-- Marcar las QA existentes (notas qa_o6_* / qa_*)
UPDATE public.familia_invitaciones
   SET es_qa = true
 WHERE es_qa = false
   AND (
     coalesce(nota, '') ILIKE 'qa_o6_%'
     OR coalesce(nota, '') ILIKE 'qa_%'
     OR coalesce(nota, '') = 'qa'
   );

CREATE INDEX IF NOT EXISTS familia_invitaciones_cupo_idx
  ON public.familia_invitaciones (es_qa, revocado_en, usado_en, vence_en);

-- ========== Helper: ¿ocupa cupo real? ==========
CREATE OR REPLACE FUNCTION public.familia_invitacion_ocupa_cupo(
  p_es_qa boolean,
  p_revocado_en timestamptz,
  p_usado_en timestamptz,
  p_vence_en timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (NOT coalesce(p_es_qa, false))
     AND p_revocado_en IS NULL
     AND (
       p_usado_en IS NOT NULL
       OR (p_vence_en IS NOT NULL AND p_vence_en > now())
     );
$$;

REVOKE ALL ON FUNCTION public.familia_invitacion_ocupa_cupo(boolean, timestamptz, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_invitacion_ocupa_cupo(boolean, timestamptz, timestamptz, timestamptz)
  TO service_role;

-- ========== Reemplazar emitir: cupo solo reales activas; flag QA ==========
DROP FUNCTION IF EXISTS public.familia_rpc_invitacion_emitir(text);
CREATE OR REPLACE FUNCTION public.familia_rpc_invitacion_emitir(
  p_nota text DEFAULT NULL,
  p_es_qa boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token text;
  v_hash text;
  v_id bigint;
  v_vence timestamptz;
  v_n int;
  v_nota text := nullif(trim(coalesce(p_nota, '')), '');
  v_qa boolean := coalesce(p_es_qa, false);
BEGIN
  IF NOT v_qa AND v_nota IS NOT NULL AND (v_nota ILIKE 'qa_o6_%' OR v_nota ILIKE 'qa_%' OR v_nota = 'qa') THEN
    v_qa := true;
  END IF;

  IF NOT v_qa THEN
    SELECT count(*)::int INTO v_n
      FROM public.familia_invitaciones i
     WHERE public.familia_invitacion_ocupa_cupo(i.es_qa, i.revocado_en, i.usado_en, i.vence_en);
    IF v_n >= 9 THEN
      RETURN jsonb_build_object('ok', false, 'hint', 'cupo',
        'mensaje', 'Cupo de 9 invitaciones alcanzado.');
    END IF;
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := public.familia_invitacion_hash(v_token);
  v_vence := now() + interval '30 days';

  INSERT INTO public.familia_invitaciones(token_hash, vence_en, nota, es_qa)
  VALUES (v_hash, v_vence, v_nota, v_qa)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_id,
    'token', v_token,
    'vence_en', v_vence,
    'es_qa', v_qa
  );
END;
$$;

REVOKE ALL ON FUNCTION public.familia_rpc_invitacion_emitir(text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_rpc_invitacion_emitir(text, boolean) TO service_role;

-- ========== Secuencia miembros: setval + next_miembro_id ==========
DO $$
DECLARE seq text;
  mx int;
BEGIN
  seq := pg_get_serial_sequence('public.familia_miembros', 'id');
  IF seq IS NULL THEN
    -- Crear secuencia si no existe y enganchar default (sin romper ids)
    IF to_regclass('public.familia_miembros_id_seq') IS NULL THEN
      CREATE SEQUENCE public.familia_miembros_id_seq;
    END IF;
    seq := 'public.familia_miembros_id_seq';
    SELECT coalesce(max(id), 0) INTO mx FROM public.familia_miembros;
    PERFORM setval(seq, greatest(mx, 1), true);
    BEGIN
      ALTER TABLE public.familia_miembros
        ALTER COLUMN id SET DEFAULT nextval('public.familia_miembros_id_seq');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'o6_cupo: no se pudo set DEFAULT id: %', SQLERRM;
    END;
    BEGIN
      ALTER SEQUENCE public.familia_miembros_id_seq OWNED BY public.familia_miembros.id;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  ELSE
    SELECT coalesce(max(id), 0) INTO mx FROM public.familia_miembros;
    PERFORM setval(seq, greatest(mx, 1), true);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.familia_mf_o6_next_miembro_id()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  seq text;
  v int;
BEGIN
  seq := pg_get_serial_sequence('public.familia_miembros', 'id');
  IF seq IS NOT NULL THEN
    EXECUTE format('SELECT nextval(%L)::int', seq) INTO v;
    RETURN v;
  END IF;
  -- Fallback legacy
  SELECT coalesce(max(id), 0) + 1 INTO v FROM public.familia_miembros;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.familia_mf_o6_next_miembro_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_mf_o6_next_miembro_id() TO service_role;

-- ========== Guarda final ==========
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS NOT NULL AND cardinality(v) = 6 AND v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'o6_cupo_post_pts: puntos=% esperado=%', v, esperado;
  END IF;
END $$;
