# A1 — Hilo Demo WApp, NaIA y sesiones QA

Contrato de backend en `fix/a1-catalogo-demowapp`. No hay migración en este cambio: las columnas las aplica el equipo de BD. El código asume que ya existen.

## Columnas que este código da por hechas

| Columna | Tipo supuesto | Uso |
| --- | --- | --- |
| `intenciones_aplicar_demowapp.oportunidad_hilo_id` | `uuid null`, FK a `oportunidades` | Hilo que abrió Aplicar. Nulo = fila anterior a este contrato. |
| único `(clave_idempotencia, oportunidad_hilo_id)` | índice adicional | El único viejo de solo `clave_idempotencia` se conserva. Por eso la clave del cliente incluye el hilo: si no, el segundo contacto choca y recibe `409`. |
| `personas.es_qa`, `oportunidades.es_qa`, `aplicaciones.es_qa`, `transferencias_universidad.es_qa` | `boolean not null default false` | Marca de prueba. |
| CHECK `transferencias_universidad_qa_no_facturable` | `NOT (es_qa AND es_facturable)` | Una transferencia QA no puede cobrarse. |

Migración de BD (no se reescribe aquí): `supabase/migrations/20261005090000_a1_demowapp_hilo_es_qa.sql`. `fn_ba031_convertir_si_consentido` hereda `es_qa` si el payload trae `es_qa: true` o si la persona u oportunidad ya lo son. Marca persona, oportunidad, aplicación y deja la transferencia `es_qa` con `es_facturable = false`. No la borra.

Un lead QA **sí se crea**. No sale a la universidad: el servidor manda `es_qa: true` en el payload cuando el hilo es QA y, por las dudas, vuelve a marcar aplicación y transferencia. El procesador de pushes cancela el envío si la plantilla o los metadatos apuntan a IES (`universidad`, `transferencia`, `panel_b2b`, `ies`) y la oportunidad es QA. Los recordatorios del chat demo no son envío a la IES y siguen.

`POST /api/leadcenter/convertir` usa `fn_convertir_aplicacion` (no hereda `es_qa` sola). Si la persona ya es QA, el servidor marca oportunidad, aplicación y transferencia (`es_facturable = false`) y no programa la bienvenida ni el token del modal.

## Auth

Igual que el resto de `/api/demowapp` privado: sesión de Lead Center y rol `super_admin`. Si no, `403` con `error: "forbidden"`.

`GET /api/leadcenter/oportunidades` sigue abierto a cualquier sesión de Lead Center. Quien no es super admin no recibe filas `es_qa = true`.

## 1. Aplicar no cruza hilos

Antes la memoria del navegador se indexaba solo por `ofertaId` y `POST /api/demowapp/aplicar` no recibía el hilo. Dos contactos sobre la misma oferta compartían `claveIdempotencia` y el servidor devolvía la intención del otro.

Ahora cada request del funnel lleva `oportunidadId` (uuid de la oportunidad del hilo activo). La memoria es `ba031-hilo:{oportunidadId}:{ofertaId}` y la clave es `hilo-{accion}-{oportunidadId}-{ofertaId}-{intento}`.

### Bodies y query

`POST /api/demowapp/aplicar`

```json
{
  "accion": "iniciar",
  "ofertaId": "uuid-oferta",
  "oportunidadId": "uuid-hilo",
  "claveIdempotencia": "hilo-iniciar-{oportunidadId}-{ofertaId}-1"
}
```

`accion` sigue siendo `iniciar` o `mi_lista`. El resto del body (nombre, celular, correo, pais, visitanteId) no cambió.

`POST /api/demowapp/aplicar/:intencionId/datos`

```json
{
  "oportunidadId": "uuid-hilo",
  "nombreCompleto": "Laura Pérez",
  "celular": "3001234567",
  "pais": "CO",
  "correo": "laura@correo.com"
}
```

`POST /api/demowapp/aplicar/:intencionId/consentimiento`

```json
{
  "oportunidadId": "uuid-hilo",
  "decision": "aceptar",
  "consentimientos": [{ "codigo": "contacto", "otorgado": true }]
}
```

`GET /api/demowapp/aplicar/:intencionId` y `GET .../consentimiento` exigen el query `?oportunidadId={uuid}`.

### Códigos nuevos

El cuerpo de error sigue el patrón `FunnelError` / `conFunnel`: `ok: false`, `code`, `error`, `leadCreado: false`, `ui.estado: "error"`.

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `hilo_requerido` | 400 | Falta `oportunidadId` o no es un uuid. |
| `hilo_no_encontrado` | 404 | El uuid no existe en `oportunidades`. En el detalle de sesión, tampoco hay persona para ese hilo. |
| `hilo_no_coincide` | 409 | La fila de la clave o de la intención tiene `oportunidad_hilo_id` distinto o nulo. No hay replay. |

