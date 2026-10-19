# BA-032 — WhatsApp real con Meta Cloud API

Estado: **desplegado en producción (2026-10-17) en piloto cerrado**: migración `wa_*` aplicada en Supabase, variables en Vercel, `WA_REAL_HABILITADO=false` y `WA_LEAD_CONVERSION_ENABLED=false`.
Por defecto todo queda cerrado: sin allowlist de piloto no se le responde a nadie, y sin `WA_LEAD_CONVERSION_ENABLED='true'` no se crean leads.

## Arquitectura

```
Meta (WhatsApp Cloud API)
   │  POST firmado (X-Hub-Signature-256)        GET hub.challenge (verificación)
   ▼
app/api/whatsapp/webhook/route.ts  (runtime nodejs)
   │ 1. lee el body crudo y valida la firma (401 si falla)
   │ 2. parsea mensajes (texto, list_reply, button_reply); statuses → log mínimo
   │ 3. filtro de piloto (allowlist) ANTES de abrir la base
   │ 4. responde 200 de inmediato; procesa con after()
   ▼
src/lib/whatsapp/orquestador.ts  (puro, sin base ni red: usa interfaces)
   ├─ idempotencia por wamid ............ AlmacenWhatsApp.marcarMensajeProcesado
   ├─ ventana 24 h ...................... ventana.ts
   ├─ límite por número (20/min) ........ rate-limit.ts (memoria, reemplazable)
   ├─ BAJA/STOP/ALTA, ASESOR/MENU ....... comandos.ts
   ├─ consentimiento Ley 1581 ........... solo número hasta el OK
   ├─ catálogo (máx 8 fichas) ........... CatalogoWa → obtenerOfertas (activo+publicado+validado+vigente)
   ├─ Mi lista ≠ Aplicar ≠ Autorizar .... reglas BA-031 (funnel-aplicar-reglas.ts)
   └─ conversión ........................ ConversorLeadsWa → fn_ba031_convertir_si_consentido (solo con interruptor)
   ▼
src/lib/whatsapp/graph-client.ts → POST https://graph.facebook.com/{versión}/{phone-number-id}/messages
```

### Archivos

| Ruta | Qué hace |
|---|---|
| `app/api/whatsapp/webhook/route.ts` | GET verificación, POST firmado, `after()` |
| `src/lib/whatsapp/config.ts` | Lectura de variables, allowlist, interruptores (fail-closed) |
| `src/lib/whatsapp/firma.ts` | HMAC-SHA256 + `timingSafeEqual`; verify token en tiempo constante |
| `src/lib/whatsapp/webhook-parser.ts` | Payload de Meta → mensajes entrantes |
| `src/lib/whatsapp/procesar-webhook.ts` | Lógica HTTP testeable sin Next + filtro de piloto |
| `src/lib/whatsapp/orquestador.ts` | Criterios de Producto |
| `src/lib/whatsapp/graph-client.ts` | Envío de texto, lista (≤8 filas), botones (≤3), plantilla (solo prueba manual) |
| `src/lib/whatsapp/ventana.ts`, `rate-limit.ts`, `comandos.ts`, `mensajes.ts`, `tipos.ts` | Piezas puras |
| `src/lib/whatsapp/almacen-memoria.ts` | Almacén en memoria (tests / local) |
| `src/lib/whatsapp/almacen-supabase.ts` | Almacén real (tablas `wa_*`) |
| `src/lib/whatsapp/catalogo-supabase.ts` | Adaptador sobre `obtenerOfertas` (fuente única del portal) |
| `src/lib/whatsapp/conversor-supabase.ts` | RPC `fn_ba031_convertir_si_consentido` + conversación en Lead Center |
| `src/lib/whatsapp/whatsapp.test.ts` | Tests sin red ni base |
| `supabase/migrations/20261017120000_ba032_whatsapp_meta.sql` | Tablas `wa_*` (NO ejecutada) |

Reutiliza sin duplicar: `lib/agentes/vozNaia.ts` (extracción de intereses/ciudad/modalidad/nivel), `src/lib/demowapp/funnel-aplicar-reglas.ts` (`evaluarDecision`, `evaluarGuardadoDatos`), `src/lib/ofertas.ts` (`obtenerOfertas`), `src/lib/leadcenter/tipos-consentimiento.ts`, `fn_ba031_convertir_si_consentido`. No se tocó `WhatsAppOtpProvider` (sigue stub) ni `lib/agentes/canales.ts`.

## Variables de entorno

