-- =====================================================
-- LEAD CENTER — FASE 1 · Migración 3
-- Modelo de negocio de la oferta + snapshot e idempotencia en la oportunidad
-- =====================================================
-- Aditiva e idempotente. No modifica datos existentes salvo un backfill seguro
-- del valor por defecto del modelo de negocio.
-- =====================================================

BEGIN;

-- Modelo de negocio de la OFERTA (fuente de la decisión comercial).
ALTER TABLE public.ofertas_academicas
  ADD COLUMN IF NOT EXISTS modelo_negocio TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ofertas_academicas_modelo_negocio_check'
  ) THEN
    ALTER TABLE public.ofertas_academicas
      ADD CONSTRAINT ofertas_academicas_modelo_negocio_check
      CHECK (modelo_negocio IS NULL OR modelo_negocio IN ('por_lead','por_inscrito'));
  END IF;
END$$;

COMMENT ON COLUMN public.ofertas_academicas.modelo_negocio IS 'Modelo comercial de la oferta: por_lead (transferencia a universidad) | por_inscrito (gestión por asesor interno).';

-- Backfill seguro: las ofertas sin modelo definido se tratan como por_inscrito
-- (gestión interna), que es el flujo que NO transfiere datos y por lo tanto es
-- el valor conservador por defecto. No sobreescribe valores ya definidos.
UPDATE public.ofertas_academicas
  SET modelo_negocio = 'por_inscrito'
  WHERE modelo_negocio IS NULL;

CREATE INDEX IF NOT EXISTS idx_ofertas_modelo_negocio ON public.ofertas_academicas(modelo_negocio);

-- Snapshot del modelo de negocio en la OPORTUNIDAD (para que un cambio futuro de
-- la oferta no altere oportunidades históricas).
ALTER TABLE public.oportunidades
  ADD COLUMN IF NOT EXISTS modelo_negocio_snapshot TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'oportunidades_modelo_negocio_snapshot_check'
  ) THEN
    ALTER TABLE public.oportunidades
      ADD CONSTRAINT oportunidades_modelo_negocio_snapshot_check
      CHECK (modelo_negocio_snapshot IS NULL OR modelo_negocio_snapshot IN ('por_lead','por_inscrito'));
  END IF;
END$$;

COMMENT ON COLUMN public.oportunidades.modelo_negocio_snapshot IS 'Modelo de negocio congelado al crear la oportunidad.';

-- Clave de idempotencia de la conversión: evita crear oportunidades duplicadas
-- ante doble clic / reintento de red / refresh para la MISMA acción.
ALTER TABLE public.oportunidades
  ADD COLUMN IF NOT EXISTS clave_idempotencia TEXT;

COMMENT ON COLUMN public.oportunidades.clave_idempotencia IS 'Clave única de la acción de conversión (persona+oferta+ventana). Permite reintentos idempotentes. Una nueva oportunidad para la misma persona/oferta requiere una clave distinta (p. ej. nueva sesión/fecha).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_oportunidades_idempotencia_unique
  ON public.oportunidades(clave_idempotencia)
  WHERE clave_idempotencia IS NOT NULL;

-- Índices para dashboard / pipeline.
CREATE INDEX IF NOT EXISTS idx_oportunidades_etapa ON public.oportunidades(etapa_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_subestado ON public.oportunidades(subestado_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_asesor ON public.oportunidades(asesor_asignado_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_estado ON public.oportunidades(estado);
CREATE INDEX IF NOT EXISTS idx_oportunidades_persona ON public.oportunidades(persona_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_universidad ON public.oportunidades(universidad_id);
CREATE INDEX IF NOT EXISTS idx_oportunidades_proxima_accion ON public.oportunidades(fecha_proxima_accion);
CREATE INDEX IF NOT EXISTS idx_oportunidades_actualizado ON public.oportunidades(actualizado_en);

COMMIT;
