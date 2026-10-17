# Guía para Jhon: poner a funcionar WhatsApp de BuscoEdu

Esta guía es para ti, Jhon, paso a paso y sin tecnicismos. La parte técnica ya está hecha en el código (rama `feat/wa-meta`). Lo que falta son cosas que solo puedes hacer tú dentro de Meta y de Vercel.

> **Regla de oro: nunca pegues secretos en el chat** (ni con NaIA, ni con el bot, ni por Slack o correo). Los tokens y claves solo se pegan directamente en Vercel → Settings → Environment Variables. Si un token se filtra, se revoca y se genera otro.

Las marcas **(≈)** indican nombres de botones o datos que no pude confirmar en la documentación oficial de Meta (su sitio bloqueó la lectura automática). Si en tu pantalla dicen algo parecido, es eso mismo.

---

## 1. Crear el token permanente (System User)

El token que usamos hoy dura unas 24 horas. Para que el bot no se caiga cada día necesitas uno que no venza.

1. Entra a **business.facebook.com** con tu cuenta de administrador del negocio.
2. Abre **Configuración del negocio / Business Settings** (≈ en la versión nueva puede llamarse *Business portfolio settings*).
3. En el menú de la izquierda: **Usuarios → Usuarios del sistema / Users → System users**.
4. Toca **+ Agregar / + Add**. Ponle un nombre como `buscoedu-whatsapp-bot` y elige el rol **Admin**. Guarda.
5. Con ese usuario seleccionado, toca **Asignar activos / Assign assets**:
   - **Apps** → elige la app de BuscoEdu → activa **Manage app** (control total / *full control*).
   - **Cuentas de WhatsApp / WhatsApp accounts** → elige la cuenta de WhatsApp de BuscoEdu → activa **Manage WhatsApp Business accounts** (control total).
   - Guarda.
6. Toca **Generar token / Generate token**:
   - App: la de BuscoEdu.
   - Caducidad: **Nunca / Never** (≈ la opción exacta puede decir "Never expire").
   - Permisos (marca estos tres): `whatsapp_business_messaging`, `whatsapp_business_management`, `business_management`.
   - Toca **Generar**.
7. **Copia el token una sola vez**: Meta no lo vuelve a mostrar. Pégalo directo en Vercel (paso 5 de esta guía), no en un chat ni en un documento compartido.

## 2. Conectar el webhook en Meta

El webhook es la "puerta" por donde Meta le avisa a BuscoEdu que alguien escribió.

1. Entra a **developers.facebook.com → Mis apps / My Apps** → la app de BuscoEdu.
2. En el menú: **WhatsApp → Configuración / Configuration** (≈).
3. En la sección **Webhook** toca **Editar / Edit**:
   - **Callback URL**: `https://www.buscoedu.com/api/whatsapp/webhook`
   - **Verify token**: una frase secreta que inventes tú (larga, sin espacios, p. ej. 30 letras y números al azar). Esa misma frase va en Vercel como `META_WA_VERIFY_TOKEN`.
4. Toca **Verificar y guardar / Verify and save**. Solo funciona **después** del deploy con las variables puestas (paso 5); si sale error, mira la tabla del final.
5. En la lista de campos del webhook, junto a **messages** toca **Suscribirse / Subscribe**. Sin esto, Meta no envía los mensajes.

## 3. Agregar los celulares del equipo (piloto cerrado)

Mientras el catálogo real de universidades aliadas no esté cargado, el bot **solo contesta a los celulares del equipo**. Hay dos listas que tienen que coincidir:

**a) En Meta (solo mientras usemos el número de prueba de Meta):**
1. developers.facebook.com → la app → **WhatsApp → API Setup / Configuración de la API** (≈).
2. En el campo **Para / To** toca **Administrar lista de números / Manage phone number list** (≈).
3. Agrega el celular con indicativo (+57…). A ese celular le llega un **código por WhatsApp**; escríbelo para confirmar.
4. Repite con cada persona. (≈ Meta permite unos 5 números de prueba; no está confirmado en la documentación oficial.)

**b) En Vercel (la que decide a quién responde el bot):**
- Variable `WA_PILOTO_NUMEROS` con los celulares separados por coma, con `+` y sin espacios. Ejemplo de forma (números inventados): `+573001112233,+573004445566`
- Máximo **5** números. Si pones 6 o uno mal escrito, el bot no le responde a nadie (es a propósito: más vale callar que escribirle a quien no toca).
- Si la variable está vacía, el bot no le responde a nadie.

A cualquier otro número el bot no le contesta ni le guarda nada: solo queda un registro técnico con el número tapado (`+57••••••233`).

## 4. Por qué todavía no se generan leads

Hay un interruptor llamado `WA_LEAD_CONVERSION_ENABLED`. **Está apagado por defecto.**

- Apagado (o sin poner): el estudiante puede buscar, guardar en su lista, aplicar y tocar *Autorizo contacto*. Su solicitud queda **registrada** y le decimos con honestidad: *"Estamos en piloto: tu autorización quedó registrada, pero todavía no enviamos datos a universidades."* **No se crea oportunidad ni transferencia facturable.**
- Encendido (solo si escribes exactamente `true`, en minúsculas): ahí sí se crea el lead en Lead Center, con la conversación de WhatsApp.

Lo dejamos apagado porque hoy en producción solo hay universidades de prueba y porque la creación de leads desde WhatsApp debe validarse primero. Encenderlo es una decisión tuya con Producto.

Y para abrirle el bot a **cualquier persona** (no solo al equipo) existe `WA_REAL_HABILITADO`. Tampoco se enciende hasta que el catálogo real esté cargado.

