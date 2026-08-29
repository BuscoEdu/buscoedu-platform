# Fase 6 — QA, operación y control de versiones

## Estado
Completada en lo verificable sin credenciales: el proyecto **compila** y no
rompe los módulos existentes. La verificación contra base de datos real
(migraciones, RLS, E2E) queda documentada como pendiente de credenciales.

## Qué reutilicé
- Pipeline de build de Next.js del propio repo (`next build`).
- Documentación y convenciones existentes para el estilo de los `.md`.

## Qué extendí y por qué
- Documentación de operación: `README.md`, `PRODUCTION_VERIFICATION.md`,
  `MIGRATION_TO_REAL_OTP.md`, `DATA_MODEL_MAPPING.md`. Se añadieron para que el
  equipo pueda aplicar migraciones, configurar entorno y verificar el sistema.

## Pruebas ejecutadas
- ✅ `npm run build` → "Compiled successfully"; todas las rutas del Lead Center
  se generan como dinámicas (server-rendered on demand), sin errores de tipos.
- ✅ Revisión de `git status`: no se modificó ningún módulo protegido
  (landing, explorador salvo el cableado del botón Aplicar, NaIA, admin).
- ✅ Validación de nombres de columnas contra el diccionario de datos y el
  código existente; correcciones aplicadas (ver `DATA_MODEL_MAPPING.md`).

## Pruebas NO ejecutadas (requieren credenciales de Supabase)
- Aplicación de migraciones y verificación de seeds.
- Comportamiento de RLS por rol.
- Flujos E2E: OTP, conversión idempotente, acciones del CRM, cron.

Ver el checklist de aceptación en `PRODUCTION_VERIFICATION.md`.

## Resultados
- Base de código lista para desplegar y verificar con credenciales.
- Documentación de operación completa.
- Historial de git con un commit descriptivo del módulo.

## Riesgos
- Cualquier desviación entre el esquema documentado y la BD real requeriría
  ajustar consultas puntuales; se mitigó validando las tablas de mayor riesgo.
- Sin un entorno con credenciales no es posible garantizar el comportamiento
  runtime; el checklist de aceptación cubre esa verificación.

## Decisión final
Entrega del módulo Lead Center completo a nivel de código, migraciones y
documentación. Pendiente exclusivamente la verificación con credenciales reales
y la conexión de proveedores externos (OTP real, scheduler del cron).
