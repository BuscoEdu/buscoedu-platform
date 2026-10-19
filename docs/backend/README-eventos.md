# POST /api/eventos — eventos de negocio desde el servidor

**Fecha:** 2026-10-19 · **Autor:** Backend BuscoEdu (bot) · **Rama local:** `fix/eventos-servidor` (sin push).

## Qué es y por qué
- **Qué:** ruta del servidor que guarda en `public.eventos_negocio` los eventos del sitio público (NaIA, Explorar, Mi lista) con el cliente **service role**.
- **Por qué:** en el smoke de QA en producción, `trackEvent` insertaba desde el navegador con la clave anon y RLS lo rechazaba (`42501` ×2, HTTP `401` ×3): los eventos se perdían. Así no se abre RLS a anon.
- **Archivos:** `app/api/eventos/route.ts` (envoltorio) · `src/lib/eventos-servidor.ts` (lógica, cupos, origen) · `src/lib/eventos-contrato.ts` (lista permitida, validación, `construirFilaEvento`) · cliente `src/lib/events.ts`.
- **Pruebas:** `src/lib/eventos-servidor.test.ts` (10) y `src/lib/events.test.ts` (5), con fakes y sin red.

## Contrato

`POST /api/eventos` · `Content-Type: application/json` (también acepta `text/plain` de `sendBeacon`; el cuerpo se lee como texto JSON).

```json
{
  "evento": "ficha_oferta_abierta",
  "visitante_id": "uuid",
  "oferta_id": "uuid | null (opcional)",
  "programa_id": "uuid | null (opcional)",
  "universidad_id": "uuid | null (opcional)",
  "metadatos": { "clave_snake": "texto ≤ 500 | número | booleano | null" }
}
```

| Regla | Valor |
|---|---|
| `evento` (lista permitida, `EVENTOS_PERMITIDOS`) | `naia_modal_abierto`, `intencion_busqueda_enviada`, `ficha_oferta_abierta`, `ficha_oferta_cerrada`, `intento_aplicar_oferta`, `oferta_agregada_mi_lista`, `oferta_retirada_mi_lista` |
| `visitante_id` | obligatorio, UUID v1–5 (lo genera `src/lib/visitor.ts` y vive en `localStorage`; no hay cookie de visitante) |
| ids | UUID, `null` o ausentes |
| `metadatos` | objeto plano de un nivel, ≤ 10 claves `^[a-z][a-z0-9_]{0,39}$`, textos ≤ 500, ≤ 2 KB serializado; ausente → `{}` |
| Campos extra | rechazados (`creado_en`, `generado_por`, `persona_id`, `tipo_evento`, …) |
| Cuerpo crudo | ≤ 4 KB |
| Origen | `Origin` obligatorio y con el mismo host que la petición (`x-forwarded-host` o `Host`); `Sec-Fetch-Site: cross-site` se rechaza |
| Cupos (en memoria, por instancia, como `/api/naia`) | 120/min por IP · 60/min por visitante |
| Lo fija el servidor | `creado_en` = hora del servidor · `generado_por` = `'web'` |

Escritura: `upsert` en `visitantes` (`id = identificador_navegacion = visitante_id`, `ignoreDuplicates`) porque `eventos_negocio.visitante_id` tiene FK a `visitantes(id)`, y luego `insert` de `construirFilaEvento(...)`.

| Código | `code` | Cuándo |
|---|---|---|
| 204 | — | guardado |
| 400 | `json_invalido`, `cuerpo_invalido`, `cuerpo_muy_grande`, `campo_no_permitido`, `evento_no_permitido`, `visitante_invalido`, `id_invalido`, `metadatos_invalidos`, `metadatos_muy_grandes` | cuerpo inválido |
| 403 | `origen_no_permitido` | otro origen o sin `Origin` |
| 429 | `rate_limited` (+ `Retry-After: 60`) | cupo agotado |
| 500 | `error_interno` · «No se pudo registrar el evento.» | fallo de BD o falta `SUPABASE_SERVICE_ROLE_KEY`; el detalle queda solo en el log del servidor (código de error, sin mensaje) |

## Cliente
`trackEvent` envía el cuerpo con `fetch(..., { keepalive: true })` (sobrevive al `router.push` que sigue a los eventos de NaIA) y, sin `fetch`, `navigator.sendBeacon`. Es fire-and-forget y nunca lanza: los callers no cambian. Ya no usa la clave anon para `eventos_negocio`. `trackSearchIntention` recorta la intención a 500 caracteres. Se quitaron `trackFilterApplied/Modified/Removed`, que no tenían callers.

## Causa de los 401
PostgREST responde `42501` (insufficient_privilege / RLS) con **HTTP 401 cuando el rol es anon** (sin JWT de usuario) y 403 cuando hay usuario. En el Home (`NaiaHomeHero`) un visitante nuevo dispara 3 peticiones REST con la clave anon: `insert` en `visitantes` (`getOrCreateVisitorId`) + `insert` en `eventos_negocio` de `naia_modal_abierto` y de `intencion_busqueda_enviada`. Las tres devuelven 401; las dos de eventos muestran el `42501` en consola (`console.error` con el objeto) y la de visitantes solo un aviso con el mensaje. Arreglo: eventos por `/api/eventos` y sin alta de `visitantes` desde el navegador (la hace el servidor). No hay otra ruta con 401 en ese flujo (`/api/naia` no exige sesión).

## Base de datos
No hace falta política nueva: service role omite RLS. Propuesta **no aplicada** para revisión de BD: `supabase/ops/20261019_eventos_negocio_rls_propuesta.sql`.

## Riesgos
- `SUPABASE_SERVICE_ROLE_KEY` (y `NEXT_PUBLIC_SUPABASE_URL`) deben existir en Vercel Producción; ya la usan `/api/naia`, OTP y Lead Center, pero no se verificó en Vercel. Si falta, la ruta responde 500 y los eventos se siguen perdiendo (sin romper la página).
- Cupos por instancia: no es un cupo global.
- Se crea la fila de `visitantes` al primer evento: cualquier visitante del sitio (con cupo) puede crear filas, igual que el INSERT anónimo que pretendía el diseño original.

## Bitácora
| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-19 | `POST /api/eventos` con service role, `trackEvent` vía la ruta, sin alta de `visitantes` desde el navegador | inserts con anon fallaban por RLS (42501 / 401) en producción y los eventos se perdían | Backend BuscoEdu (bot) |