## 5. Variables que irán a Vercel

Solo los nombres; los valores los pegas tú en Vercel → Project → Settings → Environment Variables (Production). **Requieren tu OK y un nuevo deploy** para que tomen efecto.

| Nombre | Qué es | Valor inicial sugerido |
|---|---|---|
| `META_WA_TOKEN` | Token permanente del paso 1 | (secreto) |
| `META_WA_PHONE_NUMBER_ID` | Identificador del número (API Setup) | (de Meta) |
| `META_WABA_ID` | Identificador de la cuenta de WhatsApp | (de Meta) |
| `META_APP_SECRET` | App → Configuración → Básica → *App secret* | (secreto) |
| `META_WA_VERIFY_TOKEN` | La frase que inventaste en el paso 2 | (secreto) |
| `WA_PILOTO_NUMEROS` | Celulares del equipo (máx 5) | `+57…,+57…` |
| `WA_LEAD_CONVERSION_ENABLED` | Interruptor de leads | `false` |
| `WA_REAL_HABILITADO` | Abrir a todo el público | `false` |
| `META_GRAPH_API_VERSION` | Opcional | `v26.0` |

Además, la base de datos necesita las tablas nuevas (migración `20261017120000_ba032_whatsapp_meta.sql`). La aplica el equipo técnico cuando lo autorices; sin eso, el bot no responde.

## 6. Verificación del negocio y número real

Para pasar del número de prueba a uno propio de BuscoEdu:

1. **Verificación del negocio** en Business Settings → **Centro de seguridad / Security Center** → *Iniciar verificación* (≈). Pide documentos de la empresa (RUT, cámara de comercio).
2. **Número real**: una línea (SIM o fija) que **no tenga WhatsApp activo**. Si tiene WhatsApp o WhatsApp Business, hay que borrar esa cuenta primero.
3. **Nombre visible** (*display name*): "BuscoEdu". Meta lo revisa y lo aprueba.
4. **Método de pago**: tarjeta en WhatsApp Manager → Configuración de pagos (≈).
5. Cuando el número real esté listo, cambia `META_WA_PHONE_NUMBER_ID` en Vercel y haz deploy.

## 7. Costos

Según la página oficial de preguntas frecuentes de WhatsApp Business (https://whatsappbusiness.com/resources/faq/):

- Meta cobra **por mensaje entregado**, según la categoría (marketing, utilidad, autenticación, servicio) y el país.
- **Cambio importante desde el 1 de octubre de 2026:** las respuestas que damos dentro de la ventana de 24 horas que abre el estudiante (mensajes de "servicio") **ya no son gratis sin límite**. Cada número tiene **1.000 mensajes de servicio gratis al mes**; desde el 1.001 se cobran a la tarifa publicada.
- Los mensajes que nos escriben los estudiantes no cuestan.
- Las plantillas que inicia el negocio (marketing, recordatorios) se cobran siempre. **Nuestro MVP no usa plantillas.**
- Tarifas por país: https://developers.facebook.com/docs/whatsapp/pricing (≈ no pude abrirla para confirmar las cifras de Colombia).

Con el piloto de 5 personas el consumo debería quedar dentro de los 1.000 gratis.

## 8. Si algo falla

| Lo que ves | Causa probable | Qué hacer |
|---|---|---|
| Al tocar "Verify and save" sale error | Falta `META_WA_VERIFY_TOKEN` en Vercel, la frase no coincide o no se hizo deploy | Revisa que sea idéntica en Meta y en Vercel, y haz deploy |
| El bot no contesta a nadie | `WA_PILOTO_NUMEROS` vacía, con más de 5 números o mal escrita; o no te suscribiste a `messages` | Corrige la lista (+57…, separados por coma) y revisa la suscripción en Meta |
| El bot contesta a unos sí y a otros no | Ese número no está en `WA_PILOTO_NUMEROS` (o en la lista de prueba de Meta) | Agrégalo en ambas listas |
| Funcionó un día y al siguiente dejó de enviar | Se venció el token temporal | Crea el token permanente (paso 1) y cámbialo en Vercel |
| Meta muestra errores 401 en la entrega del webhook | `META_APP_SECRET` incorrecto o falta | Copia de nuevo el App secret en Vercel y haz deploy |
| El bot no responde después de que alguien no escribió en más de un día | Regla de 24 horas: solo respondemos si el estudiante escribió hace menos de 24 h | Es normal; cuando el estudiante vuelva a escribir, el bot responde |
| Alguien escribió BAJA y ya no recibe nada | Pidió no recibir más mensajes | Es lo correcto. Si quiere volver, que escriba ALTA |
| El estudiante pide asesor y nadie responde | Aún no hay pantalla para que un asesor conteste desde Lead Center | Pendiente técnico; mientras tanto, revisar la lista de escalamientos en la base |
| Se agradece la solicitud pero no aparece lead en Lead Center | El interruptor `WA_LEAD_CONVERSION_ENABLED` está apagado (a propósito) | Ver sección 4 |
| El bot dice "tuve un problema técnico" | Falla de base de datos, catálogo o de Meta | Avisar al equipo técnico con la hora aproximada; no se guarda nada a medias |


## Piloto: si alguien escribe ASESOR
El bot le responde: *"Un asesor del equipo BuscoEdu te escribirá en horario hábil."* Todavía no hay pantalla en Lead Center para contestar, así que **alguien del equipo debe responderle a mano desde Meta** (WhatsApp Manager) en horario hábil. Nunca prometemos una persona que no va a llegar.
