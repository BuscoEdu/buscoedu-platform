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
| 2026-10-19 | Publicación a producción (rama `feat/wa-user-id-fallback`, squash a `main`, un solo deploy) del fallback BSUID + allowlist tolerante + flujo de número compartido; antes del merge se actualizó en Vercel Producción `WA_PILOTO_NUMEROS` (teléfono en E.164 con `+` y `uid:` con el BSUID de Jhon; solo el nombre de la variable); después, una sola plantilla `hello_world` al teléfono del piloto para que Meta vuelva a incluir el número en los webhooks. Sin cambios en Supabase (la propuesta SQL sigue **sin aplicar**) | El mensaje de Jhon llegó sin `from` (nombre de usuario de WhatsApp) y el bot no respondía | Backend BuscoEdu (bot), con OK de Jhon vía Orquestador |
| 2026-10-19 | WhatsApp lote ajustes Ola 1/2 (rama local `feat/wa-copy-v1`, sin push ni deploy): copy Producto v1.3 del flujo en `src/lib/whatsapp/copy.ts` (T01 en 2 mensajes, T02–T08, T10–T24; [FIJO] T06/T14/T23 exactos); STOP y revocación = solo UPDATE con sesión reiniciada (incluido Aplicar) y re-pedir consentimiento con «Hola»/ALTA; consentimiento solo con frases claras + versión `wa-t01-v2-2026-10-19` (se re-pide a quien aceptó la anterior); intenciones (saludo, número 1/2/3, ver más, becas, precio, pregunta abierta, no entendí) y 3 fallbacks distintos; búsqueda sin arrastre de filtros, sin stopwords, con tildes/errores/sinónimos (preescolar → Educación); resultados en UNA lista vía `presentacion.ts` (FE) con N real y agrupados por programa; T13 con timeout de 5 s y errores de resolvers propagados; asesor una vez; nombres con guion/apóstrofo y contador de intentos | QA 19/10 (S1–S20) + consolidado `briefs/consolidado-bot-wa-2026-10-19.md` (C-01…C-58) | Backend BuscoEdu (bot) |
| 2026-10-19 | WhatsApp robustez (misma rama): wamid se libera si el procesamiento falla (reintento de Meta no se pierde; propuesta SQL `estado` pendiente/hecho **no aplicada** en `supabase/migrations_pendientes/20261019180000_…` + deshacer en `supabase/ops/`); control optimista de sesión por `sesion.v` en el jsonb (sin migración); logs `QA_wa_tiempo`/`QA_wa_envio` al ms sin PII; alerta `wa_token_invalido` (código 190, sin token); aliadas por id exacto o, sin `NEXT_PUBLIC_ALIADAS_IDS`, por palabra completa («UNIR» ya no trae «Unired») con aviso `aliadas_ids_ausente`; simulación de preview `WA_SIMULACION=true` (nunca en producción, sin lead, datos con marca QA) + `scripts/wa-simular.mjs` | Pruebas S1–S20 en preview sin tocar WhatsApp real; evidencia Ley 1581 sin DELETE; tiempos medibles para p95 | Backend BuscoEdu (bot) |
| 2026-10-19 | WhatsApp · presentación FE con copy v1.4: página 2+ con cuerpo «Programas {desde} a {hasta} de {N} 👇» (la página 0 conserva T09); fila «Ver más» con descripción «Siguientes {k} de {N} programas» (k = min(8, N − (pagina+1)·8)); ficha con «Más información: {url}» en vez de «Ficha:»; negrita en nombres y acciones (*Ver programas* se queda); el respaldo en texto usa el mismo rango en página 2+. 24 pruebas en `presentacion.test.ts` | Producto aprobó la v1.4 (respuestas a FE): la URL hoy es /explorar?q=…, no la ficha exacta, y «Te muestro k de N» confundía en la página 2 | Frontend BuscoEdu (bot) |
| 2026-10-19 | WhatsApp · presentación FE (`src/lib/whatsapp/presentacion.ts`, reemplaza el stub 2150720 con el mismo contrato): lista T09 en 1 mensaje (cuerpo ≤300 sin URLs, 1 emoji, filas «N. Programa…» ≤24 cortadas por palabra, descripción ≤72 «universidad · modalidad · Bogotá +3 ciudades», 8 programas + «Ver más» solo si `total > (pagina+1)*8`, pie ≤60 con 1 link a Explorar si N > 8), ficha T09b (nombre completo, detalle, T16, T17, 1 URL; [Guardar en Mi lista] [Aplicar] [Ver otros] con ids `lista:` `aplicar:` `menu:volver`) y respaldo nuevo `armarResultadosTexto` (top 3 ≤600). 23 pruebas en `presentacion.test.ts` | Formato FE aprobado por el Orquestador para el lote Ola 1/2 de WhatsApp: que Meta no rechace mensajes por límites y que la lista se lea corta y sin palabras partidas | Frontend BuscoEdu (bot) |
| 2026-10-19 | Integración FE en `feat/wa-copy-v1`: `presentacion.ts` de Frontend (commit 1b69bb1, reemplaza el stub) y el orquestador usa `armarResultadosTexto` de FE como respaldo si la lista falla (top 3 ≤600, «escribe *más*» solo si hay otra página); se retira `textoRespaldoResultados` de BE; 399/399 pruebas | Un solo dueño de la presentación (FE) y el flujo en BE, sin duplicar textos | Frontend BuscoEdu (bot) + Backend BuscoEdu (bot) |

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