Nunca se imprimen sus valores. El código solo revisa si existen.

| Variable | Obligatoria | Por defecto | Efecto si falta |
|---|---|---|---|
| `META_WA_TOKEN` | sí (para enviar) | — | No se envía nada (log `wa_sin_credenciales_envio`) |
| `META_WA_PHONE_NUMBER_ID` | sí | — | Igual que arriba |
| `META_WABA_ID` | informativa | — | Sin efecto en el MVP |
| `META_APP_SECRET` | sí | — | **Todo POST → 401** |
| `META_WA_VERIFY_TOKEN` | sí | — | **GET de verificación → 403** |
| `WA_PILOTO_NUMEROS` | para el piloto | vacío | Vacía/ausente/todas inválidas → **no se responde a nadie**. Formato recomendado: `+573001112233,+573004445566` (E.164 con `+`, máx 5). Desde 2026-10-19 se toleran espacios/guiones/paréntesis y dígitos sin `+` (se agrega), las inválidas se descartan una a una (aviso `wa_allowlist_invalida` con conteos) y se aceptan BSUID (`uid:CO.123…`). 10 dígitos que empiezan por 3 (sin indicativo) son inválidos; con 6 o más válidas, nadie |
| `WA_REAL_HABILITADO` | no | `false` | Solo el string exacto `true` abre el canal a **cualquier** número. **No encender** hasta que el catálogo real de aliadas esté cargado en prod (hoy solo hay universidades demo) |
| `WA_LEAD_CONVERSION_ENABLED` | no | `false` | Solo el string exacto `true` permite llamar a `fn_ba031_convertir_si_consentido`. Apagado: el flujo llega hasta Autorizar contacto, se guarda en `wa_intenciones` con paso `consentimiento_registrado` y al usuario se le dice que un asesor revisa su solicitud (sin prometer envío a la universidad) |
| `META_GRAPH_API_VERSION` | no | `v26.0` | Versión de Graph API (formato `vNN.N`) |
| `META_WA_TIMEOUT_MS` | no | `8000` | Timeout por envío (1000–20000) |
| `WA_RATE_LIMIT_POR_MINUTO` | no | `20` | Mensajes entrantes por número y minuto (1–120) |
| `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` | sí (ya existen) | — | El procesamiento falla y se loguea `lote_error` |
| `META_WA_TEST_TO` | solo prueba manual | — | Si no existe, no se hace envío de prueba |

### Quién recibe respuesta

| `WA_REAL_HABILITADO` | `WA_PILOTO_NUMEROS` | Resultado |
|---|---|---|
| ≠ `true` | vacía / falta / inválida | Nadie (fail-closed) |
| ≠ `true` | válida (≤5) | Solo esos números, con el catálogo actual (OK de Producto) |
| `true` | cualquiera | Todo el mundo. Requiere **además** catálogo real de aliadas cargado (precondición operativa, no la verifica el código) |

Fuera de la allowlist: no se abre la base ni se llama a Graph; solo queda un log con el número enmascarado (`+57••••••233`).

## Endpoints

- `GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…` → `200` con el challenge en texto plano, o `403`.
- `POST /api/whatsapp/webhook` → `401` sin firma, con firma inválida o sin `META_APP_SECRET`; `200 EVENT_RECEIVED` con firma válida (incluso si el JSON viene roto, para que Meta no reintente en bucle).

## Flujo conversacional (criterios de Producto)

