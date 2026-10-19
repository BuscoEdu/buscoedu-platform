# BuscoEdu - Plataforma de Orientación Educativa

## 🎯 Descripción

BuscoEdu (www.buscoedu.com) es una plataforma de orientación educativa neutral que conecta personas con ofertas académicas (becas, descuentos, programas universitarios). **BuscoEdu NO es una universidad**, no garantiza admisión, no asigna becas. Solo orienta.

**NaIA** es la asesora virtual de BuscoEdu que ayuda a las personas a expresar lo que buscan, transforma esa intención en filtros de búsqueda visibles, explica resultados y acompaña la exploración.

## Estado actual — 25 de septiembre de 2026

### Actualización lookfeel-nav (portal público)

* **Nav primer nivel (orden fijo):** Explorar · NaIA · Programas · Universidades · Mi lista · Más; CTA único de header **Hablar con NaIA**.
* **Menú Más (exacto):** Cómo funciona · Beneficios · Contacto · Para universidades · Privacidad · Términos.
* **Footer en 3 columnas:** Producto | Información | Legal (espejo de destinos de producto + legal).
* **Logo:** mark mínimo + wordmark BuscoEdu (enlace a home). FAB móvil etiquetado **NaIA** (no letra “N”).
* **Home:** dos puertas **Hablar con NaIA** + **Explorar ofertas**; formulario local del navegador retirado del home.
* **Programas / Universidades:** sin landings nuevas; redirigen a `/explorar?vista=programas` y `/explorar?vista=universidades`. B2B permanece en `/para-universidades`.
* **`/explorar?vista=`:** cableado mínimo de prefiltro/vista (programas dedupe por programa; universidades orden A–Z) sin inventar catálogo.
* **Copy exacto de funnel público:** **Guardar en Mi lista** / **Aplicar** / **Autorizar contacto**. Empty Mi lista incluye “Guardar no envía tus datos.”
* **Cierres:** `ClosingCtas` en cómo-funciona, beneficios, contacto y para-universidades.
* **Fuera de alcance:** admin, Lead Center (salvo label pública del consentimiento usada por el portal), Demo WApp, SQL/datos, identidad Fase 2.
* **Ola BD BA septiembre 2026:** cierre y SQL operativo documentados en [`docs/bd/README-ola1-lote-ba-sep26.md`](docs/bd/README-ola1-lote-ba-sep26.md); no se ejecutó SQL en producción.

### Actualización Ronda 4 (payload 414 + mobile UX + optimización /universidades)

* **Fix crítico 414 en NaIA:** se redujo drásticamente el payload en `AgenteExecutor` (máx. 3 ofertas, campos esenciales, JSON compacto y recorte a 800 caracteres), y en turnos con `conversation_id` ya no se reenvía `prompt_sistema`.
* **AbacusAdapter condicionado por tamaño de prompt:** si `prompt_sistema` llega vacío/corto, envía solo el mensaje del estudiante para evitar crecer el body de la solicitud.
* **UX móvil en NaIA:** el bloque `Puedes continuar con` queda solo en desktop (`lg+`) y en móvil aparece botón dedicado `Explorar Resultados` cuando hay resultados.
* **Jerarquía de modales en móvil:** `OfferDetailModal` sube a `z-[80]` para mostrarse por encima del modal de resultados (`z-[70]`).
* **/explorar con grid más denso:** en layout `explorar`, las fichas usan 2 columnas en `sm` y 3 columnas en `xl`.
* **/para-universidades (B2B):** landing de conversión para instituciones (históricamente también en `/universidades`); desde lookfeel-nav, el ítem de producto **Universidades** apunta a Explorar prefiltrado y B2B vive en `/para-universidades`.
* **Landing B2B:** fondos alternantes por sección, animaciones de entrada con Intersection Observer, bloque de estadísticas con contador animado, microinteracciones hover y badge contextual en hero.

### Actualización Ronda 3 (fix crítico de NaIA + UX + Universidades B2B)

* **Fix crítico NaIA:** `AgenteExecutor` ahora resuelve despliegue de forma resiliente. Si la versión activa no trae `configuracion_snapshot.despliegue_id`, busca el despliegue activo más reciente (`updated_at DESC`, con fallback a `actualizado_en`).
* **Chat NaIA limpio:** en `/naia` y `/explorar`, el chat solo muestra historial + input + bloque `Puedes continuar con`; los filtros/chips viven únicamente en resultados.
* **Ubicación de sugerencias:** `Puedes continuar con` quedó debajo del input en web y móvil.
* **Resultados móvil full-screen:** al abrir resultados se oculta el header global, se bloquea scroll del body y el cierre `Volver al chat` queda sticky (tap target >= 44px).
* **Franja disclaimer dedicada:** el texto legal-operativo se movió a una franja entre experiencia NaIA y footer; se retiró del footer para evitar duplicidad.
* **/explorar hereda lógica de /naia:** ahora usa `NaiaSearchExperience` con variante de layout que prioriza el área de resultados.
* **Nueva página `/universidades`:** landing B2B completa de 13 secciones, FAQ acordeón, CTA repetido y formulario conectado a endpoint real (`/api/universidades/contacto`).
* **Semilla SQL B2B:** se agregó `supabase/seeds/contactos_universidades_seed.sql` con tabla y políticas idempotentes.

### Actualización Ronda 2 (NaIA UX web/móvil + detalle de fichas)

