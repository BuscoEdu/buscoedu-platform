-- =====================================================
-- ADMIN — FASE 4
-- Restringir eliminación física de usuarios internos
-- =====================================================
-- Regla: en Admin se usa soft delete mediante activo=false.
-- Esta migración elimina la política DELETE sobre usuarios_internos.

BEGIN;

DROP POLICY IF EXISTS solo_super_admin_delete_usuarios_internos ON public.usuarios_internos;

COMMIT;
