-- Migración: Crear tabla precios_oferta
-- Descripción: Versionado de precios por oferta académica. Nunca se sobrescribe, siempre se crea un nuevo registro.

CREATE TABLE IF NOT EXISTS public.precios_oferta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oferta_id UUID REFERENCES public.ofertas_academicas(id) ON DELETE CASCADE,
  tipo_valor TEXT,
  concepto_cobro TEXT,
  valor NUMERIC(12,2),
  moneda TEXT NOT NULL DEFAULT 'COP',
  periodicidad TEXT,
  impuestos_incluidos BOOLEAN NOT NULL DEFAULT false,
  descripcion_condiciones TEXT,
  periodo_academico_id UUID REFERENCES public.periodos_academicos(id) ON DELETE SET NULL,
  fuente TEXT,
  estado_validacion TEXT NOT NULL DEFAULT 'pendiente',
  fecha_validacion TIMESTAMPTZ,
  validado_por UUID REFERENCES public.usuarios_internos(id) ON DELETE SET NULL,
  vigente_desde DATE,
  vigente_hasta DATE,
  es_precio_activo BOOLEAN NOT NULL DEFAULT true,
  reemplaza_precio_id UUID REFERENCES public.precios_oferta(id) ON DELETE SET NULL,
  creado_por UUID REFERENCES public.usuarios_internos(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.precios_oferta IS 'Histórico/versionado de precios asociados a ofertas académicas.';
COMMENT ON COLUMN public.precios_oferta.valor IS 'Valor monetario del concepto de cobro.';
COMMENT ON COLUMN public.precios_oferta.reemplaza_precio_id IS 'Autoreferencia al precio anterior que reemplaza este registro.';
COMMENT ON COLUMN public.precios_oferta.es_precio_activo IS 'Marca el precio vigente de referencia para la oferta.';
COMMENT ON COLUMN public.precios_oferta.estado_validacion IS 'Estado de validación del dato de precio.';

CREATE INDEX IF NOT EXISTS idx_precios_oferta_oferta_id ON public.precios_oferta (oferta_id);
CREATE INDEX IF NOT EXISTS idx_precios_oferta_periodo_academico_id ON public.precios_oferta (periodo_academico_id);
CREATE INDEX IF NOT EXISTS idx_precios_oferta_validado_por ON public.precios_oferta (validado_por);
CREATE INDEX IF NOT EXISTS idx_precios_oferta_creado_por ON public.precios_oferta (creado_por);
CREATE INDEX IF NOT EXISTS idx_precios_oferta_reemplaza_precio_id ON public.precios_oferta (reemplaza_precio_id);
CREATE INDEX IF NOT EXISTS idx_precios_oferta_estado_validacion ON public.precios_oferta (estado_validacion);
CREATE INDEX IF NOT EXISTS idx_precios_oferta_activo_por_oferta ON public.precios_oferta (oferta_id, es_precio_activo);
CREATE INDEX IF NOT EXISTS idx_precios_oferta_vigencia ON public.precios_oferta (vigente_desde, vigente_hasta);