* En `/naia` se recalcula dinámicamente la altura útil de escritorio (`header + contenido NaIA + footer`) para mantener visible el footer sin saltos de página durante la conversación.
* Se añadió un separador visual entre el historial del chat y el bloque `Puedes continuar con`, evitando que ambos bloques queden pegados.
* En móvil, el chat ya no muestra chips de filtros: los filtros activos viven solo en la ventana de resultados, con mejor aprovechamiento del alto útil del chat.
* El placeholder del input quedó en `Pregúntale a NaIA` para asegurar una sola línea en móvil.
* La ventana móvil de resultados conserva botón de cierre explícito (`X`) con mayor contraste táctil.
* `OfferDetailModal` ahora queda totalmente contenido dentro del viewport móvil (`max-h` + `overflow` interno).
* Se amplió la altura de rebote del indicador de `pensando` para feedback visual más claro.
* NaIA recibe contexto de ofertas visibles (filtros + fichas resumidas) desde frontend/backend para responder preguntas de detalle de universidad/oferta sin inventar datos.

* NaIA mantiene configuración de agente, versión, contexto, canal y despliegue desde base de datos; una versión sin prueba/contexto/canal/despliegue no puede publicarse.
* La experiencia `/naia` ahora encaja sin scroll vertical general en desktop: el layout usa `100dvh` con `overflow-hidden`, y solo chat/listados internos hacen scroll.
* Todas las respuestas de NaIA incluyen conteo de resultados. Cuando el total es 0, NaIA responde explícitamente que no encontró coincidencias y sugiere ampliar o limpiar filtros.
* Se activó efecto máquina de escribir para los mensajes de NaIA y se mantuvo el autoscroll del historial durante la animación.
* Se agregó una barra de filtros activos editable (chips removibles + botón `Limpiar filtros`). En móvil, esta barra vive dentro de la ventana de resultados.
* La sección `Puedes continuar con…` quedó resaltada con fondo tenue y bordes para visibilidad.
* En móvil, el placeholder del chat se acortó a `Cuéntale a NaIA qué buscas…` y se ajustó tipografía de placeholder para evitar doble línea.
* En móvil, los resultados se abren en ventana adicional desde el botón `Explorar resultados`; en desktop continúan visibles en panel derecho.
* El indicador de espera `NaIA está entendiendo.../consultando...` ahora usa animación de puntos en movimiento.
* `OfferDetailModal` fue ajustado para no exceder el viewport: `max-w-[calc(100vw-1rem)]`, `min-w-0`, `overflow-x-hidden` y `break-words`.
* **Diagnóstico Derecho (confirmado 2026-09-20):** existen 9 ofertas activas/publicadas/validadas del área Derecho, pero todas tienen `vigente_hasta=2026-08-15`. Como la lógica exige vigencia (`vigente_hasta >= hoy`), el resultado correcto es 0. **No se cambió la lógica de vigencia**; la corrección requerida es de datos en Supabase.
* El CRM mantiene la migración `20260904010000_tipos_oportunidad_universidad.sql`: agrega `tipo_oportunidad` y `codigo`, crea automáticamente oportunidad institucional y evita automatizaciones B2C para universidades.

### Checklist de verificación después del despliegue

- [ ] Ejecutar una búsqueda pública de `Derecho` y confirmar que actualmente devuelve **0 resultados** por vigencia vencida en datos (`vigente_hasta=2026-08-15`).
- [ ] Repetir la búsqueda con `derecho`, `DERECHO` y `ciencias jurídicas`, validando el mismo comportamiento hasta actualizar datos.
- [ ] Tras actualizar vigencias en Supabase, abrir una oferta y confirmar programa, universidad, sede y modalidad.
- [ ] Verificar que filtros de nivel, modalidad y ubicación continúan combinándose con la búsqueda.
- [ ] Revisar la consola del navegador y los logs de Supabase: no debe aparecer error de columna ni consulta PostgREST inválida.
- [ ] Confirmar que los cambios de funnel y sus reglas se conservan después de recargar la página.

### Pendiente operativo obligatorio

Ejecutar en Supabase las migraciones pendientes, en especial `supabase/migrations/20260904010000_tipos_oportunidad_universidad.sql`, antes de usar códigos de oportunidad o registrar nuevas universidades en producción. Después, validar una universidad de prueba y verificar que aparezca como oportunidad de tipo **Universidad** en Lead Center.

## 📚 Stack Técnico

La arquitectura modular y sus reglas de escalamiento están documentadas en
[`docs/ARQUITECTURA_ESCALABLE_BUSCOEDU.md`](docs/ARQUITECTURA_ESCALABLE_BUSCOEDU.md).
La comprobación no destructiva del módulo IA está disponible en
[`supabase/diagnostics/auditoria_escalabilidad_ia.sql`](supabase/diagnostics/auditoria_escalabilidad_ia.sql).

```
Framework:      Next.js 14+ (TypeScript, App Router)
Estilos:        Tailwind CSS
Base de datos:  Supabase (PostgreSQL)
Deploy:         Vercel → www.buscoedu.com
Cliente DB:     src/lib/supabase.ts (getSupabaseClient())
```

## E1 · Release a producción — IA multiproveedor + panel admin IA + topes (2026-10-18)

Rama `release/e1-prod` → PR a `main` (squash). Integra el Frontend (`feat/e1-fe-admin-ia`), Backend y BD (`feat/e1-integra`) y la evidencia de BD de lo aplicado en prod.

| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 | Release E1: BA-034 (capa IA multiproveedor), BA-035 (claves en Vault), BA-036/037/038 (API y panel admin IA: proveedores, modelos, modelo + respaldo por agente, tope diario por canal, alertas), BA-039 (voz NaIA y canales desde BD), BA-040 (`fn_cambiar_etapa` con subestado obligatorio) y BA-041 (conversión valida antes de escribir + errores en español). Migraciones `20261018100000` → `20261018160000` ya aplicadas en prod por BD (`docs/bd/README-e1-prod-20261018.md`), más el `search_path` fijo de `fn_ia_solo_insercion` | Operar proveedores de IA, modelos, respaldos y tope de gasto sin tocar código; que nunca haya gasto sin límite; 0 leads sin consentimiento o con oferta vencida | Backend BuscoEdu (bot) integra; Frontend BuscoEdu (bot) y Base de datos BuscoEdu (bot) son autores de sus partes |
| 2026-10-18 | Hotfix seguridad cambiar etapa: `POST /api/leadcenter/oportunidad/[id]/etapa` valida sesión (401), rol asesor/super_admin (403) y body (400, mensaje en español) antes de tocar la BD; errores sin detalle interno (`src/lib/leadcenter/cambiar-etapa.ts` + tests). La RPC sigue con el cliente del usuario: `fn_cambiar_etapa` autoriza con `auth.uid()` (`puede_ver_oportunidad`), así que con service role respondería siempre `no_autorizado`. REVOKE (decisión del Orquestador, opción A): tras el deploy, BD aplica solo la fase 1 (PUBLIC + anon); la fase 2 (`authenticated`) queda en standby hasta que exista una versión de `fn_cambiar_etapa` con `p_actor_usuario_id` ejecutable solo por service_role | Cerrar la RPC a quien no tiene sesión de Lead Center y no filtrar mensajes de Postgres | Backend BuscoEdu (bot) |
| 2026-10-19 | Publicación a producción (rama `release/e1-eventos-abacus`, squash a `main`, un solo deploy): `POST /api/eventos` guarda los eventos desde el servidor (service role, lista permitida, mismo origen, cupos) y el navegador ya no inserta con la clave anon en `eventos_negocio` ni en `visitantes`; además, el asistente/detalle de Admin IA muestra las referencias de Abacus («Despliegue», «Token»; si faltan, «Sin referencia configurada») en vez de «Sin modelo». La propuesta RLS `supabase/ops/20261019_eventos_negocio_rls_propuesta.sql` **no se aplica** y no hay cambios en Supabase | En el smoke de QA del PR #65 los eventos de NaIA fallaban con `42501`/HTTP 401 (RLS) y se perdían, y Abacus aparecía como «Sin modelo» | Backend BuscoEdu (bot) integra; Frontend BuscoEdu (bot) es autor de `6b54fe4`; con OK de Jhon vía Orquestador |
| 2026-10-19 | Diagnóstico enmascarado del webhook de WhatsApp: tras validar la firma y **antes** de responder se emite una línea `wa_webhook_recibido` (object, entradas, cambios, campos, mensajes, tipos de mensaje, estados, contactos, remitentes en allowlist sí/no, `***` + 4 últimos dígitos, `phone_number_id_coincide`); `wa_webhook_sin_contenido` cuando el parser no saca mensajes ni estados, y `wa_webhook_resultado` (fuera_allowlist / procesado / sin_contenido / solo_estados / error + nombre del error, conteos, `duracion_ms`), también desde `after()`. Helper puro `src/lib/whatsapp/diagnostico.ts` + 14 pruebas. Sin textos, nombres, números completos ni ids | Un POST firmado de Meta del 19/10 a las 13:02:55 (hora Madrid) respondió 200 sin dejar ninguna línea de log y no se podía saber qué traía | Backend BuscoEdu (bot), pedido del Orquestador, con OK de Jhon para publicar |
| 2026-10-19 | WhatsApp: remitentes sin `from` (nombres de usuario de WhatsApp): el parser usa `from_user_id` o `contacts[].user_id` (BSUID) si falta el teléfono; a esos remitentes se les responde por `recipient` pidiendo el número (`request_contact_info`) sin guardar contacto ni historial; allowlist `WA_PILOTO_NUMEROS` tolerante (agrega `+`, quita espacios/guiones/paréntesis, descarta inválidas una a una con aviso `wa_allowlist_invalida`, acepta `uid:<BSUID>`); diagnóstico con `remitentes_con_telefono` / `remitentes_solo_user_id`. Propuesta SQL **no aplicada** `supabase/ops/20261019_wa_contactos_user_id_propuesta.sql`. Detalle: `docs/wa/README-ba032-whatsapp-meta.md` | Meta entregó a las 13:15:12 (hora Madrid) un mensaje firmado sin `from` y el parser lo descartó (`sin_contenido`); además la allowlist sin `+` se invalidaba entera | Backend BuscoEdu (bot), pedido del Orquestador |
| 2026-10-19 | WhatsApp: fixture anonimizado con la forma exacta del payload real de producción (sin `from`, con `from_user_id`, `from_logical_id`, `contacts[].user_id/country_code`) y 6 pruebas hasta el envío por `recipient`; el parser no necesitó cambios | Validar el fallback BSUID contra el mensaje real de Jhon (13:26, hora Madrid) sin subir datos reales | Backend BuscoEdu (bot), pedido del Orquestador |
| 2026-10-19 | WhatsApp: el número compartido con el botón `request_contact_info` (webhook `contacts`, `origin=contact_request`) crea el contacto con teléfono y sigue a consentimiento y NaIA; el BSUID se vincula en `sesion.waUserId` (sin migración); prueba E2E con Supabase/Graph simulados; propuesta SQL alineada con Base de datos (**no aplicada**) | Análisis previo al deploy: que el bot le responda a Jhon (usuario con nombre de usuario, sin `from`) en el primer intento | Backend BuscoEdu (bot), pedido del Orquestador |

## E1 Ola 3/4 — API admin de IA (BA-036/037/038)

Contrato de las rutas `/api/admin/ia/...` (solo super_admin) para que Frontend construya el asistente «Agregar proveedor», el interruptor con aviso de impacto, el modelo y los respaldos por agente y el tope de gasto diario por canal. Fase 2 implementada: rutas en `app/api/admin/ia/...` → servicios puros en `lib/admin-ia/` (tests en `lib/admin-ia/e1-api.test.ts`). El motor revisa el tope diario del canal antes de cada llamada IA (fail-closed con el texto C3; el canal `panel` de las pruebas de conexión no consulta tope) y calcula el costo con el precio vigente. Detalle, estado por endpoint y bitácora (2026-10-18, Backend BuscoEdu (bot)): [`docs/backend/README-e1-api.md`](docs/backend/README-e1-api.md).

