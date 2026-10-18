-- BA-032 — WhatsApp real (Meta Cloud API): tablas propias del canal.
-- Migración versionada e idempotente. NO ejecutada: correr solo con OK del Orquestador.
-- No toca tablas de negocio existentes ni funciones de conversión.
--
-- Principios:
--   * Antes del consentimiento (Ley 1581) solo se guarda el número (wa_contactos).
--   * Historial (wa_mensajes) solo con consentimiento_datos = true (lo garantiza la app).
--   * Lead solo vía fn_ba031_convertir_si_consentido y con WA_LEAD_CONVERSION_ENABLED='true'.
--   * RLS activo sin políticas para anon/authenticated: solo service_role (webhook) escribe/lee.

BEGIN;

-- 1) Contacto por número de WhatsApp (estado del canal, consentimiento y opt-out).
CREATE TABLE IF NOT EXISTS public.wa_contactos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  celular_e164 text NOT NULL,
  estado text NOT NULL DEFAULT 'esperando_consentimiento',
  consentimiento_datos boolean NOT NULL DEFAULT false,
  consentimiento_datos_en timestamptz,
  consentimiento_version text,
  opt_out boolean NOT NULL DEFAULT false,
  opt_out_en timestamptz,
  ultimo_entrante_en timestamptz,
  sesion jsonb NOT NULL DEFAULT '{}'::jsonb,
  persona_id uuid REFERENCES public.personas(id),
  conversacion_id uuid REFERENCES public.conversaciones(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_contactos_estado_check CHECK (
    estado IN ('esperando_consentimiento', 'sin_consentimiento', 'activo', 'humano', 'baja')
  ),
  CONSTRAINT wa_contactos_e164_check CHECK (celular_e164 ~ '^\+[1-9][0-9]{7,14}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_contactos_celular ON public.wa_contactos (celular_e164);

-- 2) Idempotencia: cada wamid se procesa una sola vez.
CREATE TABLE IF NOT EXISTS public.wa_mensajes_procesados (
  wamid text PRIMARY KEY,
  recibido_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_mensajes_procesados_fecha ON public.wa_mensajes_procesados (recibido_en);

-- 3) Historial del canal (solo con consentimiento de datos).
CREATE TABLE IF NOT EXISTS public.wa_mensajes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contacto_id uuid NOT NULL REFERENCES public.wa_contactos(id) ON DELETE CASCADE,
  direccion text NOT NULL,
  tipo text NOT NULL DEFAULT 'texto',
  contenido text NOT NULL,
  id_meta text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_mensajes_direccion_check CHECK (direccion IN ('entrante', 'saliente'))
);
CREATE INDEX IF NOT EXISTS idx_wa_mensajes_contacto ON public.wa_mensajes (contacto_id, creado_en);

-- 4) Intenciones por oferta (Aplicar + Autorizar contacto). Sin oportunidad si la conversión está apagada.
CREATE TABLE IF NOT EXISTS public.wa_intenciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contacto_id uuid NOT NULL REFERENCES public.wa_contactos(id) ON DELETE CASCADE,
  oferta_id uuid NOT NULL REFERENCES public.ofertas_academicas(id),
  oferta_nombre text,
  paso text NOT NULL,
  nombre_completo text,
  correo text,
  consentimientos jsonb NOT NULL DEFAULT '[]'::jsonb,
  oportunidad_id uuid REFERENCES public.oportunidades(id),
  persona_id uuid REFERENCES public.personas(id),
  motivo text,
  revisado_por uuid,
  revisado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wa_intenciones_paso_check CHECK (
    paso IN ('consentimiento_registrado', 'lead_creado', 'rechazada', 'error_conversion')
  )
);
CREATE INDEX IF NOT EXISTS idx_wa_intenciones_contacto ON public.wa_intenciones (contacto_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_wa_intenciones_pendientes ON public.wa_intenciones (paso) WHERE paso = 'consentimiento_registrado';

-- 5) Escalamientos a asesor humano (comando ASESOR).
CREATE TABLE IF NOT EXISTS public.wa_escalamientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contacto_id uuid NOT NULL REFERENCES public.wa_contactos(id) ON DELETE CASCADE,
  en_horario boolean NOT NULL,
  atendido_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_escalamientos_abiertos ON public.wa_escalamientos (creado_en) WHERE atendido_en IS NULL;

-- 6) RLS: activo y sin políticas → solo service_role.
ALTER TABLE public.wa_contactos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_mensajes_procesados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_intenciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_escalamientos ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.wa_contactos IS 'BA-032: contacto WhatsApp (Meta). Antes del consentimiento solo número.';
COMMENT ON TABLE public.wa_mensajes_procesados IS 'BA-032: idempotencia de webhooks por wamid.';
COMMENT ON TABLE public.wa_mensajes IS 'BA-032: historial del canal, solo con consentimiento de datos.';
COMMENT ON TABLE public.wa_intenciones IS 'BA-032: Aplicar + Autorizar contacto por oferta. consentimiento_registrado = sin conversión (interruptor apagado).';
COMMENT ON TABLE public.wa_escalamientos IS 'BA-032: pedidos de ASESOR.';

COMMIT;

-- VERIFY (no se ejecuta con la migración):
-- SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'wa_%';
