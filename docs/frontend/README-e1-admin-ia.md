# E1 · Ola 3/4 · Panel «IA multiproveedor» (BA-036 UI + pantallas B y D)

**Fecha:** 18/10/2026 · **Autor:** Frontend BuscoEdu (bot) · **Rama local:** `feat/e1-fe-admin-ia` (sin push), sobre `feat/e1-integra` @ 4425b19 (incluye la API E1 de 2759bc2 y BA-041).
**Specs (vinculantes para QA):** `e1-ia-multiproveedor.md` (A–D) · `ux-panel-roles.md` §1, §3, §5 · contrato API `docs/backend/README-e1-api.md`.

## 1. Qué se hizo y por qué

- **Qué:** las pantallas de `/admin/ia/multiproveedor` (solo `super_admin`):
  - asistente de 5 pasos para agregar un proveedor;
  - lista de proveedores con interruptor y aviso de impacto;
  - ficha del proveedor con bitácora;
  - modelo + respaldos por agente;
  - tope de gasto diario por canal.
- **Por qué:** que Jhon conecte, pruebe, encienda y apague proveedores de IA sin tocar código ni la base de datos, viendo antes a quién afecta cada cambio y sin poder dejar el gasto «sin límite».
- **Datos REALES:** las pantallas usan la API de Backend (`/api/admin/ia/...`, implementada en 2759bc2).
  - El adaptador de ejemplo solo existe para pruebas y capturas locales.
  - Nunca entra al bundle de producción: está verificado en `.next`.
  - Si alguien intentara activarlo con `NODE_ENV=production`, la función lanza un error.
- **Se reemplazó el formulario viejo de proveedores.** `/admin/ia/proveedores` (`PaginaCatalogo` genérico) ahora redirige a `/admin/ia/multiproveedor`.
  - Motivo: desde 2759bc2 la API no crea proveedores sin `preset_codigo` y no deja editar `estado` (400 `campo_no_editable`).
  - Se actualizaron los enlaces que llevaban al formulario viejo:
    - el menú (sale de «Centro de Agentes IA» y pasa a la categoría «IA multiproveedor»);
    - la tarjeta «Proveedores» del Dashboard IA;
    - los dos enlaces de la Guía de gobierno.

## 2. Pantallas

| Ruta | Qué muestra | Endpoints |
|---|---|---|
| `/admin/ia/multiproveedor` | Tabla en web y tarjetas en móvil. Por proveedor: chip de estado (ícono + texto), última prueba, cuántos agentes lo usan e interruptor. Al apagar se abre el diálogo «N agentes lo usan; M quedarían sin IA», con el botón «Apagar xAI». | P2, P8, P9, P10 |
| `/admin/ia/multiproveedor/agregar` | Asistente Elegir → Clave → Modelos → Probar → Encender. Detalle abajo. | P1, P3, P4, P5, P6, P7, M2, M3, M4, M5, P9 |
| `/admin/ia/multiproveedor/[id]` | Ficha: estado, URL, clave (Reemplazar/Revocar), cada modelo con su precio (marca «precio estimado»), «Probar conexión» y su interruptor. Formulario «Cargar precio» y bitácora (quién · cuándo · qué cambió). | P4, P6, P7, P8–P10, M4–M8 |
| `/admin/ia/multiproveedor/agentes` | Por agente: principal y hasta 5 respaldos ordenados (↑/↓). Aviso ámbar «Sin respaldo: si el modelo falla, NaIA pasa a una persona». Respaldos incompatibles avisados antes de publicar. Guardar borrador, publicar, duplicar una versión publicada y volver a una versión anterior (con nota). | rutas existentes `agentes` + `versiones`, B-1, B-2, B-3, B-5, B-6 |
| `/admin/ia/multiproveedor/topes` | Por **canal** (en E1 `whatsapp` lo comparten Demo WApp y WhatsApp real; por línea llega en E2): barra «USD 3,20 de 5,00 (64 %)» con marca del umbral, estado, «precio estimado», «Hay llamadas sin precio: carga el precio» y reinicio a las 00:00 de Bogotá. Formulario (rechaza vacío, 0, «sin límite» y más de USD 1000 con el motivo), consumo del día, bitácora y alertas con «Marcar como vista». | T1–T6 |