1. **Primer mensaje** → "Te escribe BuscoEdu, soy NaIA…" + autorización Ley 1581 con botones *Sí, autorizo* / *No autorizo*. Hasta el OK solo se guarda el número (`wa_contactos`), sin texto ni historial. *No autorizo* → no se guarda nada más; *ACEPTO* lo reabre.
2. **Catálogo**: lo que el usuario escribe se convierte en filtros (vozNaia). Se consulta `obtenerOfertas` (activo + publicado + validado + vigente, solo aliadas). Máx 8 fichas: un texto con link a `https://www.buscoedu.com/explorar?q=…` por ficha + una lista interactiva. Sin resultados → "No encontré programas vigentes… No te voy a inventar opciones". No se usa LLM en este canal (MVP): así NaIA no puede inventar ofertas.
3. **Ficha** → botones *Guardar en Mi lista* / *Aplicar*. Mi lista no crea intención ni lead. Aplicar pide nombre completo y correo (opcional, *OMITIR*). Luego **Autorizar contacto** explícito y por oferta (*Autorizo contacto* / *No autorizo*). Solo con *Autorizo contacto* se evalúa `evaluarDecision` (BA-031).
4. **Sin OTP**: el número viene verificado por WhatsApp.
5. **Ventana 24 h**: solo se responde a mensajes con menos de 24 h; cada envío vuelve a comprobar la ventana con el último entrante guardado. No hay plantillas ni envíos masivos.
6. **BAJA / STOP** (también "darme de baja", "unsubscribe") → `opt_out=true`, una confirmación y luego silencio total (salvo *ALTA*). **ASESOR** → estado `humano`, registro en `wa_escalamientos`, aviso de horario (L–V 8:00–18:00 y sáb 9:00–13:00 hora Colombia ≈ a confirmar con Operación). NaIA calla hasta *MENU*.
7. **Errores**: catálogo caído, excepción o fallo de conversión → "tuve un problema técnico… No guardé nada a medias" + `https://www.buscoedu.com`. La conversión SQL es atómica (RAISE revierte), así que no hay lead a medias.
8. **Lead Center**: si la conversión está encendida y crea la oportunidad, se crea `conversaciones` con `canal='whatsapp'`, `metadatos.canal_real='meta_cloud_api'`, y se copia el historial consentido a `mensajes_conversacion`. Con el interruptor apagado el historial queda en `wa_mensajes` y las solicitudes en `wa_intenciones` (pendiente: vista en Lead Center).

## Persistencia — migración `20261017120000_ba032_whatsapp_meta.sql` (NO ejecutada)

Tablas nuevas, idempotentes (`IF NOT EXISTS`), con RLS activo y sin políticas (solo `service_role`):

- `wa_contactos` — número E.164 único, estado, consentimiento (fecha + versión), opt-out (fecha), último entrante, sesión (filtros, fichas mostradas, Mi lista, aplicación en curso), vínculo opcional a `personas` / `conversaciones`.
- `wa_mensajes_procesados` — PK `wamid` (idempotencia). Sugerencia: purgar filas de más de 30 días.
- `wa_mensajes` — historial (solo con consentimiento).
- `wa_intenciones` — Aplicar + Autorizar contacto por oferta (`consentimiento_registrado` | `lead_creado` | `rechazada` | `error_conversion`).
- `wa_escalamientos` — pedidos de ASESOR.

Sin la migración aplicada, el webhook responde 200 a Meta, pero el procesamiento falla y lo registra en el log (`lote_error`); no se responde al usuario.

## Cómo probar localmente

```bash
npm ci
npm test                      # requiere Node ≥ 22 (usa --experimental-strip-types)
./node_modules/.bin/tsc --noEmit
```

Prueba manual del endpoint sin Supabase ni Meta (valores de ejemplo, no reales):

```bash
META_WA_VERIFY_TOKEN=prueba-local META_APP_SECRET=secreto-local WA_PILOTO_NUMEROS= npx next dev -p 3999
curl "http://localhost:3999/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=prueba-local&hub.challenge=4242"   # → 4242
B='{"object":"whatsapp_business_account","entry":[]}'
S=$(printf '%s' "$B" | openssl dgst -sha256 -hmac secreto-local | awk '{print $2}')
curl -X POST -H "X-Hub-Signature-256: sha256=$S" --data-binary "$B" http://localhost:3999/api/whatsapp/webhook  # → 200
curl -X POST --data-binary "$B" http://localhost:3999/api/whatsapp/webhook                                     # → 401
```

Para recibir mensajes reales en local hace falta un túnel HTTPS (p. ej. ngrok) y apuntar el webhook de Meta a él; no es necesario para los tests.

## Seguridad

- Firma `X-Hub-Signature-256` validada sobre el body crudo con `timingSafeEqual`; sin secreto → 401.
- Verify token comparado en tiempo constante (hash SHA-256 de ambos lados).
- Errores de Graph sin token (se reemplaza si aparece en el mensaje de Meta); logs sin números completos ni textos de usuario.
- Tablas `wa_*` sin acceso para `anon` / `authenticated`.
- Piloto cerrado y conversión apagada por defecto.

## Limitaciones conocidas