Replay (`idempotente: true`) solo si la fila existente tiene el mismo `oportunidad_hilo_id` y la misma acción (Mi lista no se mezcla con Aplicar: sigue `clave_en_uso`).

Al insertar se guarda `oportunidad_hilo_id`. Si el hilo es `es_qa` y el estudiante acepta, el payload lleva `es_qa: true`. El lead se crea marcado y la transferencia, si la hay, queda no facturable.

## 2. NaIA: el mensaje del estudiante queda limpio

`lib/agentes/ejecutar-w1.ts` ya no antepone `serializarSesionHilo` ni `Mensaje del estudiante:` a `mensaje_usuario`. Pasa el hilo en `sesion_hilo`.

`AgenteExecutor` arma el bloque W1 (contrato + mesa de `serializarSesionHilo`) **una sola vez**, dentro del prompt enriquecido, y solo si el canal es `whatsapp`. Slots, aperturas y filtros leen `mensaje_usuario` tal cual.

El hilo previo sale de `conversaciones.contexto_resumido.sesion_hilo` y el turno lo vuelve a guardar ahí.

Si NaIA cae al texto «Se me enredó…», el servidor escribe un log sin PII:

```text
[demowapp] naia_fallback { motivo, name?, code?, message? }
```

| `motivo` | Cuándo |
| --- | --- |
| `excepcion` | El catch que no es fail-closed de canal. `name`, `code` y `message` recortado, sin teléfonos. |
| `respuesta_vacia` | El JSON parseó (o no hay marca) y no hay texto visible. |
| `json_no_parseable` | El proveedor no devolvió el JSON de NaIA. |

Los errores de canal (`canal_no_configurado`, `canal_no_encontrado`, `agente_canal_no_asignado`) se siguen propagando. No se disfrazan de fallback.

## 3. `POST /api/demowapp/sesiones/qa`

Solo super admin. Body:

```json
{ "etiqueta": "Corredor medicina" }
```

Si `etiqueta` no empieza por `QA `, el servidor lo prefija. Largo 2–80 antes del prefijo; si no, `400` `etiqueta_requerida`. JSON ilegible: `400` `json_invalido`.

Crea:

- `personas` con `es_qa = true`, `estado_relacion = estudiante_registrado` (no es lead), teléfono sintético `+57300000XXXX` (4 dígitos, sin chocar con `celular_e164` existente).
- `oportunidades` con `es_qa = true`, `origen = demo_wapp_qa`, `tipo_oportunidad = estudiante`, código `QA-` + 8 hex, etapa inicial activa que no sea cierre. Sin oferta, sin universidad.

No crea aplicación, consentimiento ni transferencia.

`201`:

```json
{
  "ok": true,
  "oportunidadId": "uuid",
  "codigo": "QA-A1B2C3D4",
  "telefonoEnmascarado": "+57 3** *** **12",
  "esQa": true
}
```

Rate limit en memoria del proceso: 8 altas por operador por minuto. Si se pasa, `429` `rate_limit`. Sin etapa inicial: `422` `etapa_inicial_inexistente`. Sin teléfono libre tras 8 intentos: `503` `telefono_qa_agotado`.

La sesión QA aparece en `GET /api/demowapp/sesiones` aunque no tenga aplicación. El mensaje del hilo (`POST /api/demowapp/sesiones/:oportunidadId/mensaje`) resuelve la persona por la oportunidad cuando no hay aplicación.

## 4. Teléfono enmascarado y filtro QA

`GET /api/demowapp/sesiones` ya no manda `celular` ni el E.164. Cada ítem trae:

- `telefonoEnmascarado`: `+57 3** *** **12` para un móvil colombiano de 10 dígitos. Otro E.164 muestra prefijo de país, primer dígito nacional y los dos últimos.
- `esQa`: boolean.

`GET /api/demowapp/sesiones/:oportunidadId` igual: `detalle.telefonoEnmascarado`, `detalle.esQa`, y `detalle.persona` sin `celular_e164` ni `telefono_principal` (sí `telefonoEnmascarado` y `es_qa`). El hilo sin persona responde `404` `hilo_no_encontrado`.

`GET /api/leadcenter/oportunidades` agrega `es_qa` en cada ítem. Si la sesión no es super admin, la consulta filtra `es_qa = false` antes de paginar. El filtro de tabla (RLS) no está en este cambio.

La UI de la hoja de operación sigue leyendo `celular` hasta que frontend la pase a `telefonoEnmascarado`. El número completo ya no viaja en estas respuestas.