**Detalle del asistente (`/agregar`):**
- Barra de pasos con `aria-current="step"`; en móvil, «Paso N de 5» + barra de progreso.
- Caja «¿Por qué? / ¿Para qué?» en cada paso.
- La clave va en un campo de contraseña. Ya guardada, solo se ve «Configurada ✓ · actualizada el dd/mm por X» con Reemplazar y Revocar; Revocar pide confirmación con impacto. Nunca hay «Ver».
- Errores junto a cada campo.
- Resultado de la prueba ✓/✗ con latencia y modelo, anunciado en `aria-live`.
- «Encender» deshabilitado con «Primero prueba la conexión».
- Borrador persistente («Guardado hace N s») que se retoma al recargar.

**Estados separados en todas las pantallas:**
- cargando (esqueletos; a los 10 s, «Sigue cargando…»);
- vacío;
- error (qué pasó, código + HTTP, Reintentar);
- sin permiso (403);
- deshabilitado con la razón escrita.

**Responsive:**
- Diseñado primero para web a 1280, con paridad a 390 y 360.
- Las tablas pasan a tarjetas y el diálogo de impacto ocupa toda la pantalla.
- La acción principal queda fija abajo con `env(safe-area-inset-bottom)`.
- Sin scroll horizontal a 360 (verificado por script en todas las capturas).
- Objetivos de 44×44 y texto base de 16 px.
- Se respeta `prefers-reduced-motion`.

**Colores A2:**
- Un solo CTA coral por pantalla (`#ff7a59` con texto `#1f1a4d`, peso 600).
- Las acciones destructivas usan rojo `#b91c1c`, no coral.
- Éxito, aviso y error siempre llevan ícono + texto.

## 3. Arquitectura y cómo cambiar de adaptador

```
components/admin/ia-e1/*        pantallas (sin fetch directo)
src/lib/admin-ia/cliente.ts     interfaz ClienteAdminIa (un método por endpoint) + clienteAdminIa
src/lib/admin-ia/api.ts         adaptador REAL (fetch) ← EL QUE SE USA
src/lib/admin-ia/ejemplo.ts     adaptador de EJEMPLO (memoria) ← solo pruebas/capturas
src/lib/admin-ia/logica.ts      lógica pura (tope, impacto, validaciones, respaldos)
src/lib/admin-ia/asistente.ts   lógica pura del asistente (pasos, botón Encender, borrador)
```

- **Por defecto** `clienteAdminIa` delega en `clienteApi` (real). No hay que tocar nada para producción.
- **Datos de ejemplo** (solo local):
  - Se activan con `usarAdaptadorDeEjemplo(clienteEjemplo)` desde una página que no se commitea.
  - Las pantallas muestran entonces el aviso «Datos de ejemplo».
  - En el ejemplo, `?escenario=vacio|error|lento|sin_permiso` fuerza cada estado.
- **Normalización en `api.ts`:** la API puede mandar `null` en varios campos y el adaptador pone valores seguros:
  - la clave de un proveedor recién creado;
  - el `actor` de la bitácora (se muestra «Sistema»);
  - las cifras de gasto;
  - `proveedor_nombre`.
- **Mensajes crudos de la BD:** si llegan en `error`, nunca se muestran como código; se ve `http_500`.
- **Errores:** HTTP + `error` + `mensaje` en español. Si traen `campo`, el mensaje va junto a ese campo (`campoDesdeApi`). Si no, va en línea arriba de los botones.
- **Interruptor y revocar:** usan el protocolo de confirmación. Un 409 `confirmacion_requerida` abre el diálogo y se confirma con `impacto_hash`. Un 409 `impacto_cambio` muestra el impacto nuevo.

## 4. Supuestos y lo que no hace la API (todavía)