Bitácora: 2026-10-19 16:35 (hora Madrid) — **qué**: `obtenerOfertas` (`src/lib/ofertas.ts`) filtra `es_demo=false`; en Vercel Preview (solo rama `feat/wa-copy-v1`) se agregan `NEXT_PUBLIC_ALIADAS_IDS` (4 UUID reales: Poli, Areandina, UNIR, Asturias) y `WA_PILOTO_NUMEROS` con 5 números QA ficticios (solo nombres aquí). Production sin cambios. **Por qué**: BD cargó el catálogo real (291 ofertas visibles, demo ocultas en datos); el filtro es segunda barrera en código y las aliadas pasan de patrón por nombre a id exacto (C-57); QA necesita remitentes limpios sin consentimiento previo. **Quién**: Backend BuscoEdu (bot), con OK de Jhon 16:02/16:18 vía Orquestador.

Bitácora: 2026-10-19 16:40 (hora Madrid) — **qué**: (1) `modelo_negocio` NULL = «sin definir»: el funnel Demo WApp ya no escribe `por_inscrito` por defecto (`src/lib/leadcenter/modelo-negocio.ts`), Lead Center muestra «Sin definir»; (2) puerta de precios para el estudiante (`src/lib/precios-publicos.ts`): un precio con nota `MARCA:` o no validado nunca se muestra (T17 «Precio no disponible»), y `/api/naia` quita campos de precio del contexto; (3) propuesta NO aplicada para quitar `trg_universidad_crea_oportunidad` (`supabase/migrations_pendientes/20261019190000_…` + deshacer en `supabase/ops/`). **Por qué**: decisión de producto (sin modelo no se asume cobro); BD cargó 187 precios pendientes `MARCA:` con monto real; el trigger inserta oportunidades sin `persona_id` (NOT NULL) y rompe toda alta de universidad. Pendiente BD: `fn_convertir_aplicacion` sigue haciendo `coalesce(modelo_negocio,'por_inscrito')` en SQL. **Quién**: Backend BuscoEdu (bot).