- **Token temporal (~24 h)** en el box: sirve solo para pruebas. Producción necesita token de System User (ver `GUIA-JHON-WHATSAPP.md`).
- **Rate limit en memoria**: en Vercel cada instancia cuenta por separado; el límite real puede ser mayor que 20/min. Reemplazar por uno compartido (tabla/KV) antes de abrir al público.
- **Idempotencia** depende de la tabla `wa_mensajes_procesados` (sin migración, no hay dedupe real).
- **Catálogo demo** en prod: solo piloto cerrado hasta cargar aliadas reales.
- **Sin URL por ficha** en la web (el detalle es un modal): el link lleva a `/explorar?q=<programa>`.
- **Modo asesor** sin consola de respuesta en WhatsApp: el escalamiento queda registrado, pero un humano todavía no puede contestar desde Lead Center (siguiente BA).
- **Sin LLM** en este canal: respuestas deterministas en voz NaIA; integrar `AgenteExecutor` con `codigo_canal='whatsapp'` es un paso siguiente (con guardas de catálogo).
- `WA_LEAD_CONVERSION_ENABLED='true'` no se ha probado contra la base: `fn_convertir_aplicacion` recibe `visitante_id = null` y `canal_origen='whatsapp'`; validar en staging antes de encender.
- **Costos**: desde el 1-oct-2026 Meta cobra también los mensajes de servicio (respuestas dentro de la ventana) a partir del mensaje 1.001 del mes por número (ver guía).
- Solo texto e interactivos; audio/imagen reciben "por ahora solo leo texto".

## Verificación contra documentación de Meta

`developers.facebook.com` respondió 403/400 a las herramientas de lectura (fetch y curl) el 2026-10-17. Lo confirmado y lo no confirmado:

| Dato | Estado |
|---|---|
| Versión Graph `v26.0` | Confirmado empíricamente: `graph.facebook.com/v26.0` acepta la ruta y `v27.0` responde "Unknown path components" (2026-10-17). Changelog no leído (≈) |
| GET `hub.mode` / `hub.verify_token` / `hub.challenge`, challenge en texto plano | ≈ (blog oficial whatsappbusiness.com + guías de terceros) |
| `X-Hub-Signature-256` = `sha256=` + HMAC-SHA256(body, App Secret) | ≈ (guías de terceros coinciden) |
| Campo de webhook `messages` | ≈ (blog oficial whatsappbusiness.com) |
| Lista interactiva: máx 10 filas; título de fila 24, descripción 72, botón 20, cuerpo 1024 caracteres; botones de respuesta máx 3 (título 20) | ≈ |
| Error 131047 = fuera de la ventana de 24 h | ≈ |
| Precios: servicio cobrado desde el 1-oct-2026 tras 1.000 gratis/mes por número | Confirmado en FAQ oficial https://whatsappbusiness.com/resources/faq/ |

## Logs de diagnóstico (2026-10-19)

Qué: cada POST con firma válida deja, **antes** de responder, una línea JSON `{"origen":"wa_webhook","evento":"wa_webhook_recibido",…}` armada por `src/lib/whatsapp/diagnostico.ts`. Por qué: un POST firmado del 19/10 (13:02:55, hora Madrid) respondió 200 sin ningún log y no se podía saber qué traía.

| Evento | Cuándo | Campos |
|---|---|---|
| `wa_webhook_recibido` | Siempre que la firma es válida | `object`, `json_valido`, `entradas`, `cambios`, `campos` (`change.field`), `mensajes`, `tipos_mensaje` (`message.type`), `estados`, `contactos`, `remitentes_en_allowlist` `{si,no}` (remitentes únicos), `remitente_ult4` (`***1234`), `phone_number_id_coincide` (true/false/null) |
| `wa_webhook_sin_contenido` | El parser no sacó mensajes ni estados | `object`, `json_valido`, `campos`, `tipos_mensaje` |
| `wa_webhook_resultado` | Al final: sincrónico si no hay nada que procesar; dentro de `after()` si lo hay | `resultado` (`fuera_allowlist` · `procesado` · `sin_contenido` · `solo_estados` · `error`), `mensajes`, `permitidos`, `rechazados`, `estados`, `duracion_ms`, `resultados` (conteo por resultado del orquestador), `error` (solo el nombre, p. ej. `TypeError`) |
| `wa_webhook_diag_error` | Si el diagnóstico mismo falla | `error` (solo el nombre) |

Nunca salen textos de mensajes, nombres, números completos (máx. 4 últimos dígitos) ni ids (wamid, phone_number_id, WABA). El diagnóstico va en `try/catch` y no puede cambiar la respuesta a Meta.

El trabajo posterior a la respuesta usa `after()` de `next/server`, que en Vercel se registra con `waitUntil`: la función sigue viva hasta terminar el callback (dentro de `maxDuration = 30`), así que `lote_procesado` / `wa_webhook_resultado` no se cortan.

