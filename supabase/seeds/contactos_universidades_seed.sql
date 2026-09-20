-- =====================================================
-- SEMILLA · CONTACTOS B2B DE UNIVERSIDADES
-- Crea estructura para registrar solicitudes comerciales
-- desde la página /universidades de BuscoEdu.
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.contactos_universidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_apellidos text NOT NULL,
  cargo text NOT NULL,
  universidad text NOT NULL,
  correo_institucional text NOT NULL,
  pais_mercado text NOT NULL,
  telefono text,
  programas_prioritarios text,
  modalidad_potenciar text,
  matrículas_objetivo text,
  convocatoria_proxima text,
  necesidad_principal text,
  interes_descuentos boolean DEFAULT false,
  comentarios text,
  created_at timestamptz DEFAULT NOW()
);

ALTER TABLE public.contactos_universidades ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'contactos_universidades'
      AND policyname = 'Inserción pública de contactos'
  ) THEN
    CREATE POLICY "Inserción pública de contactos"
      ON public.contactos_universidades
      FOR INSERT
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'contactos_universidades'
      AND policyname = 'Solo admin lee contactos'
  ) THEN
    CREATE POLICY "Solo admin lee contactos"
      ON public.contactos_universidades
      FOR SELECT
      USING (false);
  END IF;
END
$$;

COMMIT;
