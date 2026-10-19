-- =====================================================================
-- 20261018_rls_asesor_perfil_propio.sql
-- Autor: Base de datos BuscoEdu. Aprobado: opción A del Orquestador, cubierta
-- por el OK de Jhon del 18/10 17:23 (UTC+2). Cambio de políticas RLS (solo SELECT).
-- Por qué: el login de /leadcenter y el middleware leen usuarios_internos +
-- roles(codigo) con el JWT del usuario. Hoy las únicas políticas SELECT son
-- is_super_admin(), así que un asesor ve 0 filas y lo sacan al login.
-- Idempotente.
-- =====================================================================
BEGIN;

-- Bloque 1: cada usuario interno puede leer SOLO su propia fila.
DROP POLICY IF EXISTS usuario_lee_su_perfil_usuarios_internos ON public.usuarios_internos;
CREATE POLICY usuario_lee_su_perfil_usuarios_internos ON public.usuarios_internos
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

-- Bloque 2: cada usuario interno puede leer SOLO el rol que tiene asignado.
DROP POLICY IF EXISTS usuario_lee_su_rol_roles ON public.roles;
CREATE POLICY usuario_lee_su_rol_roles ON public.roles
  FOR SELECT TO authenticated
  USING (id IN (SELECT ui.rol_id FROM public.usuarios_internos ui WHERE ui.auth_user_id = auth.uid()));

COMMIT;
