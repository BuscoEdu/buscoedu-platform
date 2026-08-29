# Verificación para producción — Lead Center

Este documento lista lo necesario para poner el Lead Center en producción y el
estado real de verificación en este entorno.

## Estado de verificación en este entorno
- ✅ **Compila**: `npm run build` termina con "Compiled successfully" y todas las
  rutas del Lead Center aparejan como dinámicas.
- ✅ **No toca módulos protegidos**: landing (`app/page.tsx`), explorador
  (`app/explorar/`), NaIA (`app/api/naia/route.ts`, `src/lib/naia-real.ts`) y
  admin (`app/admin/`) no fueron modificados. El único cambio en el explorador
  es cablear el botón "Aplicar" en `components/explorar/OfferDetailModal.tsx`.
- ⚠️ **No ejecutado contra BD**: el entorno no tiene credenciales de Supabase,
  por lo que **no** se aplicaron migraciones, ni se probaron RPC/RLS ni flujos
  E2E. Todo eso queda "preparado, no ejecutado".

## Variables de entorno requeridas
Definir en `.env.local` (desarrollo) y en el panel del hosting (producción):

| Variable | Uso | Público |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase | Sí (cliente) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave anónima | Sí (cliente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Operaciones de servidor (conversión, cron) | **No** |
| `OTP_PROVIDER` | `simulated` (def.), `twilio` o `whatsapp` | No |
| `CRON_SECRET` | Protege `/api/cron/automatizaciones` | **No** |

> Ninguna de estas claves está en el código. `SUPABASE_SERVICE_ROLE_KEY` y
> `CRON_SECRET` no llevan prefijo `NEXT_PUBLIC_` y nunca se exponen al cliente.

## Pasos de puesta en marcha
1. **Configurar env** (tabla anterior).
2. **Aplicar migraciones** en orden (carpeta `supabase/migrations/`), de
   `20260829120000` a `20260829120700`. Todas son idempotentes/condicionales.
3. **Verificar seeds**: rol `asesor`, 4 tipos de consentimiento, etapas y
   subestados del embudo, y una regla de estancamiento.
4. **Crear un usuario asesor**: alta en `auth.users` + fila en `usuarios_internos`
   con `rol_id` = asesor y `auth_user_id` enlazado.
5. **Probar OTP** en `/explorar` → aplicar a una oferta → verificar celular
   (código demo visible sólo en modo simulado) → otorgar consentimientos.
6. **Probar conversión**: confirmar que se crea persona + oportunidad +
   aplicación + propuesta; para ofertas `por_lead`, confirmar que **no** hay
   transferencia si falta el consentimiento de transferencia.
7. **Probar workspace**: login en `/leadcenter`, ver dashboard, abrir una
   oportunidad, registrar contacto, cambiar etapa, usar el copiloto.
8. **Programar el cron**: llamar `POST /api/cron/automatizaciones` con
   `Authorization: Bearer $CRON_SECRET` de forma periódica.

## Checklist de aceptación (a ejecutar con credenciales)
- [ ] Migraciones aplicadas sin error.
- [ ] RLS: un asesor sólo ve sus oportunidades; super_admin ve todo.
- [ ] OTP: caducidad, máximo de intentos y rate limit efectivos.
- [ ] Conversión idempotente (misma `clave_idempotencia` no duplica).
- [ ] `por_lead` sin consentimiento → sin transferencia.
- [ ] Cron idempotente (no duplica tareas de estancamiento).
