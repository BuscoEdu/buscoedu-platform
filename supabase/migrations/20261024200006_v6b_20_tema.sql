-- =====================================================================
-- v6b_20 · B20 Tema por miembro. Idempotente. NULL o inválido → el FE usa 'azul'.
-- Valores: 'azul' (actual), 'verde', 'morado', 'naranja', 'rosa' (nombres propuestos por BD; Producto puede renombrar).
-- =====================================================================
ALTER TABLE public.familia_miembros ADD COLUMN IF NOT EXISTS tema text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='familia_miembros_tema_chk') THEN
    ALTER TABLE public.familia_miembros ADD CONSTRAINT familia_miembros_tema_chk
      CHECK (tema IS NULL OR tema IN ('azul','verde','morado','naranja','rosa')); END IF;
END $$;
