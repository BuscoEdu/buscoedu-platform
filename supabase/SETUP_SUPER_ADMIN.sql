-- =========================================
-- INSTRUCCIONES PARA CREAR SUPER ADMIN
-- =========================================
-- Email: admin@buscoedu.com
--
-- PASO 1: Crear usuario en Supabase Auth UI
-- 1. Ir a: https://supabase.com/dashboard/project/[tu-proyecto]/auth/users
-- 2. Click en "Add user" → "Create new user"
-- 3. Email: admin@buscoedu.com
-- 4. Password: [ELIGE UNA CONTRASEÑA SEGURA]
-- 5. Marcar "Auto Confirm User" (opcional)
-- 6. Click "Create user"
-- 7. COPIAR el UUID del usuario creado
--
-- PASO 2: Vincular usuario con rol super_admin
-- Ejecutar el siguiente SQL en el SQL Editor de Supabase:
-- (Reemplazar <USER_UUID> con el UUID del paso 1)

INSERT INTO usuarios_internos (
  auth_user_id,
  rol_id,
  nombres,
  apellidos,
  correo,
  cargo,
  activo
) VALUES (
  '<USER_UUID>',  -- Reemplazar con UUID real
  (SELECT id FROM roles WHERE codigo = 'super_admin'),
  'Administrador',
  'BuscoEdu',
  'admin@buscoedu.com',
  'Super Administrador',
  true
);

-- Verificar que se creó correctamente:
SELECT 
  ui.nombres,
  ui.apellidos,
  ui.correo,
  r.nombre as rol
FROM usuarios_internos ui
JOIN roles r ON ui.rol_id = r.id
WHERE ui.correo = 'admin@buscoedu.com';
