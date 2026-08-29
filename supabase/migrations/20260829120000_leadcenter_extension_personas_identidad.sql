-- =====================================================
-- LEAD CENTER — FASE 1 · Migración 1
-- Extensión ADITIVA de `personas`: identidad por celular E.164 y verificación
-- =====================================================
-- Idempotente y no destructiva. No renombra ni elimina columnas existentes.
-- Reutiliza personas.telefono_principal (se conserva intacto) y agrega el
-- celular normalizado como LLAVE FUNCIONAL, sin reemplazar personas.id (PK).
--
-- VERIFICACIÓN PREVIA (ejecutar y revisar antes de aplicar en producción):
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='personas'
--   ORDER BY ordinal_position;
-- =====================================================

BEGIN;

-- Celular normalizado E.164 (llave funcional estratégica). NO reemplaza la PK.
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS celular_e164 TEXT;

-- País/código usado para normalizar (trazabilidad de la normalización).
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS pais_celular TEXT;

-- Vínculo con Supabase Auth (para sesión de la persona autenticada).
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS auth_user_id UUID;

-- Estados de verificación (NO marcados por un proveedor real en esta fase).
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS telefono_verificado BOOLEAN DEFAULT false;

ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS whatsapp_verificado BOOLEAN DEFAULT false;

-- Método con el que se verificó ('simulated' en esta fase; futuro: 'twilio', 'whatsapp').
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS metodo_verificacion TEXT;

-- Fecha de la última verificación exitosa.
ALTER TABLE public.personas
  ADD COLUMN IF NOT EXISTS fecha_verificacion_celular TIMESTAMPTZ;

COMMENT ON COLUMN public.personas.celular_e164 IS 'Celular normalizado en formato E.164. Llave funcional para reconciliar identidad entre canales. NO reemplaza personas.id.';
COMMENT ON COLUMN public.personas.pais_celular IS 'Código de país (ISO/E.164) usado para normalizar el celular.';
COMMENT ON COLUMN public.personas.auth_user_id IS 'Vínculo opcional con auth.users para la sesión de la persona (self-service).';
COMMENT ON COLUMN public.personas.metodo_verificacion IS 'Proveedor que verificó el celular: simulated | twilio | whatsapp.';

-- FK a auth.users solo si aún no existe (nombre estable para idempotencia).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'personas_auth_user_id_fkey'
  ) THEN
    ALTER TABLE public.personas
      ADD CONSTRAINT personas_auth_user_id_fkey
      FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END$$;

-- Índice único parcial: evita dos personas con el mismo celular normalizado,
-- permitiendo NULL (personas aún sin celular). Solo aplica a valores no nulos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_personas_celular_e164_unique
  ON public.personas(celular_e164)
  WHERE celular_e164 IS NOT NULL;

-- Índice único parcial para auth_user_id (una persona por usuario auth).
CREATE UNIQUE INDEX IF NOT EXISTS idx_personas_auth_user_unique
  ON public.personas(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Índices de búsqueda usados por el pipeline / directorio de personas.
CREATE INDEX IF NOT EXISTS idx_personas_correo_principal ON public.personas(correo_principal);
CREATE INDEX IF NOT EXISTS idx_personas_visitante ON public.personas(visitante_id);
CREATE INDEX IF NOT EXISTS idx_personas_estado_relacion ON public.personas(estado_relacion);

-- NOTA sobre duplicados: NO se migran automáticamente valores desde
-- telefono_principal a celular_e164. La reconciliación se hará en tiempo de
-- ejecución (Fase 2) normalizando en servidor. Si al intentar backfill se
-- detectaran colisiones, deben reportarse como incidencia, NO fusionarse.

COMMIT;
