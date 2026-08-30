BEGIN;

-- Tabla de reglas de estancamiento (si no existe en un entorno nuevo).
CREATE TABLE IF NOT EXISTS public.reglas_estancamiento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  etapa_id UUID REFERENCES public.etapas_embudo(id),
  subestado_id UUID REFERENCES public.subestados_oportunidad(id),
  tiempo_maximo_horas INTEGER NOT NULL,
  accion_recomendada TEXT,
  reduce_score BOOLEAN DEFAULT false,
  escalar_a_humano BOOLEAN DEFAULT false,
  crear_tarea BOOLEAN DEFAULT true,
  mover_a_nurturing BOOLEAN DEFAULT false,
  activo BOOLEAN DEFAULT true,
  creado_en TIMESTAMPTZ DEFAULT now(),
  actualizado_en TIMESTAMPTZ DEFAULT now()
);

-- Entornos donde la tabla ya existía con estructura parcial.
ALTER TABLE public.reglas_estancamiento
  ADD COLUMN IF NOT EXISTS reduce_score BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalar_a_humano BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS crear_tarea BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS mover_a_nurturing BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS accion_recomendada TEXT,
  ADD COLUMN IF NOT EXISTS activo BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS creado_en TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS actualizado_en TIMESTAMPTZ DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reglas_estancamiento_nivel_check'
  ) THEN
    ALTER TABLE public.reglas_estancamiento
      ADD CONSTRAINT reglas_estancamiento_nivel_check CHECK (
        (etapa_id IS NOT NULL AND subestado_id IS NULL) OR
        (etapa_id IS NULL AND subestado_id IS NOT NULL)
      );
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_reglas_estancamiento_etapa
  ON public.reglas_estancamiento(etapa_id);

CREATE INDEX IF NOT EXISTS idx_reglas_estancamiento_subestado
  ON public.reglas_estancamiento(subestado_id);

CREATE INDEX IF NOT EXISTS idx_reglas_estancamiento_activo
  ON public.reglas_estancamiento(activo);

COMMIT;
