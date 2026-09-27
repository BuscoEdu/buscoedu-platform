# BA-031 UI — Aplicar, datos y consentimiento dentro del hilo

**Rama:** `feat/lote-ba-naia-wapp`  
**Fecha:** 27 de septiembre de 2026  
**Contrato:** [`docs/backend/README-ba031.md`](../backend/README-ba031.md)

El estudiante con sesión de Lead Center (`super_admin`) completa Aplicar en `/demoWapp` sin salir del chat. NaIA sigue en el compositor. El funnel es otro camino y no crea la solicitud hasta que el servidor responde `leadCreado: true`.

## Qué se ve

Sobre la ficha de la oferta del hilo hay dos acciones:

- **Aplicar** abre el registro (`POST /api/demowapp/aplicar` con `accion: "iniciar"`).
- **Guardar en Mi lista** solo anota la oferta (`accion: "mi_lista"`). No pide datos ni permisos y no sigue hacia un lead.

Después, al final del mismo hilo:

1. Burbujas de `mensajes[]` (texto, error, confirmación, rechazo, abandono, Mi lista).
2. Formulario de nombre, celular y correo opcional mientras `ui.acciones` incluye `enviar_datos`.
3. Textos de consentimiento (`GET .../consentimiento`) y casillas **sin marcar**. Aceptar, no autorizar o abandonar salen de `ui.acciones`.
4. Una línea de estado. Sin aceptación explícita dice que no hay solicitud. Tras aceptar, que la solicitud quedó en el hilo.

Mientras el request va en vuelo, la vista local pone `ui.cargando` en true, desactiva los botones y no adelanta `leadCreado`. Al volver success o error, `cargando` queda en false. El error se pinta con la burbuja del response (`code` / `error`). No se inventa oportunidad.

La clave de idempotencia es estable por oferta, acción e intento, en `sessionStorage` de la pestaña. Aplicar y Mi lista no comparten clave. Repetir la misma clave no reinicia la sesión. Después de aceptar, rechazar o abandonar, «Aplicar otra vez» usa una clave nueva.

No hay OTP, no hay Meta y no hay enlace a Explorar, a filtros ni al CRM. Operación sigue en la hoja que tapa el hilo. `/naia` no cambia. El panel de oportunidad del Lead Center no recibe `ofertaId`, así que este funnel no aparece ahí.

## Rutas que usa el hilo

| Paso | Llamado |
| --- | --- |
| Iniciar | `POST /api/demowapp/aplicar` `{ accion: "iniciar", ofertaId, claveIdempotencia }` |
| Mi lista | `POST /api/demowapp/aplicar` `{ accion: "mi_lista", ofertaId, claveIdempotencia }` |
| Datos | `POST /api/demowapp/aplicar/:intencionId/datos` |
| Ver permisos | `GET /api/demowapp/aplicar/:intencionId/consentimiento` |
| Decidir | `POST /api/demowapp/aplicar/:intencionId/consentimiento` |
| Restaurar la pestaña | `GET /api/demowapp/aplicar/:intencionId` |

La cookie es la misma de `/api/demowapp`. Sin `super_admin` el servidor responde `403` `forbidden` y el hilo muestra esa burbuja, sin solicitud.

`otorgado` solo se envía como booleano. Una casilla vacía sale en `false`. Aceptar sin las marcas obligatorias deja `leadCreado` en false y `oportunidadId` en null.

## Checklist QA E2E

Sesión: Lead Center `super_admin`, conversación abierta en `/demoWapp` con una oferta en el hilo. SQL BA-031 ya aplicado. Sin Meta.

### 2. Datos en el hilo

- [ ] Aplicar muestra la burbuja de inicio y el formulario (nombre, celular, correo opcional) dentro del chat.
- [ ] Enviar datos llama `POST .../datos`. Con nombre y celular válidos, el paso pasa a consentimiento y **no** aparece una solicitud (`leadCreado` false, línea «Sin solicitud para la universidad»).
- [ ] Nombre vacío, celular inválido o correo mal formado muestran la burbuja de error del servidor y el formulario sigue ahí.
- [ ] Durante el envío el hilo queda en cargando y los botones no se pueden repetir.

### 3. Consentimiento

- [ ] Se ven los textos (`GET .../consentimiento`) en una burbuja. Ninguna casilla viene marcada.
- [ ] Están Aceptar, No autorizo y Abandonar.
- [ ] Aceptar con los permisos que exige la oferta (en `por_lead`, transferencia en true) deja la confirmación en el hilo, `data-lead-creado="true"` y la línea «Solicitud registrada en este hilo».
- [ ] `data-paso` queda en `aceptada`.

### 4. Fail-closed

- [ ] Aceptar sin casillas, o sin un obligatorio, responde error (`consentimiento_obligatorio_faltante` u otro código del contrato). `data-lead-creado` sigue en `false` y no hay oportunidad en la línea de estado.
- [ ] No autorizar cierra en `rechazada` con burbuja de rechazo y sin solicitud.
- [ ] Abandonar (en datos o en permisos) cierra en `abandonada` sin solicitud.
- [ ] Un fallo de red muestra burbuja de error y no marca lead.

### 5. Mi lista no se mezcla

- [ ] Guardar en Mi lista muestra solo su burbuja y «En Mi lista. Sin solicitud para la universidad».
- [ ] No abre el formulario ni los permisos, y `data-funnel="mi-lista"` no queda con lead.
- [ ] Con una aplicación abierta, Mi lista no la convierte ni le cambia el paso.
- [ ] Repetir Mi lista no crea otra solicitud. Aplicar sigue con su propia clave.

### Shell (no romper BA-030 / BA-033)

- [ ] El hilo sigue a pantalla completa, sin columnas.
- [ ] Operación abre sesiones y CRM por encima; al cerrar vuelve el chat solo.
- [ ] No hay CTA de Explorar, filtros ni ficha CRM en la zona del estudiante.
- [ ] `/naia` conserva ventana, franja y FAB.

## Archivos

- `components/demowapp/funnelContrato.ts` — lectura del JSON, claves e idempotencia
- `components/demowapp/funnelContrato.test.ts` — fail-closed de esa lectura
- `components/demowapp/useFunnelHilo.ts` — llamadas al contrato BA-031
- `components/demowapp/FunnelEnHilo.tsx` — ficha, formulario y permisos
- `components/demowapp/DemoWappPanel.tsx` — los monta dentro del hilo
- `app/demoWapp/page.tsx` — pasa el id de la oferta de la conversación

## Verificación hecha en código

- `tsc --noEmit` pasa.
- `components/demowapp/funnelContrato.test.ts` (8 casos): clave distinta para Mi lista, string `"true"` que no otorga, cargando sin lead, error de transferencia sin oportunidad, aceptar solo si hay `oportunidadId`, y la misma clave al releer la sesión.
- Render estático de los estados del hilo: acciones en la ficha, formulario de datos sin el panel de permisos, consentimiento en cargando con casillas vacías, burbuja de error con `data-lead-creado="false"`, Mi lista sin el formulario de Aplicar, y aceptación con `data-lead-creado="true"`.

Este entorno no tiene sesión `super_admin` ni proyecto Supabase. El clic E2E contra la API queda en el checklist de arriba. `/demoWapp` sigue detrás del login de Lead Center.
