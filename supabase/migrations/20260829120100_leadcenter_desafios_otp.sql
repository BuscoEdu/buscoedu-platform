-- =====================================================
-- LEAD CENTER — FASE 1 · Migración 2
-- Tabla NUEVA `desafios_otp` — retos OTP con hash, caducidad, intentos y rate limit
-- =====================================================
-- Cubre una CAPACIDAD INEXISTENTE (no hay ninguna tabla OTP en el esquema).
-- No duplica ningún concepto existente. El código OTP NUNCA se guarda en texto
-- plano: solo su hash (bcrypt). El proveedor real (Twilio/WhatsApp) reutilizará
-- esta misma tabla sin cambios estructurales.
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.desafios_otp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  celular_e164 TEXT NOT NULL,
  proposito TEXT NOT NULL DEFAULT 'registro',        -- registro | login | reverificacion
  codigo_hash TEXT NOT NULL,                          -- hash bcrypt del código (NUNCA texto plano)
  proveedor TEXT NOT NULL DEFAULT 'simulated',        -- simulated | twilio | whatsapp
  estado TEXT NOT NULL DEFAULT 'pendiente',           -- pendiente | verificado | vencido | invalidado
  intentos INT NOT NULL DEFAULT 0,
  max_intentos INT NOT NULL DEFAULT 5,
  ip_origen TEXT,
  visitante_id UUID,
  persona_id UUID,
  expira_en TIMESTAMPTZ NOT NULL,
  verificado_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT desafios_otp_estado_check
    CHECK (estado IN ('pendiente','verificado','vencido','invalidado')),
  CONSTRAINT desafios_otp_proposito_check
    CHECK (proposito IN ('registro','login','reverificacion'))
);

COMMENT ON TABLE public.desafios_otp IS 'Retos OTP (One-Time Password). Guarda solo el hash del código, con caducidad, intentos y rate limiting. Módulo intercambiable (simulated -> twilio/whatsapp).';
COMMENT ON COLUMN public.desafios_otp.codigo_hash IS 'Hash bcrypt del código de 6 dígitos. El código en claro nunca se persiste.';
COMMENT ON COLUMN public.desafios_otp.proveedor IS 'Proveedor que generó el reto. simulated en la fase actual.';

CREATE INDEX IF NOT EXISTS idx_desafios_otp_celular ON public.desafios_otp(celular_e164);
CREATE INDEX IF NOT EXISTS idx_desafios_otp_estado ON public.desafios_otp(estado);
CREATE INDEX IF NOT EXISTS idx_desafios_otp_expira ON public.desafios_otp(expira_en);
CREATE INDEX IF NOT EXISTS idx_desafios_otp_ip ON public.desafios_otp(ip_origen);
-- Índice para rate limiting por celular + ventana temporal.
CREATE INDEX IF NOT EXISTS idx_desafios_otp_celular_creado ON public.desafios_otp(celular_e164, creado_en DESC);

-- RLS: la tabla solo se maneja desde el servidor (service role, que bypassa RLS).
-- Se habilita RLS SIN políticas públicas => ningún cliente anónimo/authenticated
-- puede leer ni escribir directamente. Esto evita enumerar celulares registrados.
ALTER TABLE public.desafios_otp ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "otp_solo_super_admin_lectura" ON public.desafios_otp;
CREATE POLICY "otp_solo_super_admin_lectura" ON public.desafios_otp
  FOR SELECT TO authenticated USING (public.is_super_admin());

COMMIT;
