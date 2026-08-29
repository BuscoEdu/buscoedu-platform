# Panel de Administración BuscoEdu

## 1. Descripción General
El panel de administración de BuscoEdu centraliza la operación de contenidos académicos y comerciales del ecosistema. Permite gestionar universidades, sedes, programas, ofertas y configuraciones relacionadas con periodos, beneficios y precios desde una interfaz interna segura.

**Quién puede acceder:**
- Usuarios autenticados en Supabase Auth.
- Usuarios internos con rol activo `super_admin` en la tabla `usuarios_internos`.

## 2. Requisitos Previos
Antes de usar el panel admin, validar:

1. **Migraciones ejecutadas**
   - Deben estar aplicadas las 11 migraciones del módulo admin (ver sección 6).
2. **Usuario super_admin creado**
   - Crear `admin@buscoedu.com` y vincularlo en `usuarios_internos` con rol `super_admin`.
   - Script de apoyo: `supabase/SETUP_SUPER_ADMIN.sql`.
3. **Variables de entorno configuradas**
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 3. Acceso al Panel
- **URL de producción:** https://www.buscoedu.com/admin
- **Pantalla de login:** https://www.buscoedu.com/admin/login
- **Cuenta inicial sugerida:** `admin@buscoedu.com`

> Nota: la contraseña se define al crear el usuario en Supabase Auth.

## 4. Módulos Disponibles
1. **Dashboard**
   - Resumen de métricas y estado general de operación.
2. **Universidades**
   - CRUD lógico de instituciones aliadas.
3. **Sedes**
   - Gestión de campus/sedes por universidad.
4. **Programas**
   - Administración de programas académicos asociados a sedes.
5. **Ofertas**
   - Gestión de ofertas académicas y su publicación.
6. **Beneficios**
   - Configuración de becas, descuentos y condiciones comerciales.
7. **Precios**
   - Versionamiento de precios por oferta (sin sobreescribir histórico).
8. **Periodos**
   - Gestión de periodos académicos y comerciales.

## 5. Reglas de Negocio Críticas
- **Precios NO se editan directamente**
  - Si cambia un valor, se crea un nuevo registro/versionado en `precios_oferta`.
- **NO hay eliminación física**
  - Se usa desactivación lógica (`activo = false`) cuando aplica.
- **Slugs autogenerados pero editables**
  - Se generan por defecto desde el nombre/título, pero pueden ajustarse manualmente.

## 6. Ejecutar Migraciones
Aplicar en Supabase (SQL Editor o CLI) las 11 migraciones nuevas del panel admin, en orden:

1. `20260129000100_create_roles.sql`
2. `20260129000200_create_usuarios_internos.sql`
3. `20260129000300_create_jornadas.sql`
4. `20260129000400_create_tipos_beneficio.sql`
5. `20260129000500_create_periodos_academicos.sql`
6. `20260129000600_create_periodos_comerciales.sql`
7. `20260129000700_create_precios_oferta.sql`
8. `20260129000800_create_beneficios_oferta.sql`
9. `20260129000900_create_imagenes_universidad.sql`
10. `20260129001000_create_usuarios_universidad.sql`
11. `20260129001100_create_admin_rls_policies.sql`

### Opción SQL Editor
- Abrir cada archivo desde `supabase/migrations/`.
- Ejecutar en secuencia.
- Verificar sin errores antes de continuar.

### Opción Supabase CLI (si está configurado)
- Ejecutar el pipeline de migraciones del proyecto y confirmar estado final sin pendientes.

## 7. Troubleshooting
### Error: "No tienes acceso"
- Verificar que el usuario exista en `usuarios_internos`.
- Verificar que `rol_id` apunte a `roles.codigo = 'super_admin'`.
- Verificar que `usuarios_internos.activo = true`.

### No carga datos
- Revisar que las RLS policies del admin estén creadas y activas.
- Validar sesión activa en Supabase Auth.
- Confirmar variables de entorno de Supabase.

### Error 404 en rutas `/admin/*`
- Confirmar que Next.js compiló correctamente (`npm run build`).
- Revisar que el deploy incluyó rutas del App Router.
- Verificar que el middleware y rutas `/admin` estén en la rama desplegada.