- **«Modelo por agente»** se arma con las rutas **existentes** `GET /api/admin/ia/agentes` + `GET /api/admin/ia/versiones?agente_id=`. El contrato E1 no tiene un endpoint agregado, así que se hace 1 + N peticiones.
- **`requiere` (B3)** no lo da ninguna ruta de lectura. En pantalla se trata como «no requiere», y la validación real la hace B-5 (`respaldo_incompatible`), que se muestra en línea.
- **«por X» de la clave** sale del último evento `clave_guardar` / `clave_reemplazar` de la bitácora de P4. La API no lo manda en `clave`.
- **P9/P10** devuelven solo `{ id, encendido }`. La pantalla recarga en silencio para ver el estado nuevo.
- **Desvío ya aplicado:** un tope mayor que 1000 responde `tope_maximo` · «El tope máximo es USD 1000 al día». No es el `tope_muy_alto` de la fase 1.
- **No probado contra una BD real:** la regla es no tocar Supabase ni ejecutar SQL. El adaptador real se probó con un `fetch` falso (formas verificadas contra los servicios de `lib/admin-ia/`) y las pantallas con el adaptador de ejemplo.

## 5. Pruebas y capturas

- **Pruebas:** `src/lib/admin-ia/admin-ia.test.ts` (26 pruebas, incluidas en `npm test`). Cubren:
  - validación del tope: vacío, 0, «sin límite», más de 1000, «5,50»; y el umbral;
  - texto de la barra y conteo de impacto (3/2, borradores, `queda_con`, hash);
  - persistencia del borrador: lista blanca, nunca la clave, reanudar, JSON corrupto;
  - avance del asistente y botón Encender (la prueba se invalida si cambia el modelo o la clave);
  - `campoDesdeApi`, respaldos, parámetros del modelo y estado del panel;
  - protocolo del ejemplo;
  - adaptador real con `fetch` falso;
  - API real por defecto y ejemplo prohibido en producción.
- **Capturas** en `/workspace/e1-fe-capturas/` (no se commitean):
  - formato `<vista>-NN-nombre.png`, con `web` = 1280×800, `m390` = 390×844 y `m360` = 360×740;
  - se tomaron con una **página de vista previa local sin commitear** (`app/vista-previa-e1/[pantalla]`) que monta las pantallas dentro de una imitación del shell de `/admin` y activa el adaptador de ejemplo;
  - se eligió así porque `/admin` exige sesión de Supabase (middleware + layout). La página se borró antes del build y del commit; no se agregó ningún bypass al código.

## 5b. Retomar el asistente desde el servidor (F2, post-QA)

- **Fuente principal: el servidor.** Al abrir `/admin/ia/multiproveedor/agregar`:
  1. si este navegador tiene borrador con `proveedor_id`, se pide ese proveedor (P4);
  2. si no (otro navegador, incógnito), se elige con P2 el proveedor **apagado** con `asistente.completo = false` y `asistente.paso` guardado, el actualizado más recientemente (desempate por `id`), sin contar los que se descartaron en este navegador;
  3. con P4 se arma el borrador (`borradorDesdeServidor` en `src/lib/admin-ia/asistente.ts`): preset, URL, estado de la clave, modelo guardado (M1 → formulario), última prueba si sigue vigente y `asistente.paso`. El paso se valida con las reglas de navegación: si el servidor dice 4 pero falta la clave, se queda en Clave.
- **localStorage es respaldo:** solo aporta texto aún no guardado del **mismo** proveedor, y se usa entero si la API no responde. Si el proveedor ya está encendido o no existe (404), el borrador local se borra.
- Aviso «Retomamos X en el paso N de 5» con **«Empezar otro proveedor»** (lo recuerda en este navegador, `buscoedu:e1:asistente-descartados:v1`; el proveedor sigue apagado en el servidor, no se borra nada).
- **No hizo falta campo ni endpoint nuevo de BE**: P3 deja `asistente.paso = 2`, P5 guarda `asistente { paso, borrador }`, P2 da `asistente { paso, completo }` + `actualizado_en`, y P4 da `asistente { paso, borrador }`.
- **Mejoras opcionales para BE (no bloquean):**
  - `GET /api/admin/ia/proveedores` (P2): `asistente.actualizado_por: { id, nombre } | null` (y, si se quiere, filtro `?asistente=pendiente&mio=true`) para retomar solo los borradores propios cuando haya varios administradores. Hoy se retoma el más reciente de cualquiera.
  - `GET /api/admin/ia/modelos` / P4 `modelos[]` (M1): `abacus: { identificador_externo: string, referencia_secreto: string } | null` (son **nombres** de variables, no secretos). Sin eso, un Abacus retomado en otro navegador sin `asistente.borrador` vuelve a pedir esos dos campos en Modelos.

