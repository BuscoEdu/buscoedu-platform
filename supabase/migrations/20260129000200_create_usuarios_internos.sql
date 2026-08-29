-- Migración: Crear tabla usuarios_internos
-- Descripción: Usuarios del equipo interno de BuscoEdu con vínculo opcional a Supabase Auth y rol asignado.

CREATE TABLE IF NOT EXISTS public.usuarios_internos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rol_id UUID REFERENCES public.roles(id) ON DELETE SET NULL,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  correo TEXT UNIQUE NOT NULL,
  telefono TEXT,
  cargo TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  ultimo_acceso_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.usuarios_internos IS 'Usuarios internos de BuscoEdu con rol para operación del panel administrativo y CRM.';
COMMENT ON COLUMN public.usuarios_internos.auth_user_id IS 'ID de usuario en Supabase Auth, opcional para cuentas no activadas aún.';
COMMENT ON COLUMN public.usuarios_internos.rol_id IS 'Rol interno asignado al usuario.';
COMMENT ON COLUMN public.usuarios_internos.correo IS 'Correo corporativo único del usuario interno.';

CREATE INDEX IF NOT EXISTS idx_usuarios_internos_rol_id ON public.usuarios_internos (rol_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_internos_auth_user_id ON public.usuarios_internos (auth_user_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_internos_activo ON public.usuarios_internos (activo);
CREATE INDEX IF NOT EXISTS idx_usuarios_internos_ultimo_acceso_en ON public.usuarios_internos (ultimo_acceso_en DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_internos_auth_user_id
  ON public.usuarios_internos (auth_user_id)
  WHERE auth_user_id IS NOT NULL;
