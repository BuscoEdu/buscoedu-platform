-- O11b · cerrar INSERT directo anon/authenticated en familia_miembros · BD BuscoEdu (bot) · 2026-11-01 · Orq GO (OK Jhon t973u)
-- Idempotente · deshacer: 20261101002500_famly_o11b_cerrar_insert_miembros_deshacer.sql
BEGIN;
-- Bloque 1: respaldo de grants y policies actuales de familia_miembros (antes del cambio)
CREATE TABLE IF NOT EXISTS respaldos.famly_o11b_miembros_grants_previo AS
  SELECT 'grant'::text tipo, grantee::text quien, privilege_type::text detalle, now() respaldado_en
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'familia_miembros' AND grantee IN ('anon', 'authenticated')
  UNION ALL
  SELECT 'policy', policyname::text, cmd || ' roles=' || roles::text || ' using=' || coalesce(qual, '') || ' check=' || coalesce(with_check, ''), now()
    FROM pg_policies WHERE schemaname = 'public' AND tablename = 'familia_miembros';
REVOKE ALL ON respaldos.famly_o11b_miembros_grants_previo FROM anon, authenticated;

-- Bloque 2: cerrar SOLO el INSERT directo desde la web (anon/authenticated).
-- SELECT/UPDATE/policies ✗ tocados. Las RPC familia_rpc_miembro_crear y familia_rpc_admin_registrar
-- son SECURITY DEFINER (dueño postgres) y siguen insertando.
REVOKE INSERT ON public.familia_miembros FROM anon, authenticated;
COMMIT;
