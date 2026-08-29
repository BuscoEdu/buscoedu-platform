-- Migración: Crear tabla roles
-- Descripción: Catálogo de roles internos de BuscoEdu para gobierno de acceso del panel administrativo.

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  permisos JSONB NOT NULL DEFAULT '{}'::jsonb,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.roles IS 'Catálogo de roles internos de BuscoEdu para control de permisos del panel administrativo.';
COMMENT ON COLUMN public.roles.codigo IS 'Código único del rol (ej. super_admin, admin, asesor).';
COMMENT ON COLUMN public.roles.permisos IS 'Permisos granulares opcionales del rol en formato JSONB.';
COMMENT ON COLUMN public.roles.activo IS 'Indica si el rol está disponible para asignación.';

CREATE INDEX IF NOT EXISTS idx_roles_activo ON public.roles (activo);

INSERT INTO public.roles (codigo, nombre, descripcion)
VALUES
  ('super_admin', 'Superadministrador', 'Acceso total sin restricción a todo el sistema'),
  ('admin', 'Administrador', 'Gestión operativa completa'),
  ('asesor', 'Asesor comercial', 'Acceso al CRM y oportunidades'),
  ('editor_contenido', 'Editor de contenido', 'Crea y edita contenido sin publicar'),
  ('analista', 'Analista', 'Solo lectura de reportes y métricas'),
  ('operaciones', 'Operaciones', 'Gestión de transferencias y facturación')
ON CONFLICT (codigo) DO NOTHING;