## E1 Ola 3/4 — Panel «IA multiproveedor» (Frontend)

Pantallas de `/admin/ia/multiproveedor` (solo super_admin): asistente de 5 pasos para agregar proveedor, interruptor con aviso de impacto, ficha con bitácora, modelo + respaldos por agente y tope de gasto diario por canal. Usan la API real (`src/lib/admin-ia/api.ts`); el adaptador de ejemplo es solo para pruebas y capturas. El formulario viejo `/admin/ia/proveedores` ahora redirige aquí. Bitácora: 18/10/2026 — panel E1 + reemplazo del formulario viejo — para operar proveedores y topes sin tocar código — Frontend BuscoEdu (bot). 18/10/2026 — pulido QA: etiquetas en español centralizadas en `src/lib/admin-ia/etiquetas.ts` para todo `/admin/ia` (sin códigos ni inglés visibles), «Publicar vN» como único CTA coral en «Modelo por agente», `engines.node` `>=22 <23` y `.nvmrc` — para que el panel se lea en español claro y las pruebas corran con Node 22 — Frontend BuscoEdu (bot). 2026-10-18 — post-QA: «Cambios del tope» ya no queda bajo la barra fija a 390/360 (F1); el asistente retoma el paso desde el servidor y deja localStorage como respaldo (F2, sin cambios de BE) — para que nada quede tapado y se pueda seguir en otro navegador — Frontend BuscoEdu (bot FE). 2026-10-19 — el detalle de un proveedor Abacus muestra los nombres de sus referencias («Despliegue: ABACUS_NAIA_DEPLOYMENT_ID», «Token: ABACUS_NAIA_DEPLOYMENT_TOKEN»; si faltan, «Sin referencia configurada») en vez de «Sin modelo» — porque la API manda `modelo` en null para Abacus y el panel solo miraba ese campo; nunca se muestran valores — Frontend BuscoEdu (bot). Detalle: [`docs/frontend/README-e1-admin-ia.md`](docs/frontend/README-e1-admin-ia.md).

## Explorar — paginación estable de «Mostrar más»

«Mostrar más» en `/explorar` y `/naia` llega a todas las ofertas sin duplicados: `obtenerOfertas` ordena por `creado_en desc, id asc` y la página siguiente sale de las páginas ya pedidas (`src/lib/paginacion-ofertas.ts`, con pruebas). Bitácora: 2026-10-18 — se quedaba en 14 de 50 por empates de `creado_en` — Frontend BuscoEdu (bot FE); coordinar con BE el contrato BA-005. Detalle: [`docs/frontend/README-explorar-paginacion.md`](docs/frontend/README-explorar-paginacion.md).

Bitácora BE: 2026-10-18 — revisión del contrato BA-005 tras el orden estable: compatible (firma, defaults 0/20 y forma de la respuesta sin cambios; NaIA 10, WhatsApp ≤8, Demo WApp 5 y cifras del Home no se truncan). Se agregan pruebas del contrato (`src/lib/ofertas-contrato-ba005.test.ts`) y un índice `(creado_en desc, id)` propuesto **no aplicado** (requiere OK de Jhon y plan de BD) — para que el «Mostrar más» estable no rompa a los otros canales y la paginación escale — Backend BuscoEdu (bot). Detalle: [`docs/ba-005-contrato-obtener-ofertas.md`](docs/ba-005-contrato-obtener-ofertas.md).

## Eventos de negocio del explorador — columnas reales

`trackEvent` (`src/lib/events.ts`) inserta en `eventos_negocio` con las columnas reales `evento`, `metadatos` y `creado_en`. Antes enviaba `tipo_evento`, `metadata` y `fecha_evento`, que no existen, y PostgREST respondía PGRST204. Los callers no cambian. Prueba: `src/lib/events.test.ts`. Bitácora: 2026-10-18 — mapeo a columnas reales — para que los eventos de Explorar/NaIA dejen de perderse — Backend BuscoEdu (bot). Detalle: `docs/BUSCOEDU_DATA_DICTIONARY.md` (sección `eventos_negocio`). Bitácora: 2026-10-18 — sin `metadata` se envía `metadatos: {}` en vez de `null` — porque BD confirmó `metadatos jsonb NOT NULL default '{}'` y el null rompería el insert — Backend BuscoEdu (bot).

Bitácora: 2026-10-19 — **qué**: los eventos se guardan en el servidor con `POST /api/eventos` (service role, lista permitida de 7 eventos, UUIDs, `metadatos` ≤ 2 KB, mismo origen, 120/min por IP y 60/min por visitante); `trackEvent` hace `fetch` con `keepalive` (respaldo `sendBeacon`) y el navegador ya no inserta en `eventos_negocio` ni en `visitantes` con la clave anon — **por qué**: en el smoke de QA en producción esos inserts fallaban por RLS (`42501` ×2, HTTP 401 ×3) y los eventos se perdían; no se abre RLS a anon y no hace falta política nueva (propuesta no aplicada: `supabase/ops/20261019_eventos_negocio_rls_propuesta.sql`) — **quién**: Backend BuscoEdu (bot). Contrato: [`docs/backend/README-eventos.md`](docs/backend/README-eventos.md).

## BA-034 — Capa IA multiproveedor (E1)

