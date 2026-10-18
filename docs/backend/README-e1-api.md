# E1 · Ola 3/4 · Contrato API admin de IA (BA-036 + BA-037 + BA-038 parte API)

**Fecha:** 2026-10-18 · **Autor:** Backend BuscoEdu (bot) · **Estado:** FASE 1 = solo contrato. **Ningún endpoint nuevo está implementado todavía.** Rama local `feat/e1-integra`, sin push.
**Spec:** `buscoedu-knowledge/briefs/e1-ia-multiproveedor.md` (A1–A9, B1–B4, C1, D1–D8) · `ux-panel-roles.md` §3 · `centro-control-wa-spec.md` §8.4–8.5, §9, §10.5.
**Base ya hecha:** BA-034 (capa IA `lib/agentes/llm/`), BA-035 (Vault), BA-038 BD (`20261018140000`, contrato v2: commits b4cf029, 081ba33, f590fd6).

## Qué es y para qué sirve
- **Qué:** el contrato de todas las rutas `/api/admin/ia/...` que Frontend necesita para cuatro cosas:
  - el asistente «Agregar proveedor» y la pantalla Proveedores;
  - el modelo principal y los respaldos de cada agente;
  - el tope de gasto diario;
  - las alertas.
- **Para qué:** que Frontend construya las pantallas en paralelo sin adivinar campos ni errores, y que Base de datos sepa qué le falta crear (sección final).

---

## 0. Reglas comunes a todos los endpoints

| Tema | Regla |
|---|---|
| Rol | **Solo `super_admin`** (A9; `ux-panel-roles.md` P9 y §3.12). Se reutiliza `requireSuperAdminApi()` (`src/lib/admin/require-super-admin-api.ts`): sesión de Supabase → `usuarios_internos` activo → `roles.codigo = 'super_admin'`. Sin sesión o con otro rol → **403** `forbidden` (hoy no se distingue 401; se mantiene). Los roles `admin`, `asesor` y `supervisor` no entran a este módulo en E1 |
| Formato de éxito | `{ "ok": true, ... }` |
| Formato de error | `{ "ok": false, "error": "<codigo>", "mensaje": "<español sencillo>", "campo"?: "<campo del formulario>", "detalles"?: {...} }`. Frontend muestra `mensaje` junto a `campo` cuando viene (A5: el error va junto al campo). Las rutas genéricas que ya existen solo devuelven `error`; las nuevas o ampliadas agregan `mensaje` |
| Claves | **Ninguna respuesta incluye una clave, ni siquiera enmascarada** (A3). El body con `clave` no se registra en logs. Los errores de Vault devuelven solo el código y el `sqlstate` |
| Escrituras | Siempre con el cliente `service_role` en el servidor, después de verificar super_admin. Toda función de BD recibe `p_actor_usuario_id = usuarios_internos.id` |
| Tiempo | Fechas en ISO 8601 con zona. El «día» del gasto es el día calendario de **America/Bogota** (UTC−5, sin horario de verano): `dia_bogota = 'YYYY-MM-DD'`, reinicio a las 00:00 de Bogotá (D7) |
| Dinero | USD como número JSON. Topes con 2 decimales; gasto y costos con hasta 6 |
| Efecto sin redeploy | El motor lee proveedor, despliegue, versión y tope desde la BD en cada mensaje. Las claves se guardan en caché 60 s. Todo cambio aplica en ≤ 60 s (C1, D1, D7) |
| Borrado | Nunca DELETE físico. «Archivar» = `activo = false`, igual que en `admin-crud.ts` |
| Bitácora | Toda escritura deja quién, cuándo y qué cambió (A4, D1, UX §3.14). Ver §6 y «Necesidades de BD» |

Vocabulario:
- **proveedor** = fila de `proveedores_ia`.
- **modelo** = fila de `despliegues_ia` (proveedor + identificador de modelo + parámetros).
- **encendido** = `estado = 'activo'` y `activo = true`. **apagado** = `estado = 'inactivo'`. El motor de BA-034 ya trata como no disponible todo lo que no esté encendido (fail-closed).

### 0.1 Estados que ve el panel (P5: «configurado» no es lo mismo que «en uso»)

| `estado_panel` | Regla |
|---|---|
| `borrador` | Proveedor creado en el asistente, todavía sin clave o sin modelos |
| `configurado` | Tiene clave y al menos un modelo, pero ninguna prueba vigente exitosa |
| `probado` | Hay al menos un modelo con prueba vigente exitosa y está apagado |
| `encendido` | Encendido y con prueba vigente exitosa |
| `error` | La última prueba falló, o el circuito está abierto (`salud.circuito_abierto_hasta`) |

**Prueba vigente** = la última prueba del modelo fue exitosa **y** es posterior a todos estos cambios:
- el último cambio de modelo, URL o parámetros que afectan la conexión (`despliegues_ia.config_actualizada_en`);
- el último cambio de URL del proveedor;
- el último guardado o reemplazo de clave (`proveedores_ia.clave_actualizada_en`).

Además, la clave no puede estar revocada. Cambiar la clave o el modelo exige probar de nuevo antes de encender (A7).

### 0.2 Impacto (C1). Mismo objeto para modelo, proveedor y revocación de clave

```json
{
  "impacto": {
    "objetivo": { "tipo": "despliegue", "id": "uuid", "nombre": "xAI · grok-4" },
    "agentes_afectados": 3,
    "agentes_sin_ia": 1,
    "mensaje": "3 agentes lo usan; 1 quedaría sin IA.",
    "agentes": [
      { "agente_id": "uuid", "agente_codigo": "naia", "agente_nombre": "NaIA",
        "version_id": "uuid", "numero_version": "v7", "rol": "principal",
        "queda_con": { "despliegue_id": "uuid", "nombre": "Abacus NaIA" } },
      { "agente_id": "uuid", "agente_codigo": "postventa", "agente_nombre": "Postventa",
        "version_id": "uuid", "numero_version": "v2", "rol": "principal", "queda_con": null }
    ],
    "borradores_afectados": 2,
    "impacto_hash": "sha256:…"
  }
}
```

**Cómo se calcula:**
1. Se recorren las versiones **publicadas** (`agentes_ia.version_activa_id`) y se toman `configuracion_snapshot.despliegue_id` (principal) y `configuracion_snapshot.despliegues_respaldo_ids` (respaldos), que es la clave que usa BA-034.
2. Un agente queda «sin IA» si, con el cambio aplicado, ni su principal ni ninguno de sus respaldos queda encendido.
3. `queda_con` es el primer modelo encendido que le queda, en el orden del snapshot.
4. No se consideran el circuito ni el tope, porque son estados temporales.
5. Los borradores no afectan a estudiantes: solo se cuentan en `borradores_afectados`.

`impacto_hash` es un hash del conjunto de afectados. Sirve para confirmar exactamente lo que el admin vio. Si el impacto cambió entre ver y confirmar, la API pide confirmar de nuevo.

---

## 1. Proveedores (BA-036: A1–A9, C1)

