-- =============================================================================
-- PROPUESTA 2026-10-19 · NO APLICADA · wa_contactos con BSUID (nombres de usuario de WhatsApp)
-- Autor: Backend BuscoEdu (bot), pedido del Orquestador.
--
-- Qué: permitir contactos de WhatsApp que solo traen business-scoped user id (BSUID),
-- p. ej. 'CO.13491208655302741918', sin número de teléfono.
-- Por qué: Meta puede omitir `from` / `contacts[].wa_id` cuando el usuario adoptó un
-- nombre de usuario (doc: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids).
-- Hoy `wa_contactos.celular_e164` es NOT NULL con CHECK E.164, así que el código NO guarda
-- a esos remitentes: solo les pide el número (request_contact_info) y no deja historial.
--
-- Antes de aplicar: decisión de Producto/Legal (el BSUID es dato personal: Ley 1581),
-- revisar fn_ba031_convertir_si_consentido (exige celular para crear la persona) y
-- adaptar almacen-supabase.ts (buscar por celular O por wa_user_id).
-- =============================================================================

BEGIN;

ALTER TABLE public.wa_contactos ADD COLUMN IF NOT EXISTS wa_user_id text;

ALTER TABLE public.wa_contactos ALTER COLUMN celular_e164 DROP NOT NULL;

-- Formato documentado: ISO 3166 alfa-2 + '.' (+ 'ENT.' si es BSUID principal) + hasta 128 alfanuméricos.
ALTER TABLE public.wa_contactos
  ADD CONSTRAINT wa_contactos_user_id_check
  CHECK (wa_user_id IS NULL OR wa_user_id ~ '^[A-Z]{2}(\.ENT)?\.[A-Za-z0-9]{1,128}$');

-- Al menos una identidad.
ALTER TABLE public.wa_contactos
  ADD CONSTRAINT wa_contactos_identidad_check
  CHECK (celular_e164 IS NOT NULL OR wa_user_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_contactos_user_id
  ON public.wa_contactos (wa_user_id) WHERE wa_user_id IS NOT NULL;

COMMIT;

-- -----------------------------------------------------------------------------
-- DESHACER (solo si no hay filas sin celular):
-- BEGIN;
-- DROP INDEX IF EXISTS public.idx_wa_contactos_user_id;
-- ALTER TABLE public.wa_contactos DROP CONSTRAINT IF EXISTS wa_contactos_identidad_check;
-- ALTER TABLE public.wa_contactos DROP CONSTRAINT IF EXISTS wa_contactos_user_id_check;
-- ALTER TABLE public.wa_contactos ALTER COLUMN celular_e164 SET NOT NULL;
-- ALTER TABLE public.wa_contactos DROP COLUMN IF EXISTS wa_user_id;
-- COMMIT;