Bitácora: 2026-10-19 16:44 (hora Madrid) — **qué**: preparado (NO ejecutado) el alta de los logos de las 4 aliadas reales: `scripts/subir-logos-aliadas.mjs` (Node 22, sin deps; dry-run por defecto sin red, `--aplicar` sube a Storage `logos-aliadas` con `x-upsert` en `{universidad_id}/logo.{ext}` y registra `imagenes_universidad` tipo `logo` insertar-o-saltar; `--sin-bd` deja la tabla a BD), propuesta SQL `supabase/migrations_pendientes/20261019200000_logos_aliadas_imagenes_universidad_propuesta.sql` (mismos ids de fila que el Bloque 3 de BD) y deshacer `supabase/ops/20261019_logos_aliadas_deshacer.sql` (soft-delete `activo=false` + comando Storage). Dry-run: 4/4 OK (poli/logo.svg 25.4 KB, areandina/logo.svg 1.0 KB, unir/logo.svg 7.0 KB, asturias/logo-web.png 8.2 KB). Nada tocó Supabase, Vercel ni GitHub. **Por qué**: BD cargó las 4 aliadas en prod pero el bucket sigue vacío (subir objetos requiere la Storage API con credencial de servicio); la franja del Home solo pinta logos con fila `tipo=logo` activa y `NEXT_PUBLIC_ALIADAS_IDS`. Areandina es solo el símbolo verde: producto decidió símbolo + nombre en texto (lado FE). Aplicar SQL es de BD; ejecutar requiere OK de Jhon. **Quién**: Backend BuscoEdu (bot).

## Bitácora de cambios
| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-17 | SQL carga 4 aliadas (`supabase/ops/20261017_carga_aliadas_4_*`) + `docs/bd/README-carga-aliadas-20261017.md` | Catálogo real (Poli, Areandina, UNIR, Asturias) en lugar de la demo | Base de datos BuscoEdu (bot) |
| 2026-10-19 19:10 (hora Madrid) | Títulos de lista WA a 24 caracteres (FE, opción b: `882a353` + `0594bad`, abreviaturas de Producto v1.5 Esp./Mtría./Tec./Tecnól./Prof.) + activación del número real de WhatsApp (`WA_REAL_HABILITADO=true` en Production, `WA_SIMULACION` fuera de Production, `WA_LEAD_CONVERSION_ENABLED` sigue en false) | OK de Jhon 19:04 vía Orquestador | Backend BuscoEdu (bot) + patches de Frontend BuscoEdu |

Bitácora: 2026-10-19 18:10 (hora Madrid) — **qué**: logos de las 4 aliadas servidos desde `public/logos-aliadas/{universidad_id}.{ext}` (Poli, Areandina, UNIR .svg; Asturias .png); `urlPublicaLogo` (`src/lib/logos-aliadas.ts`) y `logoPintable` (`components/restyle/LogoStrip.tsx`) aceptan rutas locales que empiezan por `/` (nunca `//` de otro dominio) + prueba; se integran a esta rama los commits de BD (carga 17/10 y 19/10 + paquete de prod `5044c81` + SQL de logos `f7c43d6`, no aplicado); conflicto del README resuelto conservando ambas bitácoras. **Por qué**: la clave de servicio de Supabase en Vercel está marcada «Sensitive» y no se puede usar para subir al bucket; decisión del Orquestador: logos dentro del deploy, sin Storage. BD registra después las URL `/logos-aliadas/...` en `imagenes_universidad`. **Quién**: Backend BuscoEdu (bot), con OK de Jhon 17:54 vía Orquestador.

### Familia (`public/familia.html`) · v3
Bitácora: 2026-10-24 — F0 v3: aprobar, cerrar y rechazar una tarea ya no ponen `foto_url`/`foto_2` en null (4 sitios); al devolver se siguen limpiando hasta F1 (`foto_anterior`) — porque la evidencia del hijo se borraba al aprobar y se perdía para el historial — parche de Backend BuscoEdu (bot), aplicado y comentado por Frontend BuscoEdu (bot) con OK de Jhon vía Orquestador. Sin cambios de BD ni deploy (se agrupa por fase).