## 6. Bitácora

| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 18/10/2026 | Pantallas `/admin/ia/multiproveedor`: asistente de 5 pasos, proveedores con interruptor e impacto, ficha con bitácora, modelo + respaldos por agente, tope por canal con alertas. Capa de datos tipada con adaptador real (en uso) y de ejemplo (solo pruebas/capturas). 26 pruebas unitarias. | BA-036 UI + pantallas B y D de E1; que el panel siga el contrato `README-e1-api.md` (824ac4d) implementado en 2759bc2. | Frontend BuscoEdu (bot) |
| 18/10/2026 | Pulido QA (N1, N3): módulo único de etiquetas `src/lib/admin-ia/etiquetas.ts` (canales, proveedores, modelos, parámetros, estados, roles, tipos, errores y bitácora, con fallback que humaniza cualquier código; 8 pruebas) aplicado en todo `/admin/ia` (Resumen IA, Guía, agentes, contextos, canales, herramientas, fuentes, versiones, ejecuciones y multiproveedor); sin columnas «Código», «(obligatorio)» en vez de «*», «Proveedor: xAI» en vez de «Código: xai». En «Modelo por agente» se edita un agente a la vez y «Publicar vN» es el único botón coral; guardar, duplicar y restaurar son secundarios. `engines.node` `>=22 <23` y `.nvmrc` (22). | Que el panel no muestre códigos internos ni inglés y respete un solo CTA coral por pantalla; fijar la versión de Node con la que pasan las pruebas. | Frontend BuscoEdu (bot) |
| 18/10/2026 | Se reemplazó el formulario viejo `/admin/ia/proveedores` (`PaginaCatalogo`): ahora redirige al panel nuevo; se actualizaron el menú, el Dashboard IA y la Guía. | La API ya no crea proveedores sin `preset_codigo` ni deja editar `estado`; el formulario viejo fallaba y se saltaba la prueba de conexión. | Frontend BuscoEdu (bot) |
| 18/10/2026 | La barra fija de acciones móvil (z-50) queda por encima del botón flotante «NaIA» (z-40) y los diálogos (z-60) por encima de ambos. | En 390/360 el botón flotante tapaba «Continuar». | Frontend BuscoEdu (bot) |
| 2026-10-18 | F1: en `/admin/ia/multiproveedor/topes` la pantalla reserva al final el alto real de la barra fija «Guardar tope» (`RESERVA_BARRA_FIJA`: 69 px + 1,5 rem + área segura, solo móvil) y la barra ya no deja un hueco a mitad de página (`AccionesFijas espaciador={false}`). | A 390 y 360 la barra tapaba 45 px del final de «Cambios del tope». | Frontend BuscoEdu (bot FE) |
| 2026-10-18 | F2: el asistente retoma el paso desde el servidor (P2/P4 `asistente`) y deja localStorage como respaldo; aviso «Retomamos…» con «Empezar otro proveedor». 9 pruebas en `src/lib/admin-ia/asistente-servidor.test.ts`. Sin cambios de BE (ver §5b). | Otro navegador sin localStorage empezaba en el paso 1 aunque el proveedor ya estuviera creado (paso 2). | Frontend BuscoEdu (bot FE) |
| 2026-10-18 | Explorar: «Mostrar más» con orden estable (`creado_en` desc + `id` asc) y paginación por páginas pedidas (`src/lib/paginacion-ofertas.ts`, 7 pruebas). Detalle: `docs/frontend/README-explorar-paginacion.md`. «Coordinar con BE» por tocar `src/lib/ofertas.ts`. | Se quedaba en 14 de 50 por empates de `creado_en` y por calcular la página con lo deduplicado. | Frontend BuscoEdu (bot FE) |