## Remitentes sin teléfono: nombres de usuario y BSUID (2026-10-19)

**Qué pasó**: el 19/10 a las 13:15:12 (hora Madrid) Meta entregó un mensaje de texto firmado (`field=messages`, `phone_number_id` correcto) **sin `from`**; el parser lo descartaba (`id/from/timestamp` obligatorios) y el resultado fue `sin_contenido`.

**Doc oficial de Meta** (Business-scoped user IDs): <https://developers.facebook.com/documentation/business-messaging/whatsapp/business-scoped-user-ids> (la URL antigua `developers.facebook.com/docs/whatsapp/business-scoped-user-ids` redirige ahí). Lo que dice:

- Webhook `messages`: nuevo `messages[].from_user_id` (BSUID) y `from_parent_user_id` (si hay BSUID principal); `contacts[].user_id` / `parent_user_id` y `contacts[].profile.username`. `from` y `contacts[].wa_id` **se omiten** cuando el usuario activó nombre de usuario y no se cumple ninguna condición para incluir el teléfono (mensaje/llamada con ese número en los últimos 30 días, o que esté en la libreta de contactos).
- Formato BSUID: código de país ISO 3166 alfa-2 + `.` + hasta 128 alfanuméricos (`US.13491208655302741918`); principal: `US.ENT.…`. Debe usarse completo.
- Envío: campo `recipient` (BSUID) en `POST /{phone-number-id}/messages`; se puede mandar `to` y `recipient`, y **`to` gana**. Error `131062` = «BSUID recipients are not supported for this message». Para pedir el número: `interactive.type = request_contact_info` (`action.name = request_contact_info`).
- Estados: `recipient_user_id` (no lo usamos todavía).

**Qué hace el código**:

| Pieza | Comportamiento |
|---|---|
| `webhook-parser.ts` | Remitente = `from` → `from_user_id` (y `user_id`, por si acaso) → `contacts[]` (por `wa_id`, por índice o único contacto; también recupera `wa_id`). `MensajeEntrante.remitente = {telefono, userId}`; `e164`/`waId` siguen iguales cuando hay teléfono (`''` si solo hay BSUID). |
| `config.ts` | Allowlist acepta E.164 y BSUID (`uid:CO.…` o detectado por formato); `remitentePuedeRecibirRespuesta` mira teléfono **o** BSUID. |
| `orquestador.ts` | Remitente solo con BSUID y permitido → `solo_user_id`: **no** crea contacto ni historial; le manda `request_contact_info` por `recipient` (si Meta lo rechaza, un texto simple). Rate limit por `uid:<BSUID>`. Logs `uid:***1234`. |
| `graph-client.ts` | `direccionMeta`: teléfono → `to`; BSUID → `recipient`. |
| `diagnostico.ts` | Nuevos `remitentes_con_telefono`, `remitentes_solo_user_id`, `remitente_user_id_ult4` (`uid:***1234`). |

**Por qué no se guarda el BSUID**: `wa_contactos.celular_e164` es `NOT NULL` con `CHECK` E.164 y índice único; meter el BSUID ahí rompería el CHECK y mezclaría identidades. Además sin teléfono no se puede crear la persona/lead (`celular_e164` en la conversión). Propuesta **no aplicada**: `supabase/ops/20261019_wa_contactos_user_id_propuesta.sql` (columna `wa_user_id`, `celular_e164` nullable, CHECK de identidad).

**Compartir número (2026-10-19)**: cuando el usuario toca el botón, Meta manda `messages[].type='contacts'` con `from_user_id` y `contacts[].origin='contact_request'` + `phones[].wa_id` (sin vCard; doc BSUID, «Webhook de contactos»). El parser toma ese número como el del remitente (solo con `origin=contact_request`; `other` es otra persona y se ignora), se crea `wa_contactos` con teléfono y sigue el flujo normal (consentimiento → NaIA) respondiendo por `to`. El BSUID se vincula en `sesion.waUserId` (jsonb, sin migración) solo si compartió su número o dio el consentimiento, para reconocerlo si luego escribe otra vez sin `from`. Prueba de punta a punta: `src/lib/whatsapp/e2e-bsuid.test.ts`. La propuesta SQL quedó alineada con la de Base de datos (no aplicada y no necesaria para responder).

**Incertidumbre**: la doc no dice si `from_user_id` puede faltar cuando sí viene `contacts[].user_id`; por eso se aceptan ambos. Si el usuario comparte su número con el botón, la doc indica que llega un webhook `contacts` y que desde entonces el teléfono vuelve a incluirse (regla de 30 días); no está probado en el piloto.

