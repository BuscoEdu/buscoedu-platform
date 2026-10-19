-- =====================================================================
-- 20261018_rls_asesor_perfil_propio_deshacer.sql: deshace 20261018_rls_asesor_perfil_propio.sql
-- Idempotente. Quita solo las dos políticas nuevas; las de super_admin no se tocan.
-- =====================================================================
BEGIN;
-- Bloque 1: quitar la política de perfil propio.
DROP POLICY IF EXISTS usuario_lee_su_perfil_usuarios_internos ON public.usuarios_internos;
-- Bloque 2: quitar la política de rol propio.
DROP POLICY IF EXISTS usuario_lee_su_rol_roles ON public.roles;
COMMIT;
