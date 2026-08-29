-- Migración: Crear tabla jornadas
-- Descripción: Catálogo de jornadas académicas para clasificación de programas.

CREATE TABLE IF NOT EXISTS public.jornadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT true
);

COMMENT ON TABLE public.jornadas IS 'Catálogo de jornadas académicas disponibles en programas y sedes.';
COMMENT ON COLUMN public.jornadas.codigo IS 'Código único de jornada (ej. diurna, nocturna).';
COMMENT ON COLUMN public.jornadas.activo IS 'Permite desactivar una jornada sin borrarla físicamente.';

CREATE INDEX IF NOT EXISTS idx_jornadas_activo ON public.jornadas (activo);

INSERT INTO public.jornadas (codigo, nombre)
VALUES
  ('diurna', 'Diurna'),
  ('nocturna', 'Nocturna'),
  ('fines_de_semana', 'Fines de semana'),
  ('intensiva', 'Intensiva'),
  ('flexible', 'Flexible')
ON CONFLICT (codigo) DO NOTHING;
