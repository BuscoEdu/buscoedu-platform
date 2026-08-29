-- Migración: Crear tabla periodos_academicos
-- Descripción: Ventanas académicas oficiales por universidad/sede para inscripciones y matrícula.

CREATE TABLE IF NOT EXISTS public.periodos_academicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  universidad_id UUID REFERENCES public.universidades(id) ON DELETE CASCADE,
  sede_id UUID REFERENCES public.sedes(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  tipo_periodicidad TEXT,
  fecha_inicio DATE,
  fecha_fin DATE,
  fecha_limite_inscripcion DATE,
  fecha_limite_matricula DATE,
  anio INT,
  numero_periodo INT,
  estado TEXT NOT NULL DEFAULT 'activo',
  notas TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.periodos_academicos IS 'Periodos académicos por universidad y sede con fechas clave operativas.';
COMMENT ON COLUMN public.periodos_academicos.universidad_id IS 'Universidad propietaria del periodo académico.';
COMMENT ON COLUMN public.periodos_academicos.sede_id IS 'Sede específica del periodo; null cuando aplica a nivel institucional.';
COMMENT ON COLUMN public.periodos_academicos.estado IS 'Estado operativo del periodo (ej. activo, cerrado, planeado).';

CREATE INDEX IF NOT EXISTS idx_periodos_academicos_universidad_id ON public.periodos_academicos (universidad_id);
CREATE INDEX IF NOT EXISTS idx_periodos_academicos_sede_id ON public.periodos_academicos (sede_id);
CREATE INDEX IF NOT EXISTS idx_periodos_academicos_activo ON public.periodos_academicos (activo);
CREATE INDEX IF NOT EXISTS idx_periodos_academicos_estado ON public.periodos_academicos (estado);
CREATE INDEX IF NOT EXISTS idx_periodos_academicos_anio_numero_periodo ON public.periodos_academicos (anio, numero_periodo);
CREATE INDEX IF NOT EXISTS idx_periodos_academicos_fechas ON public.periodos_academicos (fecha_inicio, fecha_fin);
