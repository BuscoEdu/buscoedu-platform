-- ============================================
-- BUSCOEDU · CREACIÓN DE USUARIO SUPER ADMIN
-- ============================================
-- Email objetivo: admin@buscoedu.com
--
-- Paso 1 (manual en Supabase Auth UI):
--   1) Ir a Authentication > Users
--   2) Crear usuario con email: admin@buscoedu.com
--   3) Definir contraseña segura y confirmar usuario
--
-- Paso 2 (SQL):
--   Ejecutar este script en SQL Editor para vincular el usuario
--   con la tabla public.usuarios_internos y rol super_admin.

begin;

-- Inserta o actualiza el registro interno del super administrador
insert into public.usuarios_internos (
  auth_user_id,
  rol_id,
  nombres,
  apellidos,
  correo,
  cargo,
  activo,
  ultimo_acceso_en
)
select
  au.id as auth_user_id,
  r.id as rol_id,
  'Super' as nombres,
  'Admin' as apellidos,
  'admin@buscoedu.com' as correo,
  'Super Administrador' as cargo,
  true as activo,
  now() as ultimo_acceso_en
from auth.users au
inner join public.roles r on r.codigo = 'super_admin'
where lower(au.email) = lower('admin@buscoedu.com')
on conflict (correo)
do update set
  auth_user_id = excluded.auth_user_id,
  rol_id = excluded.rol_id,
  nombres = excluded.nombres,
  apellidos = excluded.apellidos,
  cargo = excluded.cargo,
  activo = true,
  actualizado_en = now();

-- Verificación rápida
-- Debe retornar 1 fila activa con rol super_admin.
select
  ui.id,
  ui.correo,
  ui.activo,
  r.codigo as rol_codigo,
  r.nombre as rol_nombre
from public.usuarios_internos ui
left join public.roles r on r.id = ui.rol_id
where lower(ui.correo) = lower('admin@buscoedu.com');

commit;