NaIA llama al modelo a través de una capa común (`lib/agentes/llm/`). Abacus sigue siendo el proveedor por defecto y recibe exactamente la misma entrada que antes (decisión 13; lo prueba un test de regresión). OpenAI, xAI, Anthropic, Gemini y OpenRouter entran por el AI SDK de Vercel (decisión 12). Si un modelo falla responde el respaldo, que es opcional. Si no responde ninguno, el estudiante recibe un mensaje honesto con paso a una persona. Las URLs de proveedor salen de una lista fija en código. Las claves se leen de Vault y, si no están, de una variable de entorno. Cada intento deja su costo registrado, y si ese registro falla la respuesta sigue igual. Detalle, migración (sin aplicar), cómo deshacerla y bitácora: [`docs/backend/README-ba034.md`](docs/backend/README-ba034.md).

## BA-039 — Voz de NaIA y canales desde la base de datos (E1)

El tono y el formato de NaIA salen de los componentes `voz_naia`, `contrato_salida_naia` y `contrato_salida_naia_whatsapp` asociados a la versión del agente, así que se editan desde `/admin/ia → Contextos`. Las reglas de no inventar siguen fijas en código. Con el texto de la semilla, NaIA habla exactamente igual que antes (lo prueba un test de regresión). Si la BD no trae la voz, se usa la misma voz desde código y queda un aviso en el log. Los canales válidos se leen de `canales_ia.activo`, sin lista fija. Un canal desconocido o inactivo se rechaza con 400 y un error de BD con 503: nunca cae a web. Detalle, migración (sin aplicar), cómo deshacerla y bitácora: [`docs/backend/README-ba039.md`](docs/backend/README-ba039.md).

## BA-030 y BA-033 — Demo WApp solo-hilo

En `/demoWapp` y en el modal del estudiante el canal es un hilo a pantalla completa, en móvil y en escritorio. La oferta y las opciones van dentro del chat. Sesiones, búsqueda y CRM no se muestran al lado. El portal NaIA/Explorar (BA-025, BA-026, BA-027, BA-028) no cambia. Nota: [`docs/frontend/README-ba030-ba033.md`](docs/frontend/README-ba030-ba033.md).

## BA-031 UI — Aplicar en el hilo

En `/demoWapp`, con sesión de super admin, la oferta del chat abre Aplicar → datos → consentimiento sin salir del hilo. Mi lista no crea solicitud. El lead solo aparece si el servidor acepta el consentimiento. Nota: [`docs/frontend/README-ba031-ui.md`](docs/frontend/README-ba031-ui.md).

## BA-024 — Voz de NaIA (lote naia-wapp)

NaIA responde de tú, en colombiano neutro, con markdown en el mensaje (negrita y viñetas cortas) y una sola pregunta por turno. Lo que el estudiante dice (ciudad, modalidad, presupuesto, nivel, intereses, contacto) queda en la sesión del hilo y no se vuelve a preguntar. No se inventan ofertas ni se abre lead a una universidad. Cierre: [`docs/backend/BA-024-voz-sesion-naia.md`](docs/backend/BA-024-voz-sesion-naia.md).

## BA-032 — WhatsApp real (Meta Cloud API)

Webhook `GET/POST /api/whatsapp/webhook` con firma `X-Hub-Signature-256`, consentimiento Ley 1581 antes de guardar datos, catálogo vigente (máx 8 fichas), Mi lista ≠ Aplicar ≠ Autorizar contacto, ventana 24 h, BAJA/STOP y ASESOR. Cerrado por defecto: piloto con `WA_PILOTO_NUMEROS` (máx 5) y sin leads mientras `WA_LEAD_CONVERSION_ENABLED` no sea `'true'`. Migración `20261017120000_ba032_whatsapp_meta.sql` pendiente de ejecutar. Detalle: [`docs/wa/README-ba032-whatsapp-meta.md`](docs/wa/README-ba032-whatsapp-meta.md) · guía no técnica: [`docs/wa/GUIA-JHON-WHATSAPP.md`](docs/wa/GUIA-JHON-WHATSAPP.md).

Bitácora: 2026-10-17 — BA-032 implementado en rama local `feat/wa-meta` (sin desplegar) — para habilitar WhatsApp real con Meta — Backend BuscoEdu (bot). 2026-10-19 — logs de diagnóstico enmascarados `wa_webhook_recibido` / `wa_webhook_sin_contenido` / `wa_webhook_resultado` — porque un POST firmado respondió 200 sin dejar rastro — Backend BuscoEdu (bot), pedido del Orquestador. 2026-10-19 — fallback de remitente por BSUID (`from_user_id` / `contacts[].user_id`) y allowlist tolerante — porque Meta entregó un mensaje sin `from` — Backend BuscoEdu (bot), pedido del Orquestador.

## BA-009 — Lote sep26

La decisión de fuente única y el corte de la API pública legacy de contexto NaIA están documentados en [`docs/ba-009-fuente-unica-contexto-naia.md`](docs/ba-009-fuente-unica-contexto-naia.md).

## 🏗️ Estructura del Proyecto

