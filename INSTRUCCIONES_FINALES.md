# 🎯 INSTRUCCIONES FINALES - Panel de Administración BuscoEdu

## ✅ Estado Actual

- ✅ Código publicado en GitHub
- ✅ Despliegue en producción: **www.buscoedu.com**
- ✅ Ruta del panel: **www.buscoedu.com/admin/login**
- ⏳ **PENDIENTE**: Ejecutar migraciones de base de datos
- ⏳ **PENDIENTE**: Crear usuario super_admin

---

## 📝 PASO 1: Ejecutar Migraciones en Supabase

### Opción A: Ejecutar archivo consolidado (MÁS FÁCIL)

1. **Abre el archivo** `EJECUTAR_EN_SUPABASE.sql` que está en la raíz del repositorio
2. **Copia TODO el contenido** del archivo
3. **Ve a Supabase Dashboard**:
   - Abre: https://supabase.com/dashboard
   - Selecciona tu proyecto de BuscoEdu
   - Ve a **SQL Editor** (en el menú izquierdo)
4. **Pega el SQL** en el editor
5. **Click en "RUN"** (botón verde)
6. **Espera** a que termine (puede tardar 10-20 segundos)
7. **Verifica** que no haya errores en rojo

### Opción B: Ejecutar migraciones individuales

Si prefieres ejecutar una por una, ve a la carpeta `supabase/migrations/` y ejecuta los archivos en este orden:

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

---

## 👤 PASO 2: Crear Usuario Super Admin

### 2.1. Crear usuario en Supabase Auth

1. **Ve a Supabase Dashboard** → Tu proyecto
2. **Authentication** (menú izquierdo)
3. **Users** (pestaña superior)
4. **Click en "Add user"** → **"Create new user"**
5. **Rellena**:
   - Email: `admin@buscoedu.com`
   - Password: **[ELIGE UNA CONTRASEÑA SEGURA]** (guárdala bien)
   - ✅ Marca: **"Auto Confirm User"**
6. **Click en "Create user"**
7. **IMPORTANTE**: **COPIA el UUID del usuario** que aparece en la primera columna (algo como: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

### 2.2. Vincular usuario con rol super_admin

1. **Ve a SQL Editor** en Supabase
2. **Ejecuta este SQL** (reemplaza `<USER_UUID>` con el UUID que copiaste):

```sql
INSERT INTO public.usuarios_internos (
  auth_user_id,
  rol_id,
  nombres,
  apellidos,
  correo,
  cargo,
  activo
) VALUES (
  '<USER_UUID>',  -- 👈 REEMPLAZAR CON EL UUID REAL
  (SELECT id FROM public.roles WHERE codigo = 'super_admin'),
  'Administrador',
  'BuscoEdu',
  'admin@buscoedu.com',
  'Super Administrador',
  true
);
```

3. **Verifica** que se creó correctamente ejecutando:

```sql
SELECT 
  ui.nombres,
  ui.apellidos,
  ui.correo,
  r.nombre as rol,
  ui.activo
FROM public.usuarios_internos ui
JOIN public.roles r ON ui.rol_id = r.id
WHERE ui.correo = 'admin@buscoedu.com';
```

Deberías ver algo como:
```
nombres       | apellidos | correo                | rol                  | activo
--------------|-----------|----------------------|----------------------|-------
Administrador | BuscoEdu  | admin@buscoedu.com   | Super Administrador  | true
```

---

## 🚀 PASO 3: Acceder al Panel

1. **Abre en tu navegador**: https://www.buscoedu.com/admin/login
2. **Ingresa**:
   - Email: `admin@buscoedu.com`
   - Password: [la contraseña que creaste en el paso 2.1]
3. **Click en "Iniciar Sesión"**
4. **¡Listo!** Deberías ver el Dashboard del panel de administración

---

## 📊 Módulos Disponibles

Una vez dentro del panel, verás estos módulos en el sidebar:

1. **Dashboard** - Métricas generales
2. **Universidades** - Gestión de instituciones
3. **Sedes** - Gestión de campus
4. **Programas** - Gestión de programas académicos
5. **Ofertas** - Gestión de ofertas comerciales
6. **Beneficios** - Gestión de becas y descuentos
7. **Precios** - Gestión versionada de precios (NO se editan, solo se crean nuevos)
8. **Periodos** - Periodos académicos y comerciales
9. **Catálogos** - Jornadas, tipos de beneficio, roles

---

## 🔧 Troubleshooting

### ❌ Error: "No tienes acceso al panel de administración"
- **Causa**: El usuario no tiene el rol `super_admin`
- **Solución**: Verifica el PASO 2.2 y asegúrate de haber vinculado correctamente el usuario

### ❌ Error: "Invalid login credentials"
- **Causa**: Email o contraseña incorrectos
- **Solución**: Verifica el email y contraseña. Puedes resetear la contraseña desde Supabase Auth UI

### ❌ El panel no carga datos
- **Causa**: Las migraciones no se ejecutaron o las políticas RLS no están activas
- **Solución**: Ejecuta nuevamente el PASO 1

### ❌ Error 404 en /admin/login
- **Causa**: El deployment no completó correctamente
- **Solución**: Espera 2-3 minutos y recarga. Vercel puede tardar en propagar los cambios.

---

## 📋 Reglas de Negocio Críticas

### ⚠️ PRECIOS
- **NUNCA** se editan precios existentes
- Siempre se crea un **nuevo precio**
- El precio anterior queda como **inactivo** automáticamente
- Se mantiene historial completo de cambios

### ⚠️ ELIMINACIÓN
- **NO hay eliminación física** de registros
- Solo se desactivan usando el toggle **"Activo"**

### ⚠️ SLUGS
- Se autogeneran desde el nombre
- Se pueden editar manualmente
- Deben ser únicos

---

## 📞 Soporte

Si tienes problemas, verifica:
1. ✅ Migraciones ejecutadas sin errores
2. ✅ Usuario super_admin creado y vinculado
3. ✅ Panel accesible en www.buscoedu.com/admin/login
4. ✅ Login funcional con las credenciales correctas

---

**¡Panel de Administración listo para usar! 🎉**
