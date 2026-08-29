-- Migración: Crear tabla tipos_beneficio
-- Descripción: Catálogo de tipos de beneficios comerciales asociados a ofertas académicas.

CREATE TABLE IF NOT EXISTS public.tipos_beneficio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT true
);

COMMENT ON TABLE public.tipos_beneficio IS 'Catálogo maestro de beneficios, becas y descuentos para ofertas académicas.';
COMMENT ON COLUMN public.tipos_beneficio.codigo IS 'Código único del tipo de beneficio.';
COMMENT ON COLUMN public.tipos_beneficio.activo IS 'Permite desactivar un tipo de beneficio sin eliminar su historial.';

CREATE INDEX IF NOT EXISTS idx_tipos_beneficio_activo ON public.tipos_beneficio (activo);

INSERT INTO public.tipos_beneficio (codigo, nombre)
VALUES
  ('beca_postulacion', 'Beca por postulación'),
  ('beca_apropiacion_directa', 'Beca por apropiación directa'),
  ('descuento', 'Descuento'),
  ('financiacion', 'Financiación'),
  ('beneficio_convenio', 'Beneficio por convenio'),
  ('beneficio_temporal', 'Beneficio temporal'),
  ('otro', 'Otro')
ON CONFLICT (codigo) DO NOTHING;
