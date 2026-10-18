-- Cuentas QA BuscoEdu (2026-10-18). OK de Jhon vía Orquestador.
-- Reemplazar <HASH_BCRYPT_SUPERADMIN>/<HASH_BCRYPT_ASESOR> por hashes bcrypt ($2b$, cost 10) generados localmente.
-- NUNCA poner claves en claro ni usar crypt() aquí.
begin;

-- Bloque 1: usuarios en auth.users (patrón copiado del usuario existente que ya inició sesión)
with nuevos(email, hash, nombre) as (values
  ('qa-superadmin@qa.buscoedu.test', '<HASH_BCRYPT_SUPERADMIN>', 'superadmin'),
  ('qa-asesor@qa.buscoedu.test',     '<HASH_BCRYPT_ASESOR>',     'asesor'))
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', email, hash, now(),
  '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('qa', true, 'qa_rol', nombre), now(), now(),
  '', '', '', '', '', '', '', '', false, false
from nuevos;

-- Bloque 2: identidades provider 'email'
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
  'email', now(), now(), null
from auth.users u where u.email in ('qa-superadmin@qa.buscoedu.test','qa-asesor@qa.buscoedu.test');

-- Bloque 3: perfiles internos (no hay columna de marca QA: se usa nombres='QA' y cargo='QA · cuenta de prueba')
insert into public.usuarios_internos (auth_user_id, rol_id, nombres, apellidos, correo, cargo, activo)
select u.id, r.id, 'QA', case r.codigo when 'super_admin' then 'QA · Superadmin' else 'QA · Asesor' end,
  u.email, 'QA · cuenta de prueba (no real)', true
from auth.users u
join public.roles r on r.codigo = case u.email when 'qa-superadmin@qa.buscoedu.test' then 'super_admin' else 'asesor' end
where u.email in ('qa-superadmin@qa.buscoedu.test','qa-asesor@qa.buscoedu.test');

commit;
