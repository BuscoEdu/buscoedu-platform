-- ============================================================
-- Fix mínimo propuesto por Base de datos BuscoEdu (2026-10-19)
-- Para: Backend BuscoEdu · revisión de ops/20261019_wa_contactos_user_id_propuesta.sql
-- Estado: SIN APLICAR. Solo propuesta para integrar en la rama feat/wa-user-id-fallback.
-- Reemplaza la versión inicial de Backend (índice parcial, sin guardas, deshacer inseguro).
-- Hoy NO hace falta para que el bot responda: el código no guarda contactos sin teléfono
-- (pide el número con request_contact_info y vincula el BSUID en sesion.waUserId).
-- Solo haría falta para guardar remitentes solo-BSUID. Aun así la conversión a lead sigue
-- exigiendo celular (fn_ba031_convertir_si_consentido / fn_convertir_aplicacion → celular_requerido).
-- ============================================================

-- 0) RESPALDO PREVIO (correr antes y guardar en ops/respaldos/20261019_wa_user_id/)
-- SELECT count(*) total, count(*) FILTER (WHERE celular_e164 IS NULL) sin_celular FROM public.wa_contactos;
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.wa_contactos'::regclass;
-- SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='wa_contactos';

BEGIN;
-- 1) Columna BSUID (aditiva, idempotente)
ALTER TABLE public.wa_contactos ADD COLUMN IF NOT EXISTS wa_user_id text;

-- 2) El teléfono pasa a ser opcional (el CHECK E.164 existente deja pasar NULL)
ALTER TABLE public.wa_contactos ALTER COLUMN celular_e164 DROP NOT NULL;

-- 3) Restricciones con guarda para que el script se pueda repetir
DO $$
BEGIN
  -- 3a) Formato BSUID documentado por Meta (CC. / CC.ENT. + alfanumérico)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.wa_contactos'::regclass AND conname='wa_contactos_user_id_check') THEN
    ALTER TABLE public.wa_contactos ADD CONSTRAINT wa_contactos_user_id_check
      CHECK (wa_user_id IS NULL OR wa_user_id ~ '^[A-Z]{2}(\.ENT)?\.[A-Za-z0-9]{1,128}$');
  END IF;
  -- 3b) Al menos una identidad: teléfono o BSUID
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.wa_contactos'::regclass AND conname='wa_contactos_identidad_check') THEN
    ALTER TABLE public.wa_contactos ADD CONSTRAINT wa_contactos_identidad_check
      CHECK (celular_e164 IS NOT NULL OR wa_user_id IS NOT NULL);
  END IF;
  -- 3c) Unicidad COMPLETA (no parcial) para que funcione upsert onConflict:'wa_user_id' de supabase-js
  --     (con índice parcial da 42P10). Los NULL siguen siendo distintos.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.wa_contactos'::regclass AND conname='wa_contactos_wa_user_id_key') THEN
    ALTER TABLE public.wa_contactos ADD CONSTRAINT wa_contactos_wa_user_id_key UNIQUE (wa_user_id);
  END IF;
END $$;

-- 4) Documentación de la columna
COMMENT ON COLUMN public.wa_contactos.wa_user_id IS 'BSUID de Meta (dato personal, Ley 1581). Identidad alterna cuando no llega el teléfono.';
COMMIT;

-- ============================================================
-- DESHACER (seguro: no borra filas ni BSUID)
-- ============================================================
-- BEGIN;
-- -- a) Bloquea si ya hay contactos solo con BSUID (sin DELETE: wa_mensajes/intenciones/escalamientos tienen CASCADE)
-- DO $$ DECLARE n int; BEGIN
--   SELECT count(*) INTO n FROM public.wa_contactos WHERE celular_e164 IS NULL;
--   IF n > 0 THEN RAISE EXCEPTION 'deshacer_bloqueado: % contactos solo con BSUID; respaldar y decidir', n; END IF;
-- END $$;
-- -- b) Quita restricciones e índice (incluye el índice parcial de la versión BE, por si se aplicó)
-- ALTER TABLE public.wa_contactos DROP CONSTRAINT IF EXISTS wa_contactos_wa_user_id_key;
-- DROP INDEX IF EXISTS public.idx_wa_contactos_user_id;
-- ALTER TABLE public.wa_contactos DROP CONSTRAINT IF EXISTS wa_contactos_identidad_check;
-- ALTER TABLE public.wa_contactos DROP CONSTRAINT IF EXISTS wa_contactos_user_id_check;
-- -- c) Restaura NOT NULL del teléfono
-- ALTER TABLE public.wa_contactos ALTER COLUMN celular_e164 SET NOT NULL;
-- -- d) wa_user_id NO se borra: queda inerte para no perder BSUID de contactos con teléfono
-- COMMIT;
