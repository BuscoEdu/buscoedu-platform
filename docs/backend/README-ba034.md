# BA-034 — Capa IA multiproveedor (AI SDK de Vercel + Abacus propio)

> Épica **E1 · IA multiproveedor**, Ola 2/4. Dueño: Backend.
> Brief: `buscoedu-knowledge/briefs/e1-ia-multiproveedor.md`, criterios A, B y C. BA-034 cubre C2–C5, B5 y la lista permitida de URLs; la parte de backend de A2, A3, A6 y A7 queda lista para BA-036.
> Decisiones de Jhon en `centro-control-wa-decisiones.md`:
> - **12**: usar la librería de IA de Vercel como base.
> - **13**: NaIA sigue con Abacus mientras se prueban otros modelos.
> - **19**: claves en Vault.
> - **22**: el respaldo es opcional.
>
> Rama local `feat/e1-integra`. Sin push, sin deploy y sin migraciones aplicadas.

## 1. Qué se hizo y para qué sirve

| Pieza | Qué hace | Para qué |
|---|---|---|
| `lib/agentes/llm/tipos.ts` | Petición, respuesta, adaptador y despliegue comunes (spec §8.1) | Que todos los proveedores hablen igual |
| `llm/adaptadorAbacus.ts` | Envuelve `AbacusAdapter` **sin cambiar su contrato ni su entrada** | Decisión 13 y B5: NaIA sigue en Abacus, byte a byte igual |
| `llm/adaptadorAiSdk.ts` | `generateText` del AI SDK (`ai`) con OpenAI, xAI, Anthropic, Gemini u OpenAI-compatible (OpenRouter, Groq…) | Decisión 12: sumar proveedores sin un cliente por cada uno |
| `llm/proveedores.ts` | Presets del asistente (A2), **lista permitida de URLs en código**, nombres de variables de entorno permitidos (`LLM_*`, `ABACUS_NAIA_*`) y validación fail-closed del despliegue | Que la clave nunca salga hacia una URL ajena; rechazar todo lo desconocido |
| `llm/claves.ts` + `llm/supabase.ts` | Clave: **Vault** con la RPC `fn_ia_leer_clave(p_proveedor_codigo text) → text` (BA-035) → **variable de entorno** de respaldo → `sin_clave`. Caché de 60 s | Rotar claves sin redeploy (decisión 19) sin romper lo que hoy vive en Vercel |
| `llm/motor.ts` | Cadena principal → respaldos, circuito, reintento de formato, mensaje C3 y costo por intento | C2–C5: el estudiante nunca queda en silencio |
| `llm/circuito.ts` | 3 errores seguidos saltan el despliegue 5 min (umbral y minutos son parámetros) | C4 |
| `llm/costo.ts` | Un registro por intento: tokens, costo con versión de precio, latencia y resultado. **Si falla, se avisa y la respuesta sigue** | Base del tope diario (BA-038) |
| `llm/probar.ts` | Prueba de conexión con mensaje fijo (✓/✗, latencia, modelo, motivo sencillo) y regla «Primero prueba la conexión» | A6 y A7, listas para el endpoint de BA-036 |
| `AgenteExecutor.ts` | La llamada al modelo pasa por el motor. Lee el proveedor del despliegue y los respaldos de `configuracion_snapshot.despliegues_respaldo_ids` (opcional) | Integrar sin cambiar la entrada de Abacus |
| `errores.ts` (`ErrorSinIa`) + `/api/naia` + Demo WApp | Si ningún modelo responde, el estudiante recibe el texto exacto de C3; en Demo WApp además `requiere_escalamiento: true` | C3: nunca silencio ni respuesta inventada |

### Cómo se comporta
- **Hoy (solo Abacus, sin respaldos):** una sola llamada a `AbacusAdapter.ejecutar` con los mismos parámetros que antes. Mismo prompt, mismo mensaje, mismo `conversation_id`, mismas referencias de entorno y misma temperatura. El texto plano del principal se sigue aceptando como antes; solo los respaldos validan el formato.
- **Abacus y Vault:** si `fn_ia_leer_clave('abacus_ai')` devuelve un token, viaja como `token_despliegue`, un parámetro opcional nuevo de `AbacusAdapter`. Si no hay token o la RPC falla (BA-035 sin aplicar), `AbacusAdapter` lee su variable de entorno como siempre.
- **Por qué Abacus no usa el AI SDK:** no tiene proveedor oficial en el AI SDK, y su endpoint conversacional (`getConversationResponse`, con hilo propio) no es compatible con OpenAI. Por eso queda como adaptador propio, como dice la spec §8.2.
- **Respaldos (stateless):** reciben el prompt de sistema completo (`sistema_completo`) también en el turno 2+, para no perder identidad ni reglas. No ven el historial del hilo de Abacus, solo el bloque de sesión del turno.
- **Fail-closed:** antes de llamar se descarta un despliegue si:
  - el proveedor es desconocido;
  - el proveedor o el despliegue están apagados;
  - falta el modelo;
  - la URL no está en la lista o no es https;
  - no hay clave;
  - el nombre de la variable de entorno no está permitido (no se puede apuntar a `SUPABASE_SERVICE_ROLE_KEY`).

  Si ningún despliegue queda en pie, se aplica C3.
- **C1 (apagar ≤ 60 s sin redeploy):** el executor lee `activo` del proveedor y del despliegue de la BD en cada mensaje. La pantalla con el aviso de impacto es de BA-036.
- **Errores:** se traducen a tipos estables: `timeout`, `limite_tasa`, `autenticacion`, `sin_saldo`, `servidor`, `respuesta_invalida`, `sin_clave`, etc. Ningún error, log ni registro lleva la clave ni el texto del estudiante.