| # | Método y ruta | Nueva / existente | Criterios |
|---|---|---|---|
| P1 | `GET /api/admin/ia/proveedores/presets` | nueva | A1, A2 |
| P2 | `GET /api/admin/ia/proveedores` | existente, se amplía | A3, A9, C1, UX §3.8 |
| P3 | `POST /api/admin/ia/proveedores` | existente, se reemplaza el CRUD genérico | A1, A2, A8 |
| P4 | `GET /api/admin/ia/proveedores/[id]` | existente, se amplía | A3, A4, A8, UX §3.14 |
| P5 | `PATCH /api/admin/ia/proveedores/[id]` | existente, se restringe | A2, A8 |
| P6 | `PUT /api/admin/ia/proveedores/[id]/clave` | nueva | A3, A4 |
| P7 | `POST /api/admin/ia/proveedores/[id]/clave/revocar` | nueva | A4, C1 |
| P8 | `GET /api/admin/ia/proveedores/[id]/impacto` | nueva | C1 |
| P9 | `POST /api/admin/ia/proveedores/[id]/encender` | nueva | A7 |
| P10 | `POST /api/admin/ia/proveedores/[id]/apagar` | nueva | C1 |
| — | `DELETE /api/admin/ia/proveedores/[id]` | existente | archivado lógico; con el contrato de confirmación de P10 |

### P1 · `GET /api/admin/ia/proveedores/presets`
Lista fija del código (`PRESETS_PROVEEDOR` y `URLS_PERMITIDAS` en `lib/agentes/llm/proveedores.ts`). Frontend la usa en el paso «Elegir» con la URL en solo lectura.
```json
{ "ok": true, "items": [
  { "codigo": "openai", "nombre": "OpenAI", "tipo_adaptador": "openai",
    "url_base": "https://api.openai.com/v1", "urls_permitidas": ["https://api.openai.com/v1"],
    "url_editable": false, "variable_env_sugerida": "LLM_OPENAI_API_KEY",
    "ayuda": { "por_que": "Cada proveedor habla distinto…", "para_que": "Evitar errores y URLs peligrosas" } },
  { "codigo": "otro_compatible", "nombre": "Otro compatible con OpenAI", "tipo_adaptador": "openai_compatible",
    "url_base": null, "urls_permitidas": ["https://openrouter.ai/api/v1", "…"], "url_editable": true }
] }
```
Los presets son: `abacus_ai`, `openai`, `xai`, `anthropic`, `google`, `openrouter` y `otro_compatible`.

### P2 · `GET /api/admin/ia/proveedores`
- **Query opcional:** `?incluir_archivados=true`.
- Por defecto devuelve los que tienen `activo = true`, incluidos los borradores del asistente.
```json
{ "ok": true, "items": [{
  "id": "uuid", "codigo": "xai", "nombre": "xAI (Grok)", "preset_codigo": "xai",
  "tipo_adaptador": "xai", "url_base": "https://api.x.ai/v1",
  "estado_panel": "probado", "encendido": false,
  "clave": { "configurada": true, "origen": "vault", "actualizada_en": "2026-10-18T14:00:00-05:00", "revocada_en": null },
  "ultima_prueba": { "exitosa": true, "vigente": true, "latencia_ms": 820, "modelo_respondio": "grok-4", "probado_en": "…" },
  "salud": { "circuito_abierto_hasta": null },
  "modelos": 2, "usado_por": { "principal": 0, "respaldo": 1 },
  "asistente": { "paso": 5, "completo": false },
  "actualizado_en": "…"
}] }
```
- `clave` sale de `fn_ia_estado_clave(codigo)` (BA-035) y nunca trae el valor.
- `salud` viene del circuito en memoria de BA-034. Es por instancia del servidor y orientativo (ver Riesgos).

### P3 · `POST /api/admin/ia/proveedores` (paso 1 «Elegir»)

| Campo | Tipo | Validación |
|---|---|---|
| `preset_codigo` | string | Obligatorio; uno de P1 |
| `codigo` | string | Opcional. Por defecto, el del preset. `^[a-z0-9_]{3,40}$`, único. Obligatorio si el preset es `otro_compatible` |
| `nombre` | string | 1–80 caracteres. Por defecto, el del preset |
| `url_base` | string | Solo para `otro_compatible`: https y dentro de `urls_permitidas`. En los demás presets se ignora y se usa la del preset |
| `descripcion` | string | Opcional, ≤ 500 |

**Efecto:**
- Crea el proveedor **apagado** (`estado = 'inactivo'`, `origen_secreto = 'env'` hasta que se guarde una clave en Vault), con `asistente.paso = 2`.
- Es **201** `{ ok, item }`, con la forma de P2.

**Errores:**

| HTTP | Código | Mensaje |
|---|---|---|
| 400 | `preset_invalido` | Elige un proveedor de la lista. |
| 400 | `codigo_invalido` | El código solo admite minúsculas, números y _ (3 a 40). |
| 400 | `url_no_permitida` | Esa URL no está en la lista permitida. Por seguridad la clave solo se envía a proveedores conocidos. |
| 409 | `codigo_existente` | Ya existe un proveedor con ese código. |

En `codigo_existente`, `detalles.id` trae el id del proveedor existente para que Frontend retome su asistente.

**Idempotencia:** el código es único, así que repetir el POST no duplica: responde 409 `codigo_existente` con el id.

### P4 · `GET /api/admin/ia/proveedores/[id]`
Devuelve la forma de P2 más:
- `modelos[]`: forma de M1.
- `bitacora[]`: los últimos 50 eventos, uniendo `bitacora_claves_ia` (guardar, reemplazar o revocar clave) y la bitácora de configuración (§6). Cada evento: `{ accion, actor: { id, nombre }, creado_en, valor_anterior?, valor_nuevo? }`, siempre sin la clave.
- `asistente`: `{ paso: 1-5, borrador: {...} }` (A8).

Error: 404 `no_encontrado` · «No encontramos ese proveedor.».

### P5 · `PATCH /api/admin/ia/proveedores/[id]`

**Campos editables:**
- `nombre`, `descripcion`.
- `url_base`: solo `otro_compatible`, misma validación que P3.
- `asistente`: `{ paso: 1-5, borrador: object ≤ 16 KB }`.

**Reglas:**
- `asistente.borrador` se guarda tal cual para retomar el asistente (A8). El servidor **rechaza** cualquier clave de objeto llamada `clave`, `api_key`, `token`, `secret` o `password`, a cualquier profundidad: 400 `borrador_con_clave` · «La clave no se guarda en el borrador; usa el paso Clave.».
- Cambiar `url_base` invalida las pruebas de todos sus modelos.
- **No editables aquí:** `codigo`, `estado`, `activo` y la clave. Si llegan: 400 `campo_no_editable` · «Ese dato se cambia con su botón (Encender/Apagar o Clave).».
- Con el proveedor encendido, `url_base` no se puede cambiar: 409 `apaga_antes_de_cambiar_url` · «Apaga el proveedor antes de cambiar la URL.».

**Idempotencia:** el mismo valor responde 200 con `sin_cambios: true` y no deja fila en la bitácora.

### P6 · `PUT /api/admin/ia/proveedores/[id]/clave` (paso 2 «Clave», A3, y «Reemplazar», A4)
- **Body:** `{ "clave": string }`. La BD exige 8–4096 caracteres después de recortar espacios.
- **Efecto:**
  - `rpc('fn_ia_guardar_clave', { p_proveedor_codigo, p_clave, p_actor_usuario_id })` (BA-035).
  - El proveedor pasa a `origen_secreto = 'vault'` y se deja la fila `guardar` o `reemplazar` en `bitacora_claves_ia`.
  - Invalida las pruebas de todos sus modelos.
  - El valor solo vive en memoria durante la petición.