## Bitácora

| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-17 | Webhook `/api/whatsapp/webhook` (GET verificación + POST firmado), cliente Graph, orquestador con consentimiento Ley 1581, catálogo ≤8 fichas, Mi lista ≠ Aplicar ≠ Autorizar contacto, ventana 24 h, BAJA/STOP, ASESOR, rate limit, idempotencia; migración `wa_*` (no ejecutada); 48 tests nuevos | BA-032: WhatsApp real con Meta Cloud API | Backend BuscoEdu (bot) |
| 2026-10-17 | Piloto cerrado `WA_PILOTO_NUMEROS` (máx 5, fail-closed) e interruptor `WA_LEAD_CONVERSION_ENABLED` (solo `'true'`); tests de allowlist y de no-conversión con interruptor apagado o sin definir | Ajuste obligatorio de Producto/Orquestador: probar con el equipo sobre el catálogo actual sin generar leads facturables | Backend BuscoEdu (bot) |
| 2026-10-17 | Textos de piloto: Autorizar contacto con interruptor apagado → «Estamos en piloto: tu autorización quedó registrada, pero todavía no enviamos datos a universidades.»; ASESOR → «Un asesor del equipo BuscoEdu te escribirá en horario hábil» (respuesta manual desde Meta). Criterio 8 ≈ parcial (historial en `wa_mensajes`). | Ajuste de Producto: no prometer envío ni asesor inexistente | Backend BuscoEdu (bot) |
| 2026-10-17 | Deploy BA-032: migración `ba032_whatsapp_meta` aplicada en Supabase (5 tablas `wa_*`, RLS sin políticas), variables Meta/piloto en Vercel (Production y Preview), PR squash a `main` y deploy único a producción; smoke del webhook | Puesta en producción del piloto cerrado de WhatsApp | Orquestador BuscoEdu vía executor, con OK de Jhon |
| 2026-10-19 | Logs de diagnóstico enmascarados `wa_webhook_recibido`, `wa_webhook_sin_contenido` y `wa_webhook_resultado` (helper puro `diagnostico.ts`, 14 pruebas); se confirma que el trabajo post-respuesta ya va con `after()` | Un POST firmado de Meta respondió 200 sin dejar logs | Backend BuscoEdu (bot), pedido del Orquestador |
| 2026-10-19 | Fallback de remitente sin `from` (`from_user_id` / `contacts[].user_id`), envío por `recipient` (BSUID) con `request_contact_info`, allowlist tolerante (agrega `+`, quita espacios/guiones/paréntesis, descarta inválidas una a una, `wa_allowlist_invalida`, acepta `uid:`), conteos de remitentes en el diagnóstico; propuesta SQL no aplicada para `wa_user_id`; 26 pruebas nuevas | Meta entregó a las 13:15:12 (Madrid) un mensaje firmado sin `from` (usuario con nombre de usuario) y quedó `sin_contenido`; el valor de `WA_PILOTO_NUMEROS` sin `+` invalidaba la lista entera | Backend BuscoEdu (bot), pedido del Orquestador |
| 2026-10-19 | Fixture `src/lib/whatsapp/__fixtures__/bsuid-sin-from.json` con la forma exacta del payload real de producción (13:26, hora Madrid; valores anonimizados: sin `from` ni `wa_id`, con `from_logical_id` y `contacts[].country_code`, que se ignoran) + 6 pruebas: parser, diagnóstico sin PII, allowlist `+57…,uid:CO.<id>` (y `CO.<id>` sin prefijo), camino completo hasta el POST a Graph con `recipient` + `request_contact_info`. El parser no necesitó cambios | Validar el fallback contra la forma real del mensaje de Jhon | Backend BuscoEdu (bot), pedido del Orquestador |
| 2026-10-19 | Compartir número por `request_contact_info` → contacto con teléfono y flujo normal; vínculo BSUID en `sesion.waUserId`; prueba E2E con Supabase y Graph simulados (`e2e-bsuid.test.ts`, 6 casos: flujo completo, allowlist solo teléfono, 131030, ventana 24 h, origin=other); propuesta SQL reemplazada por la de Base de datos (sin aplicar); `pais_celular` null-safe | Que el primer intento de Jhon llegue hasta NaIA sin ida y vuelta | Backend BuscoEdu (bot), pedido del Orquestador; SQL de Base de datos BuscoEdu (bot) |
