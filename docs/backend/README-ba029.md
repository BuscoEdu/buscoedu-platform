# BA-029 — Backend: APIs leen el canal WhatsApp

Misma NaIA del Centro IA. No hay segundo bot ni tablas nuevas. El SQL de activación del canal está en el handoff BD (`docs/bd/README-ba029.md`); este documento es solo el contrato de runtime.

## Cómo se pasa `codigo_canal`

Valores admitidos: `web` | `whatsapp` (se normalizan mayúsculas y espacios).

| Superficie | Canal |
|---|---|
| `POST /api/naia` | Body `codigo_canal`. Si el campo no viene o es `null`, queda `web` (chat público actual). |
| `POST /api/admin/ia/versiones/:id/simular` | Mismo body. Omitido = `web`. |
| Demo WApp (`/api/demowapp/sesiones/:id/mensaje` y `/api/demowapp/estudiante/:token`) | Siempre `whatsapp` (`DEMOWAPP_CANAL`). No se puede pedir `web` desde esas rutas. |

Ejemplo web explícito y WhatsApp:

```json
{ "mensaje": "busco becas de ingeniería", "codigo_canal": "whatsapp" }
```

Demo WApp no llama a Abacus por su cuenta. Resuelve el agente predeterminado del canal y ejecuta `agenteExecutor` con `codigo_canal: "whatsapp"`. El CRM del turno viaja en `contexto_persona` (`CONTEXTO_CRM` del mensaje), acotado para no inflar el payload. La sesión de hechos del hilo (BA-024) entra como `sesion_previa` y prevalece sobre la bitácora. La voz BA-024 se conserva; no se vuelve a anteponer la etiqueta `Tono para este canal`. En WhatsApp el executor suma `CONTRATO_JSON_WAPP` (resumen, intención, escalamiento).

## Qué cambia en el prompt

`AgenteExecutor.resolverConfiguracion` sigue exigiendo `configuraciones_agente_canal` activa. Además:

- Componentes con `tipo_contexto=canal` entran solo si el último segmento de su `codigo` es el canal activo (`contexto_canal_web` en web, `contexto_canal_whatsapp` en WhatsApp). El resto de tipos no se filtra.
- Las reglas de tono, longitud, `reglas_especificas` y plantilla salen de la fila de ese canal.
- Las herramientas se listan solo si `canales_permitidos` incluye el canal (`null` = sin restricción registrada).

## Errores fail-closed

Estos códigos no caen al fallback conversacional ni al canal web.

| Código | HTTP | Cuándo |
|---|---|---|
| `canal_invalido` | 400 | `codigo_canal` presente y distinto de `web` / `whatsapp` (incluye string vacío). |
| `canal_no_encontrado` | 422 | No existe fila en `canales_ia`. |
| `canal_no_configurado` | 422 | Canal inactivo, o la versión no tiene `configuraciones_agente_canal` activa. |
| `agente_canal_no_asignado` | 422 | El canal no tiene agente predeterminado activo. |

Cuerpo en `/api/naia`: `{ "ok": false, "code": "canal_no_configurado", "message": "…" }`.

Cuerpo en Demo WApp y simulador: `{ "ok": false, "code": "…", "error": "…" }`.

Un fallo del proveedor (Abacus) en el chat web sigue devolviendo el fallback 200 de siempre. En Demo WApp, ese fallo deja un mensaje de contingencia en el hilo; la falta de config del canal no.

## Archivos

- `lib/agentes/canales.ts` — resolución y filtro
- `lib/agentes/AgenteExecutor.ts` — config de canal, filtro de contexto, CRM
- `app/api/naia/route.ts`
- `app/api/admin/ia/versiones/[id]/simular/route.ts`
- `src/lib/demowapp/mensaje-service.ts`
- `app/api/demowapp/sesiones/[oportunidadId]/mensaje/route.ts`
- `app/api/demowapp/estudiante/[token]/route.ts`
