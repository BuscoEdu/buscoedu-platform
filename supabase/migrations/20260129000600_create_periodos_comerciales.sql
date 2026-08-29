-- Migración: Crear tabla periodos_comerciales
-- Descripción: Ventanas comerciales/campañas asociadas a un periodo académico objetivo.

CREATE TABLE IF NOT EXISTS public.periodos_comerciales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  descripcion TEXT,
  fecha_inicio DATE,
  fecha_fin DATE,
  periodo_academico_objetivo_id UUID REFERENCES public.periodos_academicos(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'activo',
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.periodos_comerciales IS 'Periodos comerciales para campañas de captación vinculadas a un periodo académico objetivo.';
COMMENT ON COLUMN public.periodos_comerciales.periodo_academico_objetivo_id IS 'Periodo académico al que apunta la campaña comercial.';
COMMENT ON COLUMN public.periodos_comerciales.estado IS 'Estado de la campaña comercial (ej. activo, cerrado, archivado).';

CREATE INDEX IF NOT EXISTS idx_periodos_comerciales_periodo_objetivo_id
  ON public.periodos_comerciales (periodo_academico_objetivo_id);
CREATE INDEX IF NOT EXISTS idx_periodos_comerciales_activo ON public.periodos_comerciales (activo);
CREATE INDEX IF NOT EXISTS idx_periodos_comerciales_estado ON public.periodos_comerciales (estado);
CREATE INDEX IF NOT EXISTS idx_periodos_comerciales_fechas ON public.periodos_comerciales (fecha_inicio, fecha_fin);
