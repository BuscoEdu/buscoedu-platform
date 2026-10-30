-- DESHACER · famly_o6_cupo_qa_seq
-- Restaura emitir 1-arg simple (cupo count(*) total) y next_miembro_id=max+1.
-- No borra columna es_qa (aditiva). Quién: BD bot.

DROP FUNCTION IF EXISTS public.familia_rpc_invitacion_emitir(text, boolean);
DROP FUNCTION IF EXISTS public.familia_invitacion_ocupa_cupo(boolean, timestamptz, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.familia_rpc_invitacion_emitir(p_nota text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token text; v_hash text; v_id bigint; v_vence timestamptz; v_n int;
BEGIN
  SELECT count(*)::int INTO v_n FROM public.familia_invitaciones;
  IF v_n >= 9 THEN
    RETURN jsonb_build_object('ok', false, 'hint', 'cupo', 'mensaje', 'Cupo de 9 invitaciones alcanzado.');
  END IF;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := public.familia_invitacion_hash(v_token);
  v_vence := now() + interval '30 days';
  INSERT INTO public.familia_invitaciones(token_hash, vence_en, nota)
  VALUES (v_hash, v_vence, nullif(trim(coalesce(p_nota,'')),''))
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'token', v_token, 'vence_en', v_vence);
END;
$$;
REVOKE ALL ON FUNCTION public.familia_rpc_invitacion_emitir(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_rpc_invitacion_emitir(text) TO service_role;

CREATE OR REPLACE FUNCTION public.familia_mf_o6_next_miembro_id()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v int;
BEGIN
  SELECT coalesce(max(id), 0) + 1 INTO v FROM public.familia_miembros;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.familia_mf_o6_next_miembro_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_mf_o6_next_miembro_id() TO service_role;
