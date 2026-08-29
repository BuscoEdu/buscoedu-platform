-- Migración: Crear tabla beneficios_oferta
-- Descripción: Beneficios detallados asociados a una oferta académica.

CREATE TABLE IF NOT EXISTS public.beneficios_oferta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oferta_id UUID REFERENCES public.ofertas_academicas(id) ON DELETE CASCADE,
  tipo_beneficio_id UUID REFERENCES public.tipos_beneficio(id) ON DELETE SET NULL,
  nombre_beneficio TEXT NOT NULL,
  descripcion TEXT,
  condiciones TEXT,
  cupos_disponibles INT,
  vigente_desde DATE,
  vigente_hasta DATE,
  estado_validacion TEXT NOT NULL DEFAULT 'pendiente',
  estado_publicacion TEXT NOT NULL DEFAULT 'creado_internamente',
  es_principal BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.beneficios_oferta IS 'Detalle de becas/beneficios de cada oferta académica.';
COMMENT ON COLUMN public.beneficios_oferta.tipo_beneficio_id IS 'Tipo de beneficio del catálogo tipos_beneficio.';
COMMENT ON COLUMN public.beneficios_oferta.es_principal IS 'Indica si este beneficio es el principal dentro de la oferta.';
COMMENT ON COLUMN public.beneficios_oferta.estado_publicacion IS 'Estado de publicación del beneficio para consumo interno/público.';

CREATE INDEX IF NOT EXISTS idx_beneficios_oferta_oferta_id ON public.beneficios_oferta (oferta_id);
CREATE INDEX IF NOT EXISTS idx_beneficios_oferta_tipo_beneficio_id ON public.beneficios_oferta (tipo_beneficio_id);
CREATE INDEX IF NOT EXISTS idx_beneficios_oferta_estado_validacion ON public.beneficios_oferta (estado_validacion);
CREATE INDEX IF NOT EXISTS idx_beneficios_oferta_estado_publicacion ON public.beneficios_oferta (estado_publicacion);
CREATE INDEX IF NOT EXISTS idx_beneficios_oferta_activo ON public.beneficios_oferta (activo);
CREATE INDEX IF NOT EXISTS idx_beneficios_oferta_vigencia ON public.beneficios_oferta (vigente_desde, vigente_hasta);