- 2026-10-24 · Frontend BuscoEdu (bot) · F1 v3: `returnTask` (devolver) copia foto_url/foto_2 a foto_anterior/foto_2_anterior antes de vaciarlas · por qué: conservar la evidencia devuelta (columnas creadas por BD en F1).
- 2026-10-24 · Frontend BuscoEdu (bot) · F3 v3: interfaz nueva dentro de `public/familia.html` (bloque aditivo `FamiliaV3` al final del archivo) que solo se activa si `familia_config.version_app` vale `v3` (o `v2`); sin la clave o con otro valor se ve la v1 igual que hoy. Incluye: deber ≠ tarea, «Descuento» en lugar de «penalización», aprobar con Deshacer 5 s, colores gris/verde/rojo y CTA coral, íconos SVG de línea blanca, lo aprobado sale de la vista del hijo, barra de premios de 20 cuadritos con orden recordado, ranking Semana (domingo 00:00 hora local)/Total y bloque «Administrar familia» dentro de «Yo», crear en 2 pasos con WhatsApp solo al crear, deber vencido «Entendido» → Descontar/Perdonar, tiempo real sin el sondeo de 15 s en modo v3 y lista sin fotos. Escrituras por las RPC de F2 (`familia_rpc_aprobar_tarea`, `_devolver_tarea`, `_aceptar_vencida`, `_descontar_vencida`, `_perdonar_vencida`, `_crear_tarea`). Única línea v1 tocada: el `setInterval` de 15 s ahora se salta si la v3 está encendida. Capturas con datos de ejemplo (mock): `familia-analisis/v3/f3-capturas/`. · por qué: fase F3 del plan v3, probar la cara nueva sin riesgo (vuelta atrás = apagar el interruptor, sin deploy).
- 2026-10-24 · Frontend BuscoEdu (bot) · F3 v3 (ajustes + revisión BE de 5851990): `public/familia-v1.html` = copia byte a byte de `familia.html` en ba84f1c (respaldo F0). En modo v3: canjes por RPC (`familia_rpc_canjear_premio` al aprobar la solicitud del hijo; `familia_rpc_canjear_premio_padre` con `p_client_req_id` = `crypto.randomUUID()` nacido al abrir y reutilizado en reintentos); el hijo pide el premio con una sola fila en `familia_solicitudes_premios`. `loadAll` pide columnas explícitas sin fotos cuando el dispositivo ya sabe que está en v3 (`localStorage.familia_v3_on`); la foto se pide solo al abrir el detalle. «Hoy» filtra por fecha local (regla comentada en `grupoFecha`), los vencidos van a «Vencidos» y lo futuro a «Más adelante». Revisión BE: «Entendido» en aprobadas → `familia_rpc_aceptar_aprobada`; devolver con `p_con_aviso:false`; Descontar/Perdonar también en `pendiente_hijo` (F2c); `comentario_aprobacion` se envía y se muestra; «Ver» en filas viejas; aprobación pendiente se dispara en `pagehide`/página oculta y avisa si falla; admin v3 propio (integrante, premio, PIN, ver como, perfil, salir) sin funciones de la v1. Mesada y «Resetear todo» quedan fuera de la v3 hasta tener RPC. · por qué: pedido del Orquestador y revisión de Backend para F3; v1 sigue igual con el interruptor en v1.
- 2026-10-24 · Frontend BuscoEdu (bot) · F3 v3 (pre-push, revisión BE de 6134ab0): M1 al apagar la v3 se recarga una vez con `'*'` para que la v1 tenga fotos; M2 «Vencidos» solo con estado marcado (`estado_vencida` o `aviso_vencida`), un pendiente con fecha pasada sin marcar se queda en «Hoy»; B3 la aprobación disparada en `pagehide`/página oculta usa `fetch` con `keepalive:true` a `/rest/v1/rpc/familia_rpc_aprobar_tarea` (apikey + Authorization anon); B4 «Ver como» es solo lectura (sin botones de acción); comentario de aprobación con respaldo en `comentario`. · por qué: hallazgos de Backend antes del push.
- 2026-10-24 · Frontend BuscoEdu (bot) · F3 v3 (QA ronda 1): V4 el hijo envía «Ya la hice» + foto desde el detalle (mismo flujo que `submitEvidence` de la v1: una actualización con base64 en `foto_url`/`foto_2` y estado `esperando_aprobacion`); V5b «Mi historial» en «Yo»; V16 si falla la carga de tareas, «Hoy» y «Revisar» muestran el error con «Reintentar» (nunca el estado vacío); V15b «Ver como» oculta «Editar perfil»; V3b el padre puede «Rechazar» (menú ⋯ del detalle, motivo obligatorio) con `familia_rpc_rechazar_tarea(p_tarea_id,p_actor_id,p_motivo,p_client_req_id)` — firma confirmada por BE; se quitó código muerto en `cerrada()` (`estado_vencida` nunca vale 'rechazada'). · por qué: hallazgos de QA en `f3/resultado.md`.
- 2026-10-24 · Frontend BuscoEdu (bot) · Familia v4 Ola 1/3 (rama feat/familia-v4, solo FE, sin RPC nuevas): ajuste 1 pestaña Ranking en la barra (lista solo hijos) y fuera de «Yo»; ajuste 2 columnas Ganados · Canjeados · Descuentos · Saldo con `kidLedger` de la v1, orden por Ganados y medallas de la v1; ajuste 3 ficha con nombre, tipo, Inicio/Fin/Cierre (`windowBlock`/`closedAt`) y franja con el color del hijo; ajuste 4-5 cabecera de la v1 (avatar, nombre, rol, frase, pts, campana de avisos) y paleta gris/verde/amarillo/naranja suave/rojo solo vencida; motivo de devolución en la tarjeta del hijo; zona horaria del navegador guardada en el dispositivo (`localStorage.familia_tz`). Reconexión de la v1 dentro de la v3 (sus mismas funciones y escrituras): ficha completa para editar/eliminar, panel con la sección de tareas de la v1 (filtros, plantillas, borradores, validar), crear completo (`openNueva`), panel de premios (editar, apagar, lista base), historial de canjes, metas, saldo detallado, perfil completo, campana, chat, medallas, rechazar premio pedido, deberes del ciclo, descuento manual, solicitar tarea y pasar a un hermano. · por qué: plan `familia-analisis/v4/plan-ajustes.md`. v1 y `familia-v1.html` sin cambios.
- 2026-10-24 · Frontend BuscoEdu (bot) · Familia v4 Ola 1/3 (respuestas del Orquestador): ranking con conciliación en «Total» (Ganados − Canjeados − Descuentos + «Otros ajustes (mesada, manual)» = Saldo real `miembros.puntos`; si aún no cuadra, se muestra «Diferencia sin registro en el historial», sin maquillar); zona horaria del navegador guardada en `familia_miembros.zona_horaria` solo del miembro actual, solo si cambió (no en «Ver como»), con caché en `localStorage`; «Ver como» deja en solo lectura los paneles y modales de la v1 (botones apagados + guarda en las funciones de la v1 que escriben). · por qué: decisiones sobre f8f8bd5.
- 2026-10-24 · Frontend BuscoEdu (bot) · Familia v4 Ola 2 (FE): RPC de la guía `v4/guia-FE-rpc-v4.md` conectadas en la v3/v4 — `familia_rpc_crear_lote` (hoja «Tarea repetitiva», sin `p_zona`: el servidor usa miembro → config → Europe/Madrid), `familia_rpc_traspaso_pasar/aceptar/rechazar/aprobar` (detalle del hijo, Hoy del hermano destino y «Revisar» del padre) y `familia_rpc_rechazar_premio` (reemplaza el `rejectPrize` de la v1 en la bandeja). Mesada, mesada pendiente y «Resetear todo» quedan AISLADAS tras `V4_PROVISIONAL=false` (TODO: guía de BE no final). En modo v3/v4 todas las lecturas de tareas e historial filtran `archivada_en IS NULL` (loadAll, reintento, ranking completo, foto del detalle); modo v1 sin cambios. Toda escritura nueva: guarda «Ver como», `client_req_id` por intención, error visible. · por qué: Ola 2 del plan v4.
- 2026-10-24 · Frontend BuscoEdu (bot) · Familia v4 Ola 2 (guía final rev.2): mesada, mesada pendiente y «Resetear todo» activados (se quitó `V4_PROVISIONAL`); el reset muestra el resumen de tareas/historial/integrantes archivados; `crear_lote` sin `p_zona` ni `p_icono` (defaults de la BD) y muestra la `zona` usada; `p_inicio` en ISO UTC; «Pasar a un hermano» con la misma condición que la v1 (pendiente, hijo dueño, no transferencia, ventana lista); contadores y totales sin filas archivadas (purga en memoria si la primera carga llegó sin filtro). · por qué: guía final de BE y respuestas del Orquestador.
- 2026-10-24 · Frontend BuscoEdu (bot) · Familia v4 Ola 2 (campana + vista previa): en modo v3/v4 la campana oculta y no cuenta los avisos cuya tarea no está en la lista cargada (archivada o eliminada); «Tarea repetitiva» tiene «Ver fechas (estimado)» con fechas/horas y a quién le toca según repetición y reparto (cálculo local igual a `projectSlots` de la v1; la BD sigue siendo la fuente real). · por qué: pedido del Orquestador tras c6b0cde.
- 2026-10-24 · Frontend BuscoEdu (bot) · Familia `ventana_horas` entera: en `public/familia.html` los 3 `Math.max(0.25, X)` sobre la ventana (crear tarea, valor de la ficha y guardar ficha) pasan a `Math.max(1, Math.ceil(X))`. · por qué: BD confirmó que `ventana_horas` es integer en prod; un decimal fallaba o se truncaba. `familia-v1.html` sin tocar.
- 2026-10-24 · Frontend BuscoEdu (bot) · Familia v4 fix QA (PR #73): F1 `zona_horaria` se escribe 1 vez por sesión (sessionStorage), solo si cambió, máx. 1 reintento y solo en la fila del miembro que inició sesión (nunca en «Ver como» ni a otro); 2b Ranking Total con columnas tipadas (`tipo`/`pts`, texto como respaldo) y columna «Mesada»: Ganados + Mesada − Canjeados − Descuentos + Otros = Saldo (los descuentos de deber entran en Descuentos); 4b sin «Descuento −N» fantasma (0/null no se muestra; el default viejo solo cuenta en deberes); 6b mesada sin destinatario por defecto (hay que elegir) y «Nuevo premio» abre en «Hijos»; F2 tarea devuelta (estado pendiente + motivo) muestra «Devuelta» en naranja #b45309 con el motivo. · por qué: 5 FAIL de QA en `v4/qa/resultado.md`.
- 2026-10-24 · Frontend BuscoEdu (bot) · Familia v5 Ola 1 (rama feat/familia-v5 desde 72364b8 = prod 0d6cd56): 1 «Solicitar tarea» y «Para un hermano» en Hoy del hijo; 2/D2 Solicitar propio de la v3 sin deberes (si llegara un deber se guarda como deber, 0 pts); 3+8/D1 «Editar tareas» y «Catálogo» (plantillas, modo Definiciones de la v1) en Administrar familia; 4 sin Metas/Chat/Medallas (datos intactos); 5 Administrar en 2 columnas con nombres cortos y Resetear en rojo a lo ancho; 6/D3 3.er renglón de la tarjeta con Abre y Cierra; 7 Ranking solo Saldo y Ganado con nombres grandes (medallas se quedan, D6); 9 CTA morado de la app, rojo solo Resetear/vencido; 10 «Perdonada» visible en el saldo (por tipo 'perdon'); 11 Perdonar con una confirmación «¿Perdonar a X: tarea?»; 13 confirmación al pedir premio y «X pide: premio» con Aceptar/Rechazar; 14 descuento manual guarda `tipo='descuento'` y `pts=-N`; extras: Penalización/Atraso tipados van a Descuentos, la cabecera recarga puntos al volver el foco (máx. 1 cada 10 s), «guardar como plantilla» ya no avisa «Por activar» en modo v3/v4. «Ver como» sigue solo lectura (D4). · por qué: pedidos de Jhon `v5/ajustes-jhon.md` y plan `v5/plan-v5.md`.
- 2026-10-24 · Frontend BuscoEdu (bot) · Familia v5 ítem 15: ícono por tipo al inicio de cada movimiento en «Mi historial» y en el saldo detallado del ranking (solo con la v3 encendida; la v1 se ve igual). Mapa con `claseMov` (tipo/pts; texto solo en filas viejas): tarea ✓ verde, deber escudo índigo, descuento − rojo, premio regalo ámbar, mesada moneda verde azulado, perdón/traspaso/otros punto gris. Ícono de 26 px fijo (`flex:0 0 26px`) para no romper 390/360. · por qué: pedido de Jhon.
- 2026-10-24 · Frontend BuscoEdu (bot) · Familia v5 ítem 16: el título del ranking dice solo «Ranking» (se quitó «(hijos)» en la vista v1 y en la v3/v4/v5). · por qué: pedido de Jhon.
- 2026-10-24 · Frontend BuscoEdu (bot) · Familia v5 ítems 17–18: (17) cada botón que escribe (aprobar, devolver, rechazar, crear/editar tarea-deber-premio, descuento, mesada, premios, solicitar, traspasos, catálogo, repetitiva, integrante, PIN, perfil, metas, mensajes) pide UNA confirmación con nombre, qué y pts; Cancelar no cambia nada; donde ya había confirmación no se agregó otra. (18) toda hoja de la v3/v4/v5 (incl. «Tarea repetitiva» en Yo/Administrar) abre con «← Volver» arriba. · por qué: pedido de Jhon.
- 2026-10-24 · Frontend BuscoEdu (bot) · Familia v5 ítem 19 + ajuste 17: «Tarea repetitiva» tiene selector Tipo Tarea/Deber (deber = 0 pts y descuento si se vence; usa la misma `familia_rpc_crear_lote` con `p_clase`, sin cambios de BD); confirmación «¿Crear el deber repetitivo…?»; el historial muestra el ícono de deber también en deberes de 0 pts. Pedir premio (v3–v5): se revisa el duplicado antes de la confirmación. · por qué: pedido de Jhon.
- 2026-10-24 · Frontend BuscoEdu (bot) · Familia v5 ítem 20 (ajusta 19): «Crear», «Crear completo» (desde la v3/v4/v5) y «Tarea repetitiva» son solo de tareas (se quitó el selector Tarea/Deber de ítem 19). Administrar → «Deberes» abre su propio flujo en orden: 1) nuevo deber (crear en 2 pasos, clase deber), 2) deber repetitivo hasta fin de mes con reparto al azar (misma `familia_rpc_crear_lote`, `p_clase` deber, sin cambios de BD), 3) deberes base de la v1. Inmediata: sin campo de hora (abre al crearla) y la tarjeta dice «Abre: ahora» mientras está abierta. Se mantiene el ajuste de pedir premio (duplicado antes de confirmar). Confirmación de ítem 17 y «← Volver» de ítem 18 en las hojas nuevas. · por qué: pedido de Jhon.
- 2026-10-24 · Frontend BuscoEdu (bot) · Familia v5 ítem 21: la etiqueta visible «Inmediata» pasa a «Obligatoria» (selectores Tipo, filtros, tarjeta, revisión, pantalla de bloqueo, ayuda «Hay que hacerla ya: bloquea la app mientras dura y, si no se hace, resta puntos.»); en la BD siguen `inmediata` y `tipo='inmediata'`. · por qué: pedido de Jhon.