```
buscoedu-platform/
├── app/                          # Páginas de Next.js (App Router)
│   ├── page.tsx                  # Landing principal
│   ├── layout.tsx                # Layout global
│   ├── globals.css               # Estilos globales
│   ├── explorar/                 # Página de exploración
│   │   └── page.tsx
│   ├── mi-lista/                 # Lista local del visitante
│   ├── naia/                     # Página informativa de NaIA
│   ├── programas/
│   ├── universidades/
│   ├── beneficios/
│   ├── como-funciona/
│   ├── para-universidades/
│   ├── contacto/
│   ├── privacidad/
│   ├── terminos/
│   └── test-supabase/            # Prueba de conexión a Supabase
│
├── components/                   # Componentes reutilizables
│   ├── Providers.tsx             # Wrapper de contextos
│   ├── naia/
│   │   ├── NaiaEntryModal.tsx    # Modal inicial de NaIA
│   │   ├── NaiaChatPanel.tsx     # Panel de chat conversacional
│   │   └── NaiaMessage.tsx       # Componente de mensaje
│   ├── explorar/
│   │   ├── FilterPanel.tsx       # Panel de filtros manuales
│   │   ├── ActiveFilterTags.tsx  # Tags de filtros activos
│   │   ├── SortControl.tsx       # Control de ordenamiento
│   │   ├── OfferCard.tsx         # Tarjeta de oferta
│   │   └── OfferDetailModal.tsx  # Ficha de detalle bloqueante
│   ├── layout/
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   ├── ui/
│   │   ├── SectionHeading.tsx
│   │   ├── InfoCard.tsx
│   │   ├── Logo.tsx
│   │   └── ClosingCtas.tsx
│   └── forms/
│       ├── InterestForm.tsx
│       └── SimpleLocalForm.tsx
│
├── src/
│   ├── lib/
│   │   ├── supabase.ts           # Cliente de Supabase
│   │   ├── visitor.ts            # Sistema de visitante anónimo
│   │   ├── naia-mock.ts          # Motor mock de NaIA
│   │   ├── ofertas.ts            # Consultas de ofertas
│   │   └── events.ts             # Sistema de tracking de eventos
│   └── contexts/
│       └── MyListContext.tsx     # Contexto de "Mi Lista"
│
├── supabase/
│   └── migrations/
│       └── 20260815_add_visitante_id_to_eventos_negocio.sql
│
├── tailwind.config.ts            # Configuración de Tailwind
├── tsconfig.json                 # Configuración de TypeScript
└── package.json
```

## 🚀 Flujo de Navegación Implementado

```
Landing (app/page.tsx)
  → [click "Hablar con NaIA"]
  → Modal inicial de NaIA (componente sobre landing)
  → [usuario escribe intención o elige sugerencia → click "Buscar con NaIA"]
  → Redirige a /explorar?q={intención}
  → Página /explorar (app/explorar/page.tsx)
      ├── Panel izquierdo (desktop): chat NaIA + filtros manuales
      ├── Panel derecho (desktop): encabezado + filtros activos + grid de tarjetas
      ├── Móvil: chat compacto → filtros en tags → lista vertical de tarjetas
      └── [click en tarjeta]
          → Ficha ampliada modal bloqueante (componente sobre /explorar)
              ├── Información completa de la oferta académica
              ├── Botones: "Guardar en Mi lista" / "Aplicar"
              └── [click ×] → cierra ficha, restaura posición exacta de /explorar
```

## 🔧 Componentes Principales

### 1. NaiaEntryModal.tsx
Modal inicial que se abre al hacer click en "Hablar con NaIA":
- Área de texto para intención en lenguaje natural
- 5 sugerencias predefinidas clickeables
- Redirección a `/explorar?q={texto}`
- **NO** solicita datos personales
- Tracking de evento: `naia_modal_abierto`

### 2. NaiaChatPanel.tsx
Panel de chat conversacional con NaIA:
- Mensajes bidireccionales (usuario ↔ NaIA)
- Procesamiento con motor mock (naia-mock.ts)
- Detección automática de filtros
- Callback a componente padre con filtros detectados

### 3. Motor Mock de NaIA (naia-mock.ts)
Sistema de derivación basado en patrones de palabras clave:
- Matriz de reglas con patrones RegEx
- Detección de: áreas, modalidades, niveles, beneficios, ciudades
- Respuestas predefinidas contextuales
- Preguntas de seguimiento opcionales
- **NO usa OpenAI/Claude/Gemini** (es puro match de patrones)

### 4. FilterPanel.tsx
Panel de filtros manuales con grupos desplegables:
- **Estudios**: programa/área, nivel académico
- **Ubicación**: país, ciudad, universidad
- **Modalidad**: presencial, virtual, híbrida
- **Beneficios**: tipo de beneficio

### 5. OfferCard.tsx
Tarjeta de oferta académica:
- Imagen/logo de universidad
- Nombre del programa + universidad/sede
- Máximo 5 campos de decisión
- **NO muestra precio** (solo en ficha de detalle)
- Botón corazón para "Mi Lista"

### 6. OfferDetailModal.tsx
Ficha de detalle bloqueante:
- Modal que cubre toda la pantalla
- Información académica completa
- Beneficios y condiciones
- Precios (solo aquí, no en tarjetas)
- Requisitos de acceso
- Acciones: "Guardar en Mi lista" / "Aplicar"
- Tracking de eventos: `ficha_oferta_abierta`, `ficha_oferta_cerrada`, `intento_aplicar_oferta`

### 7. MyListContext.tsx
Contexto global de "Mi Lista":
- UNA SOLA lista (sin carpetas ni colecciones múltiples)
- Persistencia en `localStorage` (visitante anónimo)
- Tracking de eventos: `oferta_agregada_mi_lista`, `oferta_retirada_mi_lista`
- Sincronizará con Supabase al registrarse (futuro)

## 📊 Sistema de Tracking de Eventos

### Eventos Registrados

| Evento | Descripción | Datos capturados |
|--------|-------------|------------------|
| `naia_modal_abierto` | Usuario abre modal inicial | `visitante_id` |
| `intencion_busqueda_enviada` | Usuario envía búsqueda | `visitante_id`, `metadata.intencion` |
| `ficha_oferta_abierta` | Usuario abre detalle de oferta | `visitante_id`, `oferta_id`, `programa_id`, `universidad_id` |
| `ficha_oferta_cerrada` | Usuario cierra detalle | `visitante_id`, `oferta_id` |
| `oferta_agregada_mi_lista` | Oferta guardada en Mi Lista | `visitante_id`, `oferta_id` |
| `oferta_retirada_mi_lista` | Oferta quitada de Mi Lista | `visitante_id`, `oferta_id` |
| `intento_aplicar_oferta` | Click en "Aplicar" | `visitante_id`, `oferta_id`, `programa_id`, `universidad_id` |