- **Respuesta 200:**
  ```json
  { "ok": true, "accion": "guardar", "clave": { "configurada": true, "origen": "vault", "actualizada_en": "…" } }
  ```

**Errores:**

| HTTP | Código | Mensaje |
|---|---|---|
| 400 | `clave_requerida` | Pega la clave del proveedor. |
| 400 | `clave_invalida` | La clave es demasiado corta o demasiado larga. |
| 404 | `proveedor_inexistente` | No encontramos ese proveedor. |
| 500 | `error_guardar_clave` | No pudimos guardar la clave. Intenta de nuevo. |

En `error_guardar_clave` solo viaja `detalles.sqlstate`.

**Idempotencia:** guardar otra vez es un «reemplazar»: deja otra fila en la bitácora y obliga a probar de nuevo.

**Aviso para el panel:** si el proveedor está encendido y en uso, reemplazar la clave aplica en ≤ 60 s por la caché de claves. La respuesta incluye `advertencias: [{ codigo: "probar_de_nuevo", mensaje: "Cambiaste la clave: prueba la conexión de nuevo." }]`.

**Origen `env`:** el proveedor no guarda clave por API. El asistente muestra `variable_env_sugerida` (P1) e indica que hace falta un redeploy (§8.4 de la spec).

### P7 · `POST /api/admin/ia/proveedores/[id]/clave/revocar` (A4)
- **Body:** `{ "confirmar": boolean, "impacto_hash"?: string }`.
- **Sin `confirmar`:** 409 `confirmacion_requerida` + `impacto` (§0.2), porque sin clave sus modelos dejan de responder.
- **Con `confirmar: true` y el hash vigente:** `rpc('fn_ia_revocar_clave', { p_proveedor_codigo, p_actor_usuario_id })`. Responde 200 `{ ok, accion: "revocar", clave: { configurada: false, … } }`.

**Errores:**

| HTTP | Código | Mensaje |
|---|---|---|
| 409 | `impacto_cambio` | Cambió lo que se vería afectado. Revisa el aviso otra vez. |
| 409 | `sin_clave_en_vault` | Este proveedor no tiene una clave guardada en Vault. |
| 404 | `proveedor_inexistente` | — |

En `impacto_cambio` se devuelve el `impacto` nuevo.

**Idempotencia:** revocar una clave ya revocada vuelve a sobrescribir el valor y responde 200.

### P8 · `GET /api/admin/ia/proveedores/[id]/impacto`
Responde 200 `{ ok, impacto }` (§0.2), simulando que se apagan **todos** los modelos del proveedor. Frontend lo usa para pintar el diálogo antes de pulsar «Apagar xAI».

### P9 · `POST /api/admin/ia/proveedores/[id]/encender`
- **Body:** vacío.
- **Requisitos:**
  - clave configurada;
  - al menos un modelo del proveedor con **prueba vigente exitosa**;
  - URL dentro de la lista permitida.
- Encender el proveedor **no** enciende sus modelos: cada modelo tiene su propio interruptor (M5).

**Errores:**

| HTTP | Código | Mensaje |
|---|---|---|
| 409 | `primero_prueba_la_conexion` | Primero prueba la conexión. |
| 409 | `falta_clave` | Primero guarda la clave del proveedor. |
| 409 | `url_no_permitida` | (ver P3) |

`primero_prueba_la_conexion` es A7, con el texto exacto del brief.

**Respuesta 200:** `{ ok, item, aplica_en_s: 60 }`. Si ya estaba encendido: 200 con `sin_cambios: true`.

### P10 · `POST /api/admin/ia/proveedores/[id]/apagar` (C1)
- **Body:** `{ "confirmar": boolean, "impacto_hash"?: string }`.
- **Paso 1:** sin `confirmar` → **409** `confirmacion_requerida` + `impacto` · «Revisa el impacto y confirma.».
- **Paso 2:** con `confirmar: true` + `impacto_hash` igual al vigente → aplica.
  - Responde 200 `{ ok, item, impacto, aplica_en_s: 60 }`.
  - Si el hash no coincide: 409 `impacto_cambio` con el impacto nuevo.
- **Efecto en estudiantes:**
  - los agentes con respaldo encendido pasan al primero (C2, ya en BA-034);
  - los que quedan sin IA responden el mensaje de C3 y queda el evento `error_bot` (BA-034).
- **Idempotencia:** si ya estaba apagado, 200 con `sin_cambios: true` (no hace falta confirmar).
- El botón de Frontend nombra la acción: «Apagar xAI».

---

## 2. Modelos de un proveedor (BA-036: A5, A6, A7, C1)

| # | Método y ruta | Nueva / existente | Criterios |
|---|---|---|---|
| M1 | `GET /api/admin/ia/despliegues?proveedor_id=` | existente, se amplía | A5, C1 |
| M2 | `POST /api/admin/ia/despliegues` | existente, se reemplaza el CRUD genérico | A5 |
| M3 | `PATCH /api/admin/ia/despliegues/[id]` | existente, se restringe | A5 |
| M4 | `POST /api/admin/ia/despliegues/[id]/probar` | nueva | A6 |
| M5 | `POST /api/admin/ia/despliegues/[id]/encender` | nueva | A7 |
| M6 | `POST /api/admin/ia/despliegues/[id]/apagar` | nueva | C1 |
| M7 | `GET /api/admin/ia/despliegues/[id]/impacto` | nueva | C1 |
| M8 | `GET /api/admin/ia/precios?proveedor_id=` · `POST /api/admin/ia/precios` | nueva | A5 (costo por 1.000 tokens), D8 |

### M1 · forma de un modelo
```json
{ "id": "uuid", "proveedor_id": "uuid", "proveedor_codigo": "xai", "nombre": "Grok 4 rápido",
  "modelo": "grok-4", "encendido": false, "estado_panel": "probado",
  "parametros": { "temperature": 0.4, "max_tokens": 800, "timeout_ms": 20000 },
  "capacidades": { "json": true, "herramientas": false },
  "precio_vigente": { "entrada_usd_1k": 0.003, "salida_usd_1k": 0.015, "version": "2026-10", "es_estimado": false, "modelo": "grok-4" },
  "ultima_prueba": { "exitosa": true, "vigente": true, "latencia_ms": 820, "modelo_respondio": "grok-4", "motivo": null, "probado_en": "…" },
  "usado_por": { "principal": 0, "respaldo": 1 } }
```
- `precio_vigente` = `fn_ia_precio_vigente(proveedor_codigo, modelo)`. Busca el modelo exacto y, si no lo encuentra, el `'*'` del proveedor. Si no hay ninguno, devuelve `null`.
- Abacus hoy responde con su semilla `'*'` `estimado-2026-10` (0,002 / 0,010 USD por 1.000 tokens, `es_estimado: true`). Frontend muestra la etiqueta «precio estimado».

### M2 · `POST /api/admin/ia/despliegues` (paso 3 «Modelos», A5)

