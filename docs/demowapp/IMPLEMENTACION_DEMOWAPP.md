# Implementación Demo WApp + NaIA (BuscoEdu)

## 1\. Alcance implementado

Se implementó un sistema de simulación de conversación tipo WhatsApp para BuscoEdu con dos superficies:

1. **Consola privada** en `/demoWapp` para `super_admin`.

2. **Modal público temporal** para estudiante posterior a conversión exitosa, usando token firmado de corta vida.

No se creó integración nueva con [Abacus.AI](http://Abacus.AI): se reutiliza la misma configuración (`ABACUS_NAIA_DEPLOYMENT_ID` y `ABACUS_NAIA_DEPLOYMENT_TOKEN`) en servidor.

---

## 2\. Arquitectura

## 2.1 UI

* `app/demoWapp/page.tsx`: consola privada Demo WApp.

* `components/demowapp/SessionList.tsx`: listado de sesiones por aplicación/oportunidad.

* `components/demowapp/DemoWappPanel.tsx`: panel chat estilo WApp (burbujas, input, Enter).

* `components/demowapp/ContextPanel.tsx`: panel lateral con contexto CRM.

* `components/demowapp/DemoWappModal.tsx`: modal estudiante (NaIA · BuscoEdu).

## 2.2 APIs

* `GET /api/demowapp/sesiones`: lista sesiones reales.

* `GET /api/demowapp/sesiones/[oportunidadId]`: detalle completo + mensajes.

* `POST /api/demowapp/sesiones/[oportunidadId]/mensaje`: simulación de mensaje entrante.

* `POST /api/demowapp/push/procesar`: procesador idempotente de pushes vencidos.

* `GET/POST /api/demowapp/estudiante/[token]`: canal público temporal con token firmado.

## 2.3 Servicios

* `src/lib/demowapp/conversacion-service.ts`

* `src/lib/demowapp/mensaje-service.ts`

* `src/lib/demowapp/push-service.ts`

* `src/lib/demowapp/token-service.ts`

* `src/lib/demowapp/push-catalog.ts`

---

## 3\. Flujos principales

## 3.1 Conversión exitosa → bienvenida + token modal

En `POST /api/leadcenter/convertir`:

1. Se ejecuta RPC `fn_convertir_aplicacion`.

2. Si `ok`, se programa push `bienvenida_aplicacion_exitosa` (`+5s`) con idempotencia por `aplicacion_id`.

3. Se genera token temporal firmado para modal público (`demowapp.token`).

4. Si falla programación, **no se revierte la aplicación** (error no bloqueante, respuesta `ok`).

## 3.2 Modal estudiante

1. `OfferDetailModal` captura `resultado.demowapp.token` en `onConvertido`.

2. Abre `DemoWappModal` automáticamente a los 5s.

3. `GET /api/demowapp/estudiante/[token]` valida token + titularidad (persona/oportunidad/aplicación).

4. `POST /api/demowapp/estudiante/[token]` guarda mensaje inbound, llama NaIA, guarda respuesta, programa silencio.

## 3.3 Flujo “estudiante escribe primero”

En `processInboundStudentMessage`:

1. Obtiene/crea conversación activa por oportunidad (`demo_wapp`).

2. Guarda mensaje inbound en `mensajes_conversacion` con `clientMessageId` idempotente (`referencia_externa`).

3. Cancela pushes pendientes de silencio.

4. Construye contexto y llama NaIA en servidor (Abacus API).

5. Guarda respuesta NaIA en `mensajes_conversacion`.

6. Actualiza `resumen/contexto_resumido/actividad` de conversación.

7. Registra trazabilidad en `eventos_negocio` + `notas_crm` sin duplicar por marcador idempotente.

8. Si NaIA espera respuesta, programa recordatorio a 3 minutos.

## 3.4 Pushes automáticos

* **Bienvenida**: `bienvenida_aplicacion_exitosa` (+5s).

* **Recordatorio**: `recordatorio_silencio_3_min` (+3 min).

* **Cierre**: `cierre_inactividad_5_min` (+2 min tras recordatorio).

Procesamiento en `processDuePushes`:

* toma `comunicaciones_transaccionales` vencidas,

* inserta mensaje saliente idempotente en `mensajes_conversacion`,

* marca comunicación enviada,

* registra evento/nota,

* en cierre, marca conversación `cerrada` y `cierre_en`.

El modal del estudiante y la sesión privada consultan su propia oportunidad cada cinco segundos. El procesador global queda reservado para `super_admin` o un cron futuro.

---

## 4\. Seguridad

1. **Ruta privada** `/demoWapp`: protegida en `middleware.ts` para `super_admin`.

2. **APIs privadas** `/api/demowapp/*`: validan sesión y rol servidor (`getSesionLeadCenter`).

3. **Canal público estudiante**: token firmado HMAC, TTL corto y cookie `HttpOnly` vinculada al navegador que completó la aplicación. Se valida la coincidencia de persona, oportunidad, aplicación y nonce.

4. **Escrituras sensibles**: solo servidor (`getServerSupabase` o `getServiceRoleClient`).

5. **Secreto dedicado**: configurar `DEMOWAPP_TOKEN_SECRET`. No se reutilizan secretos de Supabase ni de Abacás para firmar sesiones de estudiantes.

---

## 5\. Idempotencia

1. Mensajes inbound por `clientMessageId` → `referencia_externa`.

2. Push bienvenida por `demowapp:bienvenida:{aplicacionId}`, almacenada en `comunicaciones_transaccionales.metadatos.idempotency_key`.

3. Recordatorio por `demowapp:recordatorio:{mensajeNaiaId}`.

4. Cierre por `demowapp:cierre:{referenciaRecordatorio}`.

5. Notas CRM con marcador `[demowapp:{idempotencyKey}]` para evitar duplicados.

---

## 6\. Tablas usadas

Sin crear tablas nuevas. La migración `20260830130000_demowapp_idempotency_indexes.sql` añade únicamente índices únicos parciales para proteger la idempotencia frente a polling y reintentos concurrentes.

* `personas`

* `oportunidades`

* `aplicaciones`

* `conversaciones`

* `mensajes_conversacion`

* `comunicaciones_transaccionales`

* `notas_crm`

* `eventos_negocio`

* catálogos: `etapas_embudo`, `subestados_oportunidad`

---

## 7\. Catálogo de pushes

`src/lib/demowapp/push-catalog.ts` define:

* bienvenida_aplicacion_exitosa (automática)

* recordatorio_silencio_3_min (automática)

* cierre_inactividad_5_min (automática)

* sin_respuesta_inicial (manual)

* documentacion_pendiente (manual)

* estancamiento_en_aplicacion (manual)

* recordatorio_siguiente_paso (manual)

* acompanamiento_motivacional (manual)

---

## 8\. Cómo probar

1. Iniciar sesión como `super_admin` y abrir `/demoWapp`.

2. Pulsar **Iniciar sesión** y abrir una sesión.

3. Enviar mensaje y verificar guardado + respuesta + trazabilidad.

4. Completar flujo de aplicación en `/explorar` y validar apertura de modal a 5s.

5. Ejecutar `POST /api/demowapp/push/procesar` y comprobar entrega de bienvenida.

6. Simular inactividad y validar recordatorio/cierre (3 y 5 min).

---

## 9\. Cron futuro

El procesador ya está desacoplado en `processDuePushes` y puede ser invocado por cron:

* opción A: endpoint protegido `POST /api/demowapp/push/procesar`;

* opción B: job interno que importe el servicio y ejecute en backend.

No se activó cron global en esta fase.
