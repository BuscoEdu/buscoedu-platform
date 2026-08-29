-- Migración: Crear tabla usuarios_universidad
-- Descripción: Estructura base de usuarios de universidades para panel B2B (v0.2).

CREATE TABLE IF NOT EXISTS public.usuarios_universidad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  universidad_id UUID REFERENCES public.universidades(id) ON DELETE CASCADE,
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  correo TEXT UNIQUE NOT NULL,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  cargo TEXT,
  rol_universidad TEXT NOT NULL DEFAULT 'editor',
  activo BOOLEAN NOT NULL DEFAULT true,
  ultimo_acceso_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.usuarios_universidad IS 'Usuarios asociados a universidades para operación del futuro panel B2B.';
COMMENT ON COLUMN public.usuarios_universidad.universidad_id IS 'Universidad a la que pertenece el usuario.';
COMMENT ON COLUMN public.usuarios_universidad.rol_universidad IS 'Rol interno dentro del panel de universidad (ej. admin, editor, visualizador).';
COMMENT ON COLUMN public.usuarios_universidad.auth_user_id IS 'Vínculo opcional con usuario autenticado de Supabase Auth.';

CREATE INDEX IF NOT EXISTS idx_usuarios_universidad_universidad_id ON public.usuarios_universidad (universidad_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_universidad_rol_universidad ON public.usuarios_universidad (rol_universidad);
CREATE INDEX IF NOT EXISTS idx_usuarios_universidad_activo ON public.usuarios_universidad (activo);
CREATE INDEX IF NOT EXISTS idx_usuarios_universidad_ultimo_acceso_en ON public.usuarios_universidad (ultimo_acceso_en DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_universidad_auth_user_id
  ON public.usuarios_universidad (auth_user_id)
  WHERE auth_user_id IS NOT NULL;