Desde 2026-10-19 se envían a `POST /api/eventos` (servidor, service role); solo se aceptan estos 7 eventos. Contrato: `docs/backend/README-eventos.md`.

### Migración de Base de Datos

Se creó la migración SQL para agregar soporte de visitantes anónimos:

```sql
-- Archivo: supabase/migrations/20260815_add_visitante_id_to_eventos_negocio.sql
-- Agrega columna visitante_id a eventos_negocio
-- Crea FK constraint a tabla visitantes
-- Crea índice para optimizar consultas
```

**Nota**: Esta migración debe ejecutarse en Supabase antes del deploy.

## 🔑 Variables de Entorno

Ya configuradas en Vercel y `.env.local` (NO tocar):

```bash
NEXT_PUBLIC_SUPABASE_URL=<URL de Supabase>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Clave anónima>
```

Solo servidor (sin prefijo `NEXT_PUBLIC_`, nunca llega al navegador): `SUPABASE_SERVICE_ROLE_KEY`, que usan `/api/naia`, OTP, Lead Center y, desde 2026-10-19, `POST /api/eventos`.

## 🎨 Sistema de Diseño

### Colores (Tailwind)

```javascript
buscoedu: {
  blue: '#2563eb',
  teal: '#14b8a6',
  yellow: '#fbbf24',
  bg: '#f8fafc',
  text: '#1e293b',
  muted: '#64748b',
  border: '#e2e8f0'
}
```

### Sombra de Tarjetas

```javascript
card: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)'
```

## 📱 Responsive

- **Desktop** (≥768px): Layout 2 columnas (chat+filtros | resultados)
- **Mobile** (<768px): Layout vertical (chat → filtros → resultados)
- Diseño mobile-first obligatorio

## ⚠️ Prohibiciones Absolutas

### Sobre datos y privacidad:
- ❌ NO solicitar datos personales durante exploración
- ❌ NO transferir datos a universidades sin consentimiento
- ❌ NO crear oportunidades automáticamente

### Sobre presentación:
- ❌ NO mostrar precios en tarjetas (solo en ficha)
- ❌ NO mostrar cupos si no están validados
- ❌ NO mostrar más de 5 campos en tarjetas

### Sobre NaIA:
- ❌ NO conectar NaIA a OpenAI/Claude/Gemini (fase mock)
- ❌ NO aplicar filtros silenciosamente
- ❌ NO afirmar aprobación de admisión/beca

### Sobre navegación:
- ❌ NO permitir múltiples fichas abiertas simultáneamente
- ❌ NO crear comparador independiente (comparaciones solo en chat)
- ❌ NO crear múltiples listas (solo UNA "Mi Lista")

## 🗄️ Tablas de Supabase Consultadas

```
universidades          → nombre, descripción
sedes                  → nombre, ciudad, país
programas_academicos   → nombre, nivel, área, duración
modalidades            → tipo
ofertas_academicas     → nombre, descripción, vigencia, cupos
beneficios_oferta      → tipo, descripción, condiciones
visitantes             → id, fecha_primera_visita
eventos_negocio        → tipo_evento, visitante_id, oferta_id, metadata
```

## 🚦 Criterios de Aceptación

- [x] El clic en "Hablar con NaIA" abre un modal sin requerir registro
- [x] Un mensaje en el modal lleva a `/explorar` con resultados y filtros visibles
- [x] NaIA mock responde con mensaje, filtros detectados y pregunta opcional
- [x] Los filtros de NaIA y los manuales se sincronizan sin cambios silenciosos
- [x] Desktop: chat + filtros a la izquierda, resultados a la derecha (2 columnas)
- [x] Móvil: chat compacto, filtros en tags, tarjetas en lista vertical
- [x] Cada tarjeta tiene imagen/logo, no muestra precio, muestra máximo 5 campos
- [x] La ficha es bloqueante, única, sin imágenes, solo se cierra con `×`
- [x] Al cerrar la ficha se restaura la posición exacta del explorador
- [x] Existe una sola "Mi Lista", temporal para visitante anónimo
- [x] "Aplicar" muestra aviso (sin completar registro ni aplicación)
- [x] Ninguna acción de exploración crea oportunidad, aplicación ni transferencia
- [x] El visitante anónimo tiene `identificador_navegacion` persistido en `localStorage`
- [x] Los eventos clave se registran en `eventos_negocio` con `visitante_id`

## 🔄 Próximos Pasos (NO implementados en esta fase)

1. **Registro y autenticación** de usuarios
2. **Persistencia de Mi Lista** en Supabase al registrarse
3. **Flujo completo de aplicación** a ofertas
4. **Integración real de NaIA** con LLM (OpenAI/Claude)
5. **Filtrado avanzado** con consultas complejas a Supabase
6. **Paginación** de resultados
7. **Imágenes reales** de universidades/sedes
8. **Datos demo completos** en Supabase

## 📝 Comandos de Desarrollo

```bash
# Instalar dependencias
npm install

# Desarrollo local
npm run dev
# → http://localhost:3000

# Build producción
npm run build

# Preview URL (Abacus VM)
echo $PREVIEW_URL
# Puertos: $PREVIEW_URL-<port>.na110.preview.abacusai.app
```

## 🧭 Actualización CRM — Pipeline y Funnel (2026-09-05)

La actualización consolida la operación del Lead Center sin sustituir sus fuentes de datos actuales.