## 2. Costo por llamada

- La BD no tenía tabla de costo; d150165 no la creó. Hace falta una porque un turno puede tener varios intentos (respaldo, reintento C5). `ejecuciones_agente_ia` no se toca: es por turno y alimenta la memoria de sesión.
- Migración nueva **no aplicada**: `supabase/migrations/20261018130000_ba034_registros_costo_ia.sql`, tabla `registros_costo_ia`. RLS: la lee solo super_admin y el cliente no escribe. Para deshacerla: `supabase/ops/20261018_ba034_deshacer.sql` (`DROP TABLE IF EXISTS public.registros_costo_ia`).
- **Precios:** no hay tabla de precios versionados. Se leen de `despliegues_ia.configuracion_tecnica`: `costo_usd_1k_entrada`, `costo_usd_1k_salida` y `precio_version`. Sin precios, el costo queda en null; no se inventa. Una tabla de precios propia queda pendiente para BA-038/BD.
- **Abacus no informa tokens:** se estiman a razón de unos 4 caracteres por token y quedan marcados `tokens_estimados = true`.
- **Si la tabla no existe:** se escribe un aviso `[BA-034 costo] … la respuesta sigue` y el estudiante recibe su respuesta.
- **En la bitácora de ejecuciones:** cuando responde un respaldo, `ejecuciones_agente_ia` guarda el `despliegue_id` real y `respuesta.ia.evento = 'despliegue_respaldo_usado'`. Si no responde nadie, queda `estado = 'error'` con `error = 'error_bot:<tipo>'`.

## 3. Dependencias npm añadidas (versiones exactas)

`ai@7.0.143`, `@ai-sdk/openai@4.0.96`, `@ai-sdk/openai-compatible@3.0.71`, `@ai-sdk/anthropic@4.0.82`, `@ai-sdk/google@4.0.99`, `@ai-sdk/xai@5.0.24` y `zod@4.6.7` (dependencia par que exige `ai`). Todas se instalaron desde el registro npm.

## 4. Tests

`lib/agentes/llm/ba034-capa-ia.test.ts` tiene 29 tests y ya está en `npm test`. Usa `MockLanguageModelV4` de `ai/test` y dobles de Abacus, Vault y env; no necesita red ni BD. Cubre:
- regresión E2/B5 (5 preguntas × web/whatsapp × turno 1/2+ → misma entrada a Abacus);
- adaptador AI SDK, traducción de errores y fábrica real para los 5 tipos;
- fail-closed y lista de URLs;
- claves Vault → env → error, con caché;
- C2, C3, C4 (con y sin respaldo) y C5;
- costo (éxito, fallo no bloqueante y tokens estimados);
- A6 y A7.

Prueba de mutación: si se cambia un carácter del mensaje que recibe Abacus, el test de regresión falla.

## 5. Riesgos y pendientes

- **El circuito vive en memoria del proceso:** en serverless cada instancia lleva su propia cuenta.
- **Desde el deploy:** con un solo Abacus y sin respaldo, 3 errores seguidos dan 5 min de mensaje C3 sin llamar a Abacus. Antes se reintentaba en cada mensaje. Lo pide el brief (C4), pero cambia lo que se ve cuando Abacus está caído.
- **Mensaje de fallo en `/api/naia`:** si Abacus falla, el estudiante ahora ve el texto de C3 en lugar de «Se me enredó…». Solo cambia el camino de error.
- **Proveedor fail-closed:** si en prod la fila `proveedores_ia` de `abacus_ai` estuviera apagada o archivada, NaIA respondería C3. En la semilla está activa; conviene verificarlo antes del deploy.
- **Select ampliado:** el executor ahora lee `despliegues_ia.modelo` y `proveedores_ia(codigo, activo, estado)`. Son columnas de la migración base, pero conviene confirmarlo en prod.
- **Lecturas extra:** la RPC de Vault suma una consulta cada 60 s por proveedor, y el registro de costo un insert por intento, que se espera antes de responder.
- **Fuera de alcance:** UI de A1–A9, B1–B4 y C1 (BA-036/037), tope de gasto D (BA-038), endpoints de guardar, probar y encender, y `contexto_excedido` con recorte o modelo mayor.
- **Sin verificar con proveedores reales:** no se probó ninguna llamada real (sin red ni claves). `next build` local pasa (2026-10-18). Antes del deploy agrupado queda pendiente QA con Abacus real.

## 6. Bitácora

| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 | Rama `feat/e1-integra`: merge de `d150165` (BD E0/BA-040/BA-035, ya contiene `ba536d6` y `708a928` de `feat/wa-meta`) sobre BA-039. El conflicto en el script `test` de `package.json` se resolvió conservando todos los tests | Integrar el trabajo de BD y WhatsApp antes de la capa IA | Backend BuscoEdu (bot) |
| 2026-10-18 | Capa IA `lib/agentes/llm/` (AI SDK + Abacus propio, respaldo, circuito, formato, C3, claves Vault → env, costo) integrada en el executor y en `/api/naia` y Demo WApp | Criterios C2–C5 y B5, decisiones 12 y 13 | Backend BuscoEdu (bot) |
| 2026-10-18 | Migración `20261018130000_ba034_registros_costo_ia.sql` (no aplicada) y su deshacer | Registrar costo por intento para BA-038 sin tocar `ejecuciones_agente_ia` | Backend BuscoEdu (bot) |
