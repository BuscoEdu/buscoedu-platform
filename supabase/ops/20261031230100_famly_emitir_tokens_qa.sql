-- FAMLY O6 · Emitir tokens QA (2 válidos + 1 vencido + 1 revocado)
-- Fecha: 2026-10-30 Europe/Madrid · Quién: BD bot BuscoEdu
-- Uso: tras aplicar famly_invitaciones en el entorno destino (mock hoy; prod SOLO con GO 1:1 Orq).
-- Este SQL NO imprime tokens. Un script shell los escribe en qa-buscoedu.env (chmod 600).
-- También deja función de conteo auth.users para assert E2E delta=0 (sin correos / sin Auth).

-- Conteo auth.users (antes/después E2E → delta 0)
CREATE OR REPLACE FUNCTION public.familia_qa_count_auth_users()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT CASE
    WHEN to_regclass('auth.users') IS NULL THEN 0::bigint
    ELSE (SELECT count(*)::bigint FROM auth.users)
  END;
$$;
REVOKE ALL ON FUNCTION public.familia_qa_count_auth_users() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.familia_qa_count_auth_users() TO service_role;
