# BA-024 — Voz, sesión y markdown de NaIA

**Rama:** `feat/lote-ba-naia-wapp`  
**Alcance:** backend. Sin PR. Sin cambios de catálogo, consentimiento ni UI.

## Qué cambió

NaIA dejaba de sonar natural por tres parámetros del backend: la etiqueta `Tono para este canal: cercano`, el formato que prohibía markdown y una grilla fija de opciones. El runtime ahora agrega un bloque de voz que prevalece sobre ese texto viejo.

- **Tono:** tú, colombiano neutro, una pregunta por turno, valida lo dicho, no favorece universidades.
- **Formato:** el JSON sigue siendo el sobre. El campo `mensaje` lleva markdown (**negrita**, 2–4 oraciones, viñetas cortas).
- **Parámetro:** `temperature` 0.6 en la llamada a Abacus (`getConversationResponse`). Si el despliegue ya trae `configuracion_tecnica.temperature` entre 0 y 1, se respeta.
- **Límites intactos:** no se inventan ofertas; máximo 8 fichas si se mencionan; Mi lista, Aplicar y Autorizar siguen siendo pasos distintos; sin consentimiento vigente no hay lead a una universidad.

## Cómo se recoge y se reusa la sesión

Solo entra un dato si el estudiante lo dijo en el turno. No se completan huecos.

| Dato | Web (`/api/naia`) | DemoWapp |
| --- | --- | --- |
| Ciudad, modalidad, presupuesto, nivel, intereses, nombre, correo, celular | Se extraen del mensaje y se guardan en `ejecuciones_agente_ia.respuesta.sesion_estudiante` (jsonb ya existente), ligados al `conversationId` del hilo. | Se reusa `hechos_extraidos_naia`. Presupuesto, intereses y contacto se agregan como hechos; no entran al orden del perfil mínimo ni mueven el funnel. Si la persona corrige un dato, manda lo último guardado en `conversaciones.contexto_resumido`. |
| Si la lectura o el insert fallan | La sesión de ese turno queda vacía o solo con lo de este mensaje. No se inventa memoria. | El turno sigue (`bestEffort`). Lo dicho en el mensaje igual entra al prompt. |

En los turnos siguientes el bloque `SESION_ESTUDIANTE` viaja con la voz corta (sin reenviar el prompt largo, para no repetir el 414). Los filtros de catálogo ya anclados se reenvían; una ciudad que el modelo se invente y que no esté dicha se descarta.

## Archivos

- `lib/agentes/vozNaia.ts` — voz, temperature, extracción y reuso
- `lib/agentes/sesionEstudianteStore.ts` — lectura fail-closed de la bitácora
- `lib/agentes/AgenteExecutor.ts` — deja de emitir la etiqueta de tono y la grilla fija
- `lib/agentes/AbacusAdapter.ts` — envía `temperature`
- `app/api/naia/route.ts` — fallback sin grilla
- `src/lib/demowapp/mensaje-service.ts` — misma voz; ya no manda la lista de faltantes al modelo. BA-029 (mismo branch, commit posterior) deja de llamar a Abacus por su cuenta y pasa `sesion_previa` al executor con `codigo_canal=whatsapp`. La voz, la temperatura y esta sesión no se revierten.
- `supabase/seeds/centro_agentes_ia_seed.sql` y `supabase/migrations/20260927190000_ba024_voz_naia.sql` — alinean el texto de fábrica si nadie lo editó

## Smoke conceptual (3 turnos)

1. «Quiero estudiar derecho en Bogotá, virtual, presupuesto de 2 millones» → guarda ciudad, modalidad, intereses y presupuesto. No inventa contacto.
2. «Es pregrado. Me llamo Laura Pérez, correo laura@correo.com» → suma nivel y contacto; conserva Bogotá y virtual.
3. «¿Qué opciones ves?» → no agrega datos; la sesión sigue citando lo dicho. Si el modelo responde ciudad Medellín, el filtro se queda en Bogotá.