- **Pipeline y Funnel:** nueva ruta `/leadcenter/pipeline` con vistas de Panorama, Gestión y Configuración. El panel deja de enviar una etapa a una lista sin contexto; conserva el filtro de etapa dentro del módulo.
- **Tareas:** `/leadcenter/tareas` ofrece `Radar` como vista predeterminada y `Detalle` para trabajo operativo. El radar ordena por vencimiento y usa estados accesibles de tiempo, vencimiento y finalización.
- **Ficha de oportunidad:** incorpora dashboard enlazable a Persona, ruta visual de funnel, tareas contextualizadas, notas/comentarios en dos columnas, historial con altura controlada y consentimientos con scroll interno.
- **Modelo de datos:** la migración `20260905200000_funnel_salud_versionada.sql` añade versión de funnel, transiciones configurables, salud/prioridad, eventos de scoring idempotentes y fechas operativas. Debe ejecutarse en Supabase antes de activar configuraciones nuevas.

### Ejecutar migraciones y validar

1. Ejecuta las migraciones pendientes en orden cronológico, incluida `supabase/migrations/20260905200000_funnel_salud_versionada.sql`.
2. Revisa el `NOTICE` de la migración: si existen oportunidades activas duplicadas para la misma persona y oferta, resuélvelas antes de activar la unicidad.
3. Configura reglas de transición y salud desde administración antes de convertirlas en obligatorias para operación.
4. Ejecuta `npm run build` antes de desplegar.

### Corrección posterior a validación en producción

- El dashboard toma el reloj de la subetapa para el estancamiento, presenta esa señal bajo la temperatura y evita duplicar programa/oferta.
- La ruta comercial muestra etapas y subetapas; el módulo Pipeline expone las subetapas y sus conteos.
- WhatsApp opera desde **Canales** en una ventana única, centrada y minimizable; no permanece como panel fijo.
- La tarjeta duplicada de Persona fue retirada de la oportunidad: la ficha se abre desde el nombre superior.

### Cierre operativo: salud y gobierno IA

- **Reglas de estancamiento:** `/admin/funnel` administra los umbrales `Lenta` y `Estancada`, bloque recurrente y descuentos por etapa o subetapa. Ficha, Pipeline y copiloto aplican la misma regla con precedencia por subetapa.
- **Ruta comercial:** la ficha prioriza subetapas configuradas como estaciones; verde representa lo recorrido, azul el paso actual y gris lo pendiente.
- **Temperatura:** el puntaje comercial se muestra de forma uniforme en cinco niveles: Muy fría, Fría, Tibia, Caliente y Muy caliente.
- **NaIA:** las sugerencias analizan estado/subetapa, salud, actividad reciente, tareas y consentimientos. Son auditables y no ejecutan acciones automáticamente.
- **Centro de Agentes IA:** navegación y pestañas siguen la secuencia de creación/actualización: gobierno, agente, contexto, fuentes, herramientas, canales, despliegue, simulación, pruebas y publicación.

## 🐛 Troubleshooting

### "No hay datos demo en Supabase"
Las tablas de ofertas están vacías. Se necesita insertar datos demo antes de continuar.

### "Error obteniendo ofertas"
Verificar:
1. Variables de entorno configuradas
2. Conexión a Supabase
3. Permisos RLS en tablas

### Filtros no se aplican
- Los filtros NaIA y manuales se sincronizan mediante `handleFiltersDetected`
- Revisar que los valores coincidan con los datos en Supabase

### Modal no se cierra con Escape
- Verificar que el `useEffect` de manejo de teclas esté activo
- El foco debe estar en el modal o en el documento

## 📄 Licencia

Proyecto privado de BuscoEdu. Todos los derechos reservados.

---

**Versión**: 1.0.0 - Implementación BLOQUE 1-4  
**Fecha**: 2026-08-15  
**Autor**: BuscoEdu Dev Team

## Integración release/e1-postqa (2026-10-18)

Bitácora: 2026-10-18 18:05 (hora Madrid) — se integran en una sola rama desde `main` los commits post-QA de E1: Frontend (F1 barra «Guardar tope», F2 asistente retoma paso desde servidor, «Mostrar más» estable, tipos Abacus), Backend (contrato BA-005 + pruebas, `trackEvent` con columnas reales y `metadatos: {}`, detalle Abacus en Admin IA P4) y BD (solo ops/docs/evidencias de permisos del embudo, cuentas QA y RLS de perfil asesor ya aplicados o preparados; ninguna migración nueva aplicable). El índice BA-005 queda en `supabase/migrations_pendientes/` y **no se aplica** sin OK de Jhon. Conflicto resuelto: lista de pruebas de `npm test` en `package.json` (unión de las de `main` y las nuevas). Verificado con Node 22: `tsc` sin errores, 256/256 pruebas, `next build` OK — para dejar listo un único PR revisable antes del deploy conjunto con WhatsApp — Executor BuscoEdu (bot, integración GitHub) por encargo del Orquestador con OK de Jhon.

Bitácora: 2026-10-19 (hora Madrid) — **qué**: publicación a producción de E1 post-QA (squash de `release/e1-postqa` a `main`, un solo deploy de producción) + configuración de WhatsApp en Vercel Producción: se actualizaron `META_WA_TOKEN`, `META_WABA_ID`, `META_WA_PHONE_NUMBER_ID` (número de prueba +1 555-668-9230, confirmado con Graph API `/{WABA}/phone_numbers`) y `META_APP_SECRET` (validado contra la app BuscoEdu en Meta); `META_WA_VERIFY_TOKEN` ya coincidía y no se tocó (solo nombres, sin valores). Sin cambios en Supabase ni en la configuración del webhook en Meta; el índice BA-005 sigue en `supabase/migrations_pendientes/` sin aplicar. **Por qué**: el `META_APP_SECRET` de Producción no coincidía y todo POST firmado de Meta respondía 401; con esto el webhook `/api/whatsapp/webhook` acepta las entregas firmadas (piloto cerrado intacto: `WA_PILOTO_NUMEROS`, `WA_REAL_HABILITADO=false`, `WA_LEAD_CONVERSION_ENABLED=false`). **Quién**: Backend BuscoEdu (bot), con OK de Jhon vía Orquestador.
