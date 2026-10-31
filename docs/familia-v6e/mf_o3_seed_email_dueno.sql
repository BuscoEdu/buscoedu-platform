-- Seed email dueño familia #1 (beman27) · Backend BuscoEdu
-- Idempotente. No envía correo. No llama Supabase Auth.
-- Auth/confirmación: pendiente con aviso previo al Orquestador.

ALTER TABLE public.familia_familias
  ADD COLUMN IF NOT EXISTS admin_email text,
  ADD COLUMN IF NOT EXISTS email_dueno_activo boolean NOT NULL DEFAULT false;

UPDATE public.familia_familias
   SET admin_email = 'jhon.bejarano@gmail.com',
       email_dueno_activo = true,
       actualizado_en = now()
 WHERE id = 1 AND lower(nickname) = 'beman27';
