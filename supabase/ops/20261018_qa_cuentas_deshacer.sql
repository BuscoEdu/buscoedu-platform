-- Deshacer cuentas QA (2026-10-18): desactivación, SIN DELETE físico.
begin;
-- Perfil interno inactivo: session.ts filtra activo=true, pierde acceso al panel
update public.usuarios_internos set activo = false, actualizado_en = now()
where correo in ('qa-superadmin@qa.buscoedu.test','qa-asesor@qa.buscoedu.test');
-- Bloqueo de login en GoTrue
update auth.users set banned_until = 'infinity', updated_at = now()
where email in ('qa-superadmin@qa.buscoedu.test','qa-asesor@qa.buscoedu.test');
commit;
