# BA-029 — Activar canal WhatsApp (Centro IA)

## Inventario (pre-change)

| Pieza | Estado previo |
|---|---|
| `canales_ia.whatsapp` | existía, `activo=false`, sin agente |
| `configuraciones_agente_canal` | solo `web` |
| `contexto_canal_whatsapp` | no existía (sí `contexto_canal_web`) |
| Admin LC `/admin/ia` | ya edita canales / contextos / config canal |
| `/api/naia` | hardcodea `codigo_canal=web` (BE Ola 1 #2) |
| `contexto_naia` | **legacy** — no tocar (BA-009) |

## Qué hace el SQL ops

1. Activa `canales_ia.whatsapp` y asigna `agente_predeterminado_id` = NaIA.
2. Crea/actualiza componente `contexto_canal_whatsapp` (editable en Lead Center).
3. Lo vincula a la versión activa de NaIA.
4. Crea/actualiza `configuraciones_agente_canal` para WhatsApp (tono corto, consent true).
5. Amplía `canales_permitidos` de herramientas a incluir `whatsapp` (sin delete).

Archivos:

- Ops (fuente para pegar en el Editor): `supabase/ops/20260927_ba029_activar_canal_whatsapp.sql`
- Migración versionada (misma transacción `BEGIN…COMMIT`; VERIFY solo en comentarios): `supabase/migrations/20260927120000_ba029_activar_canal_whatsapp.sql`
- Semilla de entornos nuevos (no pisa el canal web): `supabase/seeds/centro_agentes_ia_seed.sql`

## Índices usados por ON CONFLICT

Verificados en `supabase/migrations/20260903030000_gobierno_agentes_ia.sql`. Son únicos y no parciales:

- `idx_versiones_agente_contextos_unica` en `(version_agente_id, componente_contexto_id)`
- `idx_configuraciones_agente_canal_unica` en `(version_agente_id, canal_id)`

`canales_ia.codigo` y `componentes_contexto_ia.codigo` son `UNIQUE` de tabla.

## Apply (prod)

Solo cuando Orquestador pida a Jhon pegar el SQL de ops. No re-correr a ciegas. Este lote no ejecuta SQL contra producción.

## Verify

Ver bloque VERIFY al final del SQL de ops.

## Handoff BE

Demo WApp / APIs deben resolver `codigo_canal=whatsapp` y preferir config de ese canal. Filtrar componentes `tipo_contexto=canal` por canal para no mezclar web+WApp en el mismo prompt.
