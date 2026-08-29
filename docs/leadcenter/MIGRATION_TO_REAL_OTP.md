# Migración a OTP real (Twilio / WhatsApp)

El OTP está detrás de una interfaz conmutable. Hoy funciona en modo **simulado**
(hash real, caducidad, intentos y rate limiting reales; sólo el "envío" es
simulado y el código demo se devuelve para pruebas). Pasar a un proveedor real
no requiere cambiar la lógica de negocio ni la base de datos.

## Arquitectura
- `src/lib/otp/OtpProvider.ts` — interfaz común (`solicitar`, `verificar`).
- `src/lib/otp/SimulatedOtpProvider.ts` — implementación actual.
- `src/lib/otp/TwilioOtpProvider.ts` — stub listo para completar.
- `src/lib/otp/WhatsAppOtpProvider.ts` — stub listo para completar.
- `src/lib/otp/index.ts` — `getOtpProvider()` elige según `OTP_PROVIDER`.
- Tabla `desafios_otp` — almacena `codigo_hash` (bcrypt), estado, propósito,
  intentos, `max_intentos` y `expira_en`. **No cambia** al migrar de proveedor.
- Tabla `comunicaciones_transaccionales` — registra la intención de envío con
  estado `pendiente`. En modo real, el proveedor la marcará `enviada`/`fallida`.

## Pasos para activar Twilio (SMS)
1. Instalar el SDK: `npm i twilio`.
2. Definir env: `OTP_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_FROM` (o Verify Service SID si se usa Twilio Verify).
3. Completar `TwilioOtpProvider.ts`:
   - En `solicitar`: generar código, guardar `codigo_hash` en `desafios_otp`
     (reutilizar el mismo helper del simulado) y enviar el SMS con Twilio.
   - Registrar el envío en `comunicaciones_transaccionales` con el estado real.
   - En `verificar`: comparar el hash y aplicar la misma lógica de intentos y
     caducidad (idéntica a la del simulado).
4. Dejar de devolver `codigoDemo` (sólo existe en modo simulado).

## Pasos para activar WhatsApp
Igual que Twilio, usando la API de WhatsApp Business (o Twilio WhatsApp).
Definir `OTP_PROVIDER=whatsapp` y las credenciales del proveedor.

## Reglas que se conservan intactas
- Caducidad, número máximo de intentos y rate limiting viven en la BD y en la
  lógica compartida; no dependen del proveedor.
- La verificación de celular previa a la conversión (`desafios_otp` verificado en
  los últimos 15 minutos) no cambia.
- Nunca se registran envíos reales como completados en modo simulado.