| Campo | Tipo | Validación (error → `campo`) |
|---|---|---|
| `proveedor_id` | uuid | Obligatorio; el proveedor existe y no está archivado |
| `nombre` | string | 1–80 |
| `modelo` | string | Obligatorio salvo en Abacus, 1–120, `^[A-Za-z0-9._:/@-]+$` |
| `parametros.temperature` | number | 0–2. Por defecto 0.4 |
| `parametros.max_tokens` | integer | 1–8192. Por defecto 800 (spec §9 #26) |
| `parametros.timeout_ms` | integer | 1000–60000. Por defecto 20000 |
| `precios.entrada_usd_1k` | number | Obligatorio, ≥ 0 y ≤ 100 |
| `precios.salida_usd_1k` | number | Obligatorio, ≥ 0 y ≤ 100 |
| `precios.es_estimado` | boolean | Por defecto `false` |
| `capacidades.json` | boolean | Por defecto `false` (fail-closed en B3) |
| `capacidades.herramientas` | boolean | Por defecto `false` |
| `abacus.identificador_externo` / `abacus.referencia_secreto` | string | Solo Abacus: **nombres** de variables que cumplan `^(LLM_[A-Z0-9_]+\|ABACUS_NAIA_[A-Z0-9_]+)$` (`nombreEnvPermitido`). Nunca valores |

**Efecto:**
- Crea el modelo **apagado**. `parametros`, `capacidades`, `tipo_adaptador` y `url_base` (copiados del proveedor) se guardan en `despliegues_ia.configuracion_tecnica`, que es lo que ya lee BA-034.
- Los precios van por `rpc('fn_ia_registrar_precio', { p_proveedor_codigo, p_modelo, p_entrada_usd_1k, p_salida_usd_1k, p_version: 'panel-<YYYYMMDDHHmmss>', p_fuente: 'panel', p_es_estimado, p_actor_usuario_id })`.
- Responde 201 `{ ok, item }`, con la forma de M1.

**Errores (400; `campo` = la ruta del campo):**

| Código | Mensaje |
|---|---|
| `campo_requerido` | Este dato es obligatorio. |
| `fuera_de_rango` | Debe estar entre {min} y {max}. |
| `modelo_invalido` | El identificador del modelo tiene caracteres no permitidos. |
| `variable_no_permitida` | Por seguridad el nombre debe empezar por LLM_ o ABACUS_NAIA_. |
| `precio_invalido` | Los precios son obligatorios y no pueden ser negativos. |

`precio_invalido` es el motivo que devuelve la BD. Con el proveedor inexistente: 404 `proveedor_inexistente`.

**Idempotencia:** no hay. Dos POST crean dos modelos. Frontend bloquea el doble clic.

### M3 · `PATCH /api/admin/ia/despliegues/[id]`
- **Campos:** los mismos de M2, todos opcionales.
- **Cambiar `modelo`:**
  - Invalida la prueba.
  - Con el modelo **encendido** se rechaza con 409 `apaga_o_crea_otro_modelo` · «Este modelo está en uso. Crea otro modelo y asígnalo al agente con Probar → Publicar.». Así se respeta B4: cambiar de modelo pasa por un borrador del agente.
- **`parametros` y `capacidades`:** se pueden cambiar con el modelo encendido (spec §8.5: no requieren desplegar). Aplican en ≤ 60 s y quedan en la bitácora. **No** invalidan la prueba.
- **`precios`:** crean una **versión nueva** (`fn_ia_registrar_precio`). No sobrescriben y no invalidan la prueba.
- `estado` y `activo` no se aceptan: 400 `campo_no_editable`.
- **Idempotencia:** los mismos valores responden 200 con `sin_cambios: true`.

### M4 · `POST /api/admin/ia/despliegues/[id]/probar` (A6)

**Cómo funciona:**
- **Body:** vacío. El mensaje es fijo (`MENSAJE_PRUEBA_CONEXION`) y nunca lleva datos de personas.
- Funciona también con el modelo y el proveedor **apagados**: es la forma de llegar a encender.
- Usa `validarDespliegue` y la lista permitida, el lector de claves Vault → env y `probarConexion` (BA-034), con un timeout de 15 s.
- Queda un registro de la prueba (ver Necesidades de BD) y su costo en `registros_costo_ia` con `canal_codigo = 'panel'`, que **no** suma al tope de ningún canal.

**Respuesta:** **200 incluso si la prueba falla**, porque el resultado es un dato:
```json
{ "ok": true, "prueba": { "exitosa": false, "latencia_ms": 15002, "modelo_respondio": null,
  "motivo_codigo": "timeout", "motivo": "Tiempo agotado: el proveedor no respondió a tiempo.",
  "que_hacer": "Revisa que la URL esté en línea o sube el timeout.", "probado_en": "…" },
  "puede_encender": false }
```

**`motivo_codigo` → `motivo` → `que_hacer`** (vienen de `MOTIVO_LEGIBLE` y UX §3.5):

| `motivo_codigo` | `motivo` | `que_hacer` |
|---|---|---|
| `autenticacion` | Clave inválida o sin permiso para este modelo. | Reemplaza la clave. |
| `sin_saldo` | La cuenta del proveedor no tiene saldo. | Recarga saldo en el proveedor. |
| `servidor` | El proveedor o su URL no están disponibles. | Intenta más tarde o revisa la URL. |
| `timeout` | Tiempo agotado. | Revisa que la URL esté en línea o sube el timeout. |
| `limite_tasa` | El proveedor está limitando peticiones. | Espera unos minutos. |
| `sin_clave` | No hay clave configurada. | Guarda la clave. |
| `proveedor_no_permitido` | La URL no está en la lista permitida. | Elige un proveedor de la lista. |
| `respuesta_invalida` | El modelo respondió en un formato inesperado. | Revisa el identificador del modelo. |
| `contexto_excedido` | El mensaje es demasiado largo para este modelo. | Revisa el máximo de tokens. |
| `politica_contenido` | El proveedor bloqueó el contenido. | Contacta al proveedor. |

**Errores:**

| HTTP | Código | Mensaje |
|---|---|---|
| 404 | `no_encontrado` | — |
| 429 | `demasiadas_pruebas` | Espera un momento antes de probar otra vez. |

`demasiadas_pruebas` se activa con más de 6 pruebas por minuto por modelo (límite en memoria).

**Idempotencia:** cada prueba es un registro nuevo y vale la última.

### M5 · `POST /api/admin/ia/despliegues/[id]/encender` (A7)
- **Requisitos:** prueba **vigente** exitosa. Si no la hay: 409 `primero_prueba_la_conexion` · «Primero prueba la conexión».
- **Respuesta:** 200 `{ ok, item, aplica_en_s: 60, advertencias: [] }`.
- **Advertencia:** si el proveedor está apagado, viene `{ codigo: "proveedor_apagado", mensaje: "El proveedor está apagado: este modelo no se usará hasta encenderlo." }`.
- **Idempotencia:** si ya estaba encendido, 200 con `sin_cambios: true`.

### M6 · `POST /api/admin/ia/despliegues/[id]/apagar` (C1)
Usa el mismo protocolo de confirmación que P10, con el impacto solo de este modelo. Errores e idempotencia iguales.

### M7 · `GET /api/admin/ia/despliegues/[id]/impacto`
Responde 200 `{ ok, impacto }` (§0.2).

### M8 · Precios versionados (A5, D8)
- **`GET /api/admin/ia/precios?proveedor_id=`:** historial de `precios_modelo_ia` (solo lectura, super_admin):
  ```json
  { "ok": true, "items": [{ "id": "uuid", "modelo": "*", "version": "estimado-2026-10", "entrada_usd_1k": 0.002, "salida_usd_1k": 0.01, "es_estimado": true, "vigente_desde": "…", "vigente_hasta": null, "fuente": "semilla BA-038" }] }
  ```
- **`POST /api/admin/ia/precios`:**
  - **Body:**
    - `proveedor_codigo`;
    - `modelo`: string o `'*'` (todo el proveedor);
    - `entrada_usd_1k`, `salida_usd_1k`: ≥ 0;
    - `version`: 1–40 caracteres; por defecto `panel-<timestamp>`;
    - `fuente`: opcional;
    - `es_estimado`: boolean.
  - **Efecto:** llama a `fn_ia_registrar_precio(…, p_es_estimado, p_actor_usuario_id)`, que cierra la versión vigente y crea la nueva.
  - **Respuesta:** 201 `{ ok, precio_id, reemplaza_precio_id }`.

**Errores** (la API devuelve tal cual el `motivo` de la BD):

| HTTP | Código | Mensaje |
|---|---|---|
| 400 | `datos_incompletos` | Modelo y versión son obligatorios. |
| 400 | `precio_invalido` | Los precios son obligatorios y no pueden ser negativos. |
| 404 | `proveedor_inexistente` | — |
| 409 | `version_existente` | Esa versión de precio ya existe; usa una versión nueva. |

**Idempotencia:** por `(proveedor, modelo, version)`. Repetir la misma versión responde 409.

Es la acción del aviso «Hay llamadas sin precio: carga el precio» (§3).

---

## 3. Modelo por agente + respaldo (BA-037: B1–B4)

| # | Método y ruta | Nueva / existente | Criterios |
|---|---|---|---|
| B-1 | `GET /api/admin/ia/modelos-disponibles` | nueva | B1 |
| B-2 | `PUT /api/admin/ia/versiones/[id]/modelo` | nueva | B1, B2, B4 |
| B-3 | `POST /api/admin/ia/versiones/[id]/duplicar` | nueva | B4 |
| B-4 | `POST /api/admin/ia/versiones/[id]/simular` · `POST /api/admin/ia/pruebas/[id]/ejecutar` | existentes, sin cambio de contrato | B4 (Probar) |
| B-5 | `POST /api/admin/ia/versiones/[id]/publicar` | existente, se amplía | B1, B3, B4 |
| B-6 | `POST /api/admin/ia/versiones/[id]/restaurar` | nueva | B4 («Volver a esta versión») |

### B-1 · `GET /api/admin/ia/modelos-disponibles`
- **Query opcional:** `?requiere=json,herramientas`.
- Solo devuelve modelos **encendidos y con prueba vigente exitosa**, de proveedor encendido y con clave configurada (B1). La forma es la de M1, más `proveedor_nombre`.

### B-2 · `PUT /api/admin/ia/versiones/[id]/modelo`
- **Body:** `{ "despliegue_id": "uuid", "respaldos_ids": ["uuid", …] }`.
  - `respaldos_ids` admite de 0 a 5 elementos (el tope de BA-034). Su orden es la prioridad.
  - Sin duplicados y sin repetir el principal.
- **Solo para versiones `borrador`.** Una versión publicada responde 409 `version_inmutable_publicada` · «Esta versión ya está publicada. Duplícala para cambiar el modelo.» (B4).
- **Validación:** todos deben estar en B-1. Si alguno no está: 409 `modelo_no_disponible` · «Ese modelo no está encendido y probado.», con `detalles.ids`.
- **Efecto:** escribe `configuracion_snapshot.despliegue_id` y `configuracion_snapshot.despliegues_respaldo_ids` (claves que ya lee BA-034).
- **Respuesta 200:**
  ```json
  { "ok": true, "item": { "version_id": "uuid", "despliegue_id": "uuid", "respaldos_ids": [] },
    "advertencias": [ { "codigo": "sin_respaldo", "mensaje": "Sin respaldo: si el modelo falla, NaIA pasa a una persona" } ],
    "compatibilidad": { "requiere": { "json": true, "herramientas": false }, "respaldos_incompatibles": [] } }
  ```
  - `sin_respaldo` es el aviso amarillo de B2 y no bloquea.
  - `compatibilidad` adelanta lo que B-5 va a bloquear.
- **Idempotencia:** es un PUT completo; los mismos valores responden 200 `sin_cambios: true`.

### B-3 · `POST /api/admin/ia/versiones/[id]/duplicar`
- **Body:** `{ "numero_version": string (1–20, único por agente), "notas_cambio"?: string }`.
- **Efecto:** crea un borrador nuevo que copia `configuracion_snapshot` y las asociaciones activas (contextos, canales, herramientas y fuentes). La versión origen no se toca (B4).
- **Respuesta:** 201 `{ ok, item }`.
- **Error:** 409 `numero_version_existente` · «Ya existe una versión con ese número.».

### B-5 · `POST /api/admin/ia/versiones/[id]/publicar` (se amplía)
Se mantienen las validaciones actuales (contexto, canal, despliegue activo y prueba exitosa) y se agregan dos:
- **B1:** el principal y los respaldos deben estar en B-1. Si no: 409 `modelo_no_disponible`.
- **B3:** cada **respaldo** debe tener las capacidades que la versión usa:
  - `json` si la versión tiene activo el componente `contrato_salida` (BA-039);
  - `herramientas` si tiene `agente_herramientas` activas.
  - La capacidad que no está declarada cuenta como `false` (fail-closed).
  - Si falta alguna: 409 `respaldo_incompatible` · «El respaldo «{nombre}» no soporta {modo JSON / herramientas}, que este agente usa. Quítalo o elige otro.», con `detalles: [{ despliegue_id, falta: ["json"] }]`.
  - Al principal Abacus no se le aplica B3: conserva su parser tolerante (BA-034 / B5).

Publicar sin respaldo está permitido (B2).

### B-6 · `POST /api/admin/ia/versiones/[id]/restaurar` (B4)
- **Body:** `{ "nota": string (5–500, obligatoria), "confirmar": true }`.
- **Requisito:** la versión está `desactivada` y tiene `publicada_en`, es decir, ya estuvo publicada. Sus modelos deben estar en B-1; si no, 409 `modelo_no_disponible` · «Esa versión usa un modelo apagado. Duplícala y elige otro modelo.».
- **Efecto atómico:** la versión publicada actual pasa a `desactivada`, esta vuelve a `publicada` y se actualiza `agentes_ia.version_activa_id`. Queda en la bitácora con la nota. Aplica en ≤ 60 s.
- **Respuesta:** 200 `{ ok, item, anterior_version_id }`.
- **Idempotencia:** si ya es la versión activa, 200 con `sin_cambios: true`.

---

## 4. Tope de gasto diario y consumo (BA-038 parte API: D1–D8)

**Alcance real del tope en E1, tal como lo hizo BD en b4cf029:** el «número» es hoy el **canal** (`canales_ia.codigo`: `web`, `whatsapp`, …).
- Todavía no existen `lineas_whatsapp` ni `linea_id` en `registros_costo_ia`.
- Hoy consumen IA:
  - `web`: NaIA en `/api/naia`;
  - `whatsapp`: Demo WApp. El WhatsApp real (BA-032) todavía no llama a la IA.
- Así, el tope de `whatsapp` cubre a todo lo que entra por ese canal.
- El **«corte por número» por línea queda abierto para E2** (ver Dudas). No es por estudiante ni por celular: el abuso de una persona lo frena el límite de mensajes por minuto (spec §9 #9).

| # | Método y ruta | Nueva | Criterios |
|---|---|---|---|
| T1 | `GET /api/admin/ia/topes` | sí | D5, D8 |
| T2 | `GET /api/admin/ia/topes/[canal_codigo]` | sí | D1, D8 |
| T3 | `PUT /api/admin/ia/topes/[canal_codigo]` | sí | D1, D3, D4, D7 |
| T4 | `GET /api/admin/ia/consumo?canal_codigo=&dia=` | sí | D8 |
| T5 | `GET /api/admin/ia/alertas` | sí | D5, D6 |
| T6 | `POST /api/admin/ia/alertas/[id]/vista` | sí | D5 |

### Forma del estado de gasto
`rpc('fn_ia_gasto_hoy', { p_canal_codigo })` traducido para el panel:
```json
{ "canal_codigo": "web", "canal_nombre": "NaIA web",
  "tope_diario_usd": 5.00, "umbral_alerta_pct": 80,
  "gasto_usd": 3.2, "pct_usado": 64.0,
  "estado": "alerta", "motivos_alerta": ["sin_costo"],
  "precio_estimado": true, "intentos_sin_costo": 2,
  "dia_bogota": "2026-10-18", "reinicia_en": "2026-10-19T00:00:00-05:00",
  "avisos": [
    { "codigo": "precio_estimado", "mensaje": "precio estimado" },
    { "codigo": "sin_costo", "mensaje": "Hay llamadas sin precio: carga el precio", "accion": "POST /api/admin/ia/precios" }
  ],
  "ayuda": { "por_que": "Evitar facturas sorpresa por errores, bucles o abuso.", "para_que": "Que la IA se detenga sola al llegar al tope y se reanude a las 00:00 de Bogotá." } }
```

**Valores de `estado`:**
- `cortado`: gasto ≥ tope.
- `alerta`: % ≥ umbral **o** `intentos_sin_costo > 0`.
- `normal`: en los demás casos.

**Significado de los demás campos:**
- `motivos_alerta` ⊆ `["umbral", "sin_costo"]`.
- `precio_estimado = true` cuando parte del gasto usó un precio marcado como estimado; hoy, la semilla de Abacus.
- `reinicia_en` lo calcula Backend: el día siguiente a `dia_bogota`, a las 00:00 `-05:00`.

**Etiquetas y textos que debe mostrar Frontend:**

| Condición | Texto o etiqueta |
|---|---|
| `precio_estimado` | Etiqueta «precio estimado» junto al gasto |
| `sin_costo` | «Hay llamadas sin precio: carga el precio» |
| Barra | «USD 3,20 de 5,00 (64 %)», con marcador en el umbral (UX §3.11) |

### T1 · `GET /api/admin/ia/topes`
Responde 200 `{ ok, items: [estado de gasto por cada canal activo] }`. Se lee `topes_gasto_ia` y se llama a `fn_ia_gasto_hoy` por canal (son pocos).

### T2 · `GET /api/admin/ia/topes/[canal_codigo]`
Devuelve el estado de gasto más `bitacora[]`: los últimos 20 cambios de `bitacora_topes_gasto_ia`, cada uno `{ campo, valor_anterior, valor_nuevo, actor: { id, nombre }, creado_en }` (D1).

Error: 404 `canal_inexistente` · «El número o canal no existe.».

### T3 · `PUT /api/admin/ia/topes/[canal_codigo]` (D1, D3, D4)
- **Body:** `{ "tope_diario_usd"?: number, "umbral_alerta_pct"?: integer }`. Al menos uno; el que se omite no cambia (en la RPC llega como NULL).
- **Validación previa en la API**, antes de la RPC:
  - En `tope_diario_usd`, el string vacío, `null` explícito, 0, un negativo, `Infinity`, `"sin límite"` o cualquier valor no numérico → 400 `tope_invalido` · **«El tope es obligatorio y mayor que 0»**, con `campo: "tope_diario_usd"` (D3). No existe la opción sin límite.
  - `umbral_alerta_pct` que no sea entero entre 1 y 99 → 400 `umbral_invalido` · **«El umbral de alerta debe estar entre 1 y 99 %»**, con `campo: "umbral_alerta_pct"` (D4).
  - Un tope mayor que USD 1000 → 400 `tope_muy_alto` · «Ese tope es muy alto; revisa el valor.». Es una guarda contra errores de digitación; el límite está pendiente de confirmar (ver Dudas).
- **Efecto:** `rpc('fn_ia_actualizar_tope', { p_canal_codigo, p_tope_diario_usd, p_umbral_alerta_pct, p_actor_usuario_id })`. Si la RPC devuelve `ok: false`, se responde 400 o 404 con su `error` y su `motivo` como `mensaje`.
- **Respuesta 200:** `{ ok, item: <estado de gasto recalculado>, aplica_en_s: 60 }`. Si se subió el tope por encima del gasto, `estado` vuelve a `normal` o `alerta` y la IA se reanuda (D7).
- **Idempotencia:** guardar los mismos valores no agrega fila en la bitácora (la BD solo registra cambios reales). Responde 200. Sin ningún campo: 400 `sin_cambios` · «No hay valores para guardar.».

### T4 · `GET /api/admin/ia/consumo?canal_codigo=web&dia=2026-10-18`
- **Parámetros:** `dia` es opcional (por defecto, hoy en Bogotá), con un máximo de 90 días hacia atrás.
- Es una lectura de `registros_costo_ia` en el rango del día de Bogotá `[00:00, 24:00) -05:00`.

```json
{ "ok": true, "canal_codigo": "web", "dia_bogota": "2026-10-18",
  "total": { "llamadas": 140, "gasto_usd": 3.2, "tokens_entrada": 210000, "tokens_salida": 41000,
             "intentos_sin_costo": 2, "respaldo_usado": 3, "sin_ia": 1, "simulaciones": 12 },
  "por_modelo": [ { "proveedor_codigo": "abacus_ai", "modelo": "naia", "llamadas": 137, "gasto_usd": 3.1, "precio_version": "estimado-2026-10", "es_estimado": true } ] }
```
- Las simulaciones **suman** al gasto (decisión del Orquestador) y se informan aparte.
- El costo sigue la misma regla que la BD: si `costo_estimado_usd` es null, se calcula tokens × precio vigente; si tampoco hay precio, cuenta en `intentos_sin_costo`.

Error: 400 `dia_invalido` · «Usa una fecha AAAA-MM-DD de los últimos 90 días.».

### T5 · `GET /api/admin/ia/alertas?estado=abiertas|todas&canal_codigo=`
- **Respuesta:**
  ```json
  { "ok": true, "items": [{ "id": "uuid", "canal_codigo": "web", "tipo": "umbral", "dia_bogota": "2026-10-18", "gasto_usd": 4.1, "tope_usd": 5, "umbral_pct": 80, "creado_en": "…", "vista_en": null }] }
  ```
- **Tipos:** `umbral` (D5), `corte` (D6) y `sin_costo` («Hay llamadas sin precio: carga el precio»).
- **Lectura:** de `alertas_gasto_ia`; `abiertas` = `vista_en IS NULL`.

### T6 · `POST /api/admin/ia/alertas/[id]/vista`
- Marca `vista_en = now()`. Si ya estaba vista, responde 200 con `sin_cambios: true`.
- Escribe con service_role tras verificar super_admin. Quién la marcó: ver Necesidades de BD.

### Comportamiento del motor (no es un endpoint; se implementa en la fase 2, en `AgenteExecutor`)

1. **Antes de llamar a la IA:** `rpc('fn_ia_gasto_hoy', { p_canal_codigo })`.
2. **Si el estado es `cortado`:**
   - no se llama a la IA;
   - el estudiante recibe el texto de C3 (D6);
   - `rpc('fn_ia_registrar_alerta_gasto', { p_canal_codigo })`;
   - se deja un registro de costo con `resultado = 'sin_ia'`, `tipo_error = 'tope_diario'` y `evento = 'error_bot'`. `sin_ia` no suma gasto ni cuenta como intento sin costo.
3. **Si el estado es `alerta`:** `fn_ia_registrar_alerta_gasto` (no se duplica en el día; devuelve `{ registradas, tipos }`) y la conversación sigue. Los demás canales no se afectan.
4. **Si falla la RPC de gasto: fail-closed = C3** (propuesta de Backend). Sin saber el gasto no se puede garantizar «nunca sin límite». Lo confirma el Orquestador (ver Dudas).
5. **Costo:** se calcula con `fn_ia_precio_vigente(proveedor_codigo, modelo)` (exacto → `'*'`) y se guarda `costo_estimado_usd` + `precio_version`. Abacus usa `'*'` `estimado-2026-10` (0,002 / 0,010).
   - Pendiente de la fase 2: hoy BA-034 lee `configuracion_tecnica.costo_usd_1k_*`. Se cambiará a la RPC, con la configuración como respaldo.
6. **Pruebas de conexión (M4):** `canal_codigo = 'panel'`, que no tiene fila de tope y no corta a nadie.

---

## 5. Mapa endpoint → criterio

| Criterio | Cubierto por |
|---|---|
| A1 | P1 (presets) · P3 (paso 1) · P4/P5 `asistente.paso` (pasos 1→5). La caja «¿Por qué? / ¿Para qué?» viene en `ayuda` |
| A2 | P1 · P3/P5 (`url_no_permitida`) |
| A3 | P6 · P2/P4 (`clave.configurada`, nunca el valor) · §0 |
| A4 | P6 (reemplazar) · P7 (revocar) · P4 `bitacora` |
| A5 | M2/M3 (validaciones y rangos con `campo`) · M8 |
| A6 | M4 |
| A7 | M5 / P9 (`primero_prueba_la_conexion`) |
| A8 | P3 + P5 `asistente { paso, borrador }` · P4 |
| A9 | §0 (403 en todas) |
| B1 | B-1 · B-2 · B-5 |
| B2 | B-2 (`sin_respaldo`; se permite publicar sin respaldo) |
| B3 | B-5 (`respaldo_incompatible`) · B-2 `compatibilidad` |
| B4 | B-2 (solo borrador) · B-3 · B-4 · B-5 · B-6 |
| C1 | P8/P10 · M6/M7 · P7 (§0.2, `confirmar` + `impacto_hash`, ≤ 60 s) |
| D1 | T3 · T2 `bitacora` |
| D2 | La BD da por defecto 5 / 80 (trigger en `canales_ia`). La API solo lee |
| D3 / D4 | T3 |
| D5 | T1 · T5 · `estado/motivos_alerta` |
| D6 | Motor (fase 2) + T5 `corte` |
| D7 | `fn_ia_gasto_hoy` (día de Bogotá) · T3 al subir el tope |
| D8 | T1 / T2 / T4 (gasto, tope, %, `ayuda`, «precio estimado») |

## 6. Bitácora de configuración (qué se registra)
- **Ya cubierto por BD:**
  - claves: `bitacora_claves_ia` (BA-035);
  - topes: `bitacora_topes_gasto_ia` (BA-038);
  - precios: `precios_modelo_ia`, que es solo de inserción y cuenta con `creado_por`.
- **Falta, y se pide a BD:** encender/apagar proveedor o modelo (con la confirmación y el impacto visto), editar proveedor o modelo, asignar modelo a una versión y restaurar una versión. Ver N3.

## Necesidades de BD (solo lo que falta después de b4cf029, 081ba33 y f590fd6)

> Ya existe y **no** se pide:
> - Vault: `fn_ia_guardar_clave`, `fn_ia_revocar_clave`, `fn_ia_leer_clave` y `fn_ia_estado_clave`, más `bitacora_claves_ia`.
> - Tope y gasto: `topes_gasto_ia` (5/80 + trigger), `bitacora_topes_gasto_ia`, `precios_modelo_ia` (con `es_estimado` y la semilla Abacus `'*'`), `alertas_gasto_ia` (umbral/corte/sin_costo), `fn_ia_actualizar_tope`, `fn_ia_gasto_hoy`, `fn_ia_registrar_alerta_gasto`, `fn_ia_registrar_precio` y `fn_ia_precio_vigente`.
> - El índice de gasto por canal.

**N1. Pruebas de conexión (A6, A7, B1). Es indispensable.**
- Tabla `pruebas_conexion_ia`:
  - `id uuid PK`
  - `despliegue_id uuid NOT NULL FK despliegues_ia`
  - `proveedor_id uuid NOT NULL FK proveedores_ia`
  - `exitosa boolean NOT NULL`
  - `latencia_ms integer CHECK (latencia_ms >= 0)`
  - `modelo_respondio text`
  - `motivo_codigo text CHECK (motivo_codigo IS NULL OR motivo_codigo IN ('timeout','limite_tasa','autenticacion','sin_saldo','contexto_excedido','politica_contenido','servidor','respuesta_invalida','sin_clave','proveedor_no_permitido','proveedor_inactivo'))`
  - `actor_usuario_id uuid FK usuarios_internos`
  - `creado_en timestamptz NOT NULL DEFAULT now()`
- Índice `(despliegue_id, creado_en DESC)`.
- RLS: SELECT solo `is_super_admin()`; INSERT, UPDATE y DELETE revocados a anon y authenticated (escribe el servidor con service_role). Solo de inserción.

**N2. Marcas para invalidar pruebas (A7: «prueba vigente»).**
- `despliegues_ia.config_actualizada_en timestamptz NOT NULL DEFAULT now()`. Lo actualiza Backend al cambiar `modelo`, URL o parámetros de conexión, no al encender o apagar.
- `proveedores_ia.config_actualizada_en timestamptz NOT NULL DEFAULT now()`, al cambiar `url_base`.
- **Opcional:** `fn_ia_prueba_vigente(p_despliegue_id uuid) RETURNS boolean`, o la vista `v_ia_modelos_disponibles` (B1). Reglas:
  - la última prueba es exitosa;
  - `creado_en >` las dos `config_actualizada_en` y `> coalesce(proveedores_ia.clave_actualizada_en, '-infinity')`;
  - la clave no está revocada;
  - el modelo y el proveedor están encendidos.
  - Solo service_role. Si BD no la hace, Backend lo calcula en TS.

**N3. Bitácora de configuración IA (C1, A4 en la ficha, UX §3.14).**
- Tabla `bitacora_config_ia`:
  - `id uuid PK`
  - `entidad text NOT NULL CHECK (entidad IN ('proveedor','despliegue','version'))`
  - `entidad_id uuid NOT NULL`
  - `accion text NOT NULL CHECK (accion IN ('crear','editar','encender','apagar','archivar','asignar_modelo','restaurar'))`
  - `valor_anterior jsonb`
  - `valor_nuevo jsonb`
  - `impacto jsonb` (lo que vio el admin al apagar)
  - `nota text`
  - `actor_usuario_id uuid FK usuarios_internos`
  - `creado_en timestamptz NOT NULL DEFAULT now()`
- Restricción recomendada: `CHECK (NOT (coalesce(valor_nuevo,'{}') ?| array['clave','api_key','token','secret']))`, y lo mismo en `valor_anterior`.
- Índice `(entidad, entidad_id, creado_en DESC)`.
- RLS: SELECT solo super_admin; sin escritura desde el cliente; solo de inserción.

**N4. Interruptor atómico (C1). Recomendado.**
- `fn_ia_cambiar_interruptor(p_tipo text /* 'proveedor'|'despliegue' */, p_id uuid, p_encender boolean, p_impacto jsonb, p_actor_usuario_id uuid) RETURNS jsonb`. Hace lo siguiente:
  - actualiza `estado` (`'activo'`/`'inactivo'`) y `actualizado_en`;
  - escribe `bitacora_config_ia` en la misma transacción;
  - devuelve `{ok, sin_cambios, estado_anterior, estado_nuevo}`.
- Errores `{ok:false, error:'no_encontrado'|'archivado'}`.
- No valida la prueba (lo hace Backend). Solo service_role.

**N5. Restaurar versión atómico (B4). Recomendado.**
- `fn_ia_restaurar_version(p_version_id uuid, p_nota text, p_actor_usuario_id uuid) RETURNS jsonb`. En una transacción:
  - valida `estado = 'desactivada'` y `publicada_en IS NOT NULL`;
  - desactiva la publicada actual del agente;
  - publica esta;
  - actualiza `agentes_ia.version_activa_id`;
  - escribe `bitacora_config_ia`.
- Errores `{ok:false, error:'no_restaurable'|'no_encontrado'}`. Si ya es la activa, `{ok:true, sin_cambios:true}`. Solo service_role.
- Hoy `publicar` hace varias escrituras sin transacción; la misma función sirve de modelo si BD quiere cubrirlo después.

**N6. Proveedor: datos del asistente y de conexión (A2, A8).**
- `proveedores_ia.preset_codigo text CHECK (preset_codigo IN ('abacus_ai','openai','xai','anthropic','google','openrouter','otro_compatible'))`.
- `proveedores_ia.tipo_adaptador text CHECK (tipo_adaptador IN ('abacus','openai','xai','anthropic','google','openai_compatible'))`.
- `proveedores_ia.url_base text`, nullable. La lista permitida la valida el código; en BD como mucho `CHECK (url_base IS NULL OR url_base LIKE 'https://%')`.
- `proveedores_ia.asistente_paso smallint CHECK (asistente_paso BETWEEN 1 AND 5)` y `proveedores_ia.asistente_borrador jsonb`, con `CHECK (NOT (coalesce(asistente_borrador,'{}') ?| array['clave','api_key','token','secret','password']))`.
- Backfill: `abacus_ai` → `preset_codigo = 'abacus_ai'`, `tipo_adaptador = 'abacus'`.
- Si BD prefiere no agregar columnas, Backend puede guardar todo en `capacidades jsonb` o en `configuracion_tecnica` de cada modelo. A8 entonces quedaría solo con `localStorage` en Frontend (se pierde al cambiar de dispositivo).

**N7. Alertas: quién las marcó vistas (D5). Menor.**
- `alertas_gasto_ia.vista_por uuid FK usuarios_internos` (hoy solo existe `vista_en`).
- **O bien** `fn_ia_marcar_alerta_vista(p_alerta_id uuid, p_actor_usuario_id uuid) RETURNS jsonb`, idempotente.

**N8. Canal de pruebas del panel (M4). Confirmar con BD.**
- `registros_costo_ia.canal_codigo` es texto libre, sin FK. Backend usará `'panel'` para las pruebas de conexión.
- Confirmar que no hace falta crear `canales_ia('panel')`. Si se crea, debe quedar `activo = false`, para que el motor la rechace como canal (F1). El trigger le daría tope 5/80, lo cual es inocuo.

**N9. E2 (no es para ahora, solo para dejarlo anotado):** «corte por número» real. Requiere:
- `lineas_whatsapp`;
- `linea_id` en `topes_gasto_ia`, `alertas_gasto_ia` y `registros_costo_ia`;
- `fn_ia_gasto_hoy(p_linea_id)`.

Coincide con la deuda que BD ya anotó en f590fd6.

## Dudas abiertas del brief (para Jhon / Orquestador)
1. **Corte por número:**
   - En E1 se corta por canal (`web`, `whatsapp`), así que Demo WApp y el futuro WhatsApp real comparten el tope de `whatsapp`. ¿Se acepta hasta E2?
   - Confirmar también que «número» significa línea de BuscoEdu y no el celular del estudiante.
2. **Si falla la consulta del gasto:** Backend propone **fail-closed (C3)**. La otra opción es seguir con la IA y avisar.
3. **Tope máximo:** ¿hay un máximo para evitar errores de digitación? Se propone USD 1000/día.
4. **Abacus con precio estimado** (0,002 / 0,010): ¿quién y cuándo carga el precio real? Mientras tanto el gasto de NaIA es aproximado.
5. **Rol `admin` («Administrador»):** existe en `roles`. A9 dice solo `super_admin`, y así queda en el contrato. ¿Correcto?
6. **Mensaje al cortar por tope:** D6 usa el mismo texto de C3. ¿Se quiere un texto distinto?
7. **Respaldos AI SDK y herramientas:** B3 marca un respaldo como incompatible si la versión usa herramientas. Hoy NaIA no usa herramientas, así que en la práctica solo aplica `json`.

## Riesgos
- **Salud y circuito:** el estado del circuito es en memoria por instancia (BA-034). El panel lo muestra como orientativo.
- **Impacto:** `impacto_hash` evita confirmar con un impacto desactualizado, pero no bloquea a dos admins que actúan a la vez. Gana el último y queda en la bitácora.
- **Sin transacciones:** sin N4 y N5, encender, apagar y restaurar son dos escrituras separadas. Puede quedar el cambio sin su fila de bitácora si falla la segunda.

## Bitácora
| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 | Contrato API admin IA (fase 1): proveedores, clave, prueba, interruptor con impacto, modelos, precios, modelo + respaldo por agente, restaurar versión, topes, consumo y alertas. Lista de lo que falta en BD | BA-036, BA-037 y BA-038 (parte API): que Frontend y BD trabajen en paralelo con un contrato fijo. Ajustado al contrato BD BA-038 v2 (b4cf029, 081ba33, f590fd6): tope por canal, precio estimado, sin_costo | Backend BuscoEdu (bot) |
