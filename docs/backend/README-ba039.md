# BA-039 — Voz de NaIA y canales leídos de la base de datos

> Épica **E1 · IA multi-proveedor** · Ola 1/4, ítem 2/2 · Dueño: Backend (+ semilla BD).
> Brief: `buscoedu-knowledge/briefs/e1-ia-multiproveedor.md`, criterios **E1–E3** y **F1–F2**.
> Rama local `feat/ba039-voz-canales` desde `4375904` (Restyle A2). Sin push, sin deploy, migración sin aplicar.

## 1. Qué se hizo y para qué sirve

### E · Voz de NaIA en la base de datos

| Antes (BA-024) | Ahora (BA-039) | Para qué |
|---|---|---|
| `BLOQUE_VOZ_NAIA` y `CONTRATO_JSON_WAPP` fijos en `lib/agentes/vozNaia.ts` | Tono y formato salen de 3 componentes de contexto asociados a la versión de NaIA: `voz_naia` (`tipo_contexto = voz`), `contrato_salida_naia` (`contrato_salida`) y `contrato_salida_naia_whatsapp` (`contrato_salida_canal`) | Editar tono y formato desde `/admin/ia → Contextos`, versionados con la versión del agente, sin redeploy (E1) |
| Las reglas de no inventar iban dentro del mismo texto | Las reglas de no inventar (datos del estudiante y catálogo) siguen **fijas en código** (`REGLAS_FIJAS_DATOS_NAIA`, `REGLAS_FIJAS_CATALOGO_NAIA`) y se intercalan siempre | Desde el panel no se pueden borrar ni saltar (E3) |
| — | La migración y la semilla cargan **exactamente** el texto actual, y el armado conserva el orden de BA-024 | El tono y el formato no cambian (E2). Un test lo compara byte a byte |

Cómo se arma el bloque que recibe el modelo (`lib/agentes/vozDesdeBd.ts → resolverVozNaia`):

```
voz (BD)  +  REGLAS_FIJAS_DATOS (código)  +  contrato_salida (BD)  +  REGLAS_FIJAS_CATALOGO (código)
[+ "\n\n" + contrato_salida_canal del canal activo, p. ej. WhatsApp]
```

- El executor separa los componentes `voz` / `contrato_salida` / `contrato_salida_canal` del prompt de sistema general (si no, se duplicarían) y los pasa a `resolverVozNaia`. No hace una consulta nueva: usa la misma lectura de `versiones_agente_contextos` de siempre.
- `contrato_salida_canal` sigue la convención de BA-029: el último segmento del código es el canal (`..._whatsapp`). Un contrato de otro canal no entra.
- El armado del turno (prompt de sistema / mensaje del usuario) se movió sin cambios a `componerEntradaTurnoNaia` para poder probarlo sin BD.
- El formulario de contextos del panel suma los 3 tipos nuevos al selector. Sin eso, al editar `voz_naia` el selector mostraría otro tipo.

**Si la BD no devuelve la voz.** El brief no pide fail-closed para la voz, y su journey dice que el estudiante siempre recibe respuesta. Por eso:
- Si no hay componente (migración sin aplicar), o está inactivo, vacío o pasa de 6.000 caracteres, se usa la **copia en código, que es idéntica**. Se escribe una advertencia en el log: `[BA-039 voz] agente=… version=… canal=… avisos=voz_desde_codigo,…`. Sale como máximo una vez cada 10 min por combinación y proceso, y nunca incluye el texto de la voz ni datos del estudiante.
- Si hay dos componentes del mismo tipo, se usa el de menor `orden` y se avisa (`voz_duplicado`).
- Si **falla la lectura de contextos** en BD, se mantiene el comportamiento anterior: `error_contextos` (lo lanza el executor y la ruta responde con su fallback conversacional). Este error no es nuevo.
- Las reglas fijas y el catálogo validado no dependen de la BD, así que el respaldo no relaja ninguna regla.

### F · Canales sin lista fija

| Antes (BA-029) | Ahora (BA-039) | Para qué |
|---|---|---|
| `CANALES_IA_SOPORTADOS = ['web','whatsapp']` en `lib/agentes/canales.ts` | Lista eliminada. `resolverCodigoCanalExplicito` (ahora `async`) valida contra `canales_ia` con `activo = true` mediante la interfaz `FuenteCanalesIa` (`lib/agentes/canalesActivos.ts`) | Encender o apagar un canal desde el panel sin tocar código (F1) |
| Desconocido → `canal_invalido` 400 | Desconocido o **inactivo** → `canal_invalido` 400, con el mismo mensaje (`codigo_canal no soportado: email. Use web o whatsapp.`) | `email` y `llamada` inactivos se rechazan igual que hoy (F2) |
| — | Error de BD, o ningún canal activo → `canales_no_disponibles` **503** (nuevo código en `CODIGOS_ERROR_CANAL_FAIL_CLOSED`, devuelto tal cual por las rutas) | Rechazo por defecto: nunca cae en silencio a `web` |
| Omitido → `web` sin validar | Omitido → `web`, que **también debe estar activo** | Mismo contrato histórico, ahora fail-closed |

- Caché corta de 30 s por proceso (`TTL_CANALES_MS`). Para no consultar la BD en cada mensaje, apagar un canal tarda hasta 30 s en aplicarse (el brief C1 pide ≤ 60 s). Solo se guardan lecturas exitosas y no vacías; los errores no se cachean, y las lecturas simultáneas comparten una sola consulta.
- La fuente de Supabase solo lee `codigo, activo`, vuelve a filtrar `activo === true` en código y del error de Supabase registra únicamente el código.
- El executor sigue comprobando además `canales_ia.activo` y `configuraciones_agente_canal` del canal (BA-029). Esa doble barrera se mantiene.

## 2. Archivos

| Ruta | Cambio |
|---|---|
| `lib/agentes/vozNaia.ts` | Voz dividida en 4 piezas + `componerBloqueVozNaia`. `BLOQUE_VOZ_NAIA` y `CONTRATO_JSON_WAPP` quedan iguales |
| `lib/agentes/vozDesdeBd.ts` (nuevo) | `resolverVozNaia`, `esTipoContextoVoz`, `avisarVozNaia`, `componerEntradaTurnoNaia` (módulo puro) |
| `lib/agentes/canalesActivos.ts` (nuevo) | `FuenteCanalesIa`, `crearRegistroCanales` (caché), `resolverCodigoCanal`, códigos fail-closed (módulo puro) |
| `lib/agentes/canales.ts` | Sin lista fija; `fuenteCanalesSupabase`; `resolverCodigoCanalExplicito` asíncrona; re-exporta lo puro |
| `lib/agentes/AgenteExecutor.ts` | Separa componentes de voz, arma `config.voz`, usa `componerEntradaTurnoNaia` |
| `lib/agentes/tipos.ts` | `ConfiguracionAgente.voz` |
| `lib/agentes/errores.ts` | `codigo` declarado aparte (mismo comportamiento) para que los tests con strip-types lo carguen |
| `lib/agentes/index.ts` | Quita `CANALES_IA_SOPORTADOS`; exporta lo nuevo |
| `app/api/naia/route.ts`, `app/api/admin/ia/versiones/[id]/simular/route.ts` | `await resolverCodigoCanalExplicito(...)` |
| `components/admin/ia/FormularioContexto.tsx` | Tipos `voz`, `contrato_salida`, `contrato_salida_canal` en el selector |
| `supabase/migrations/20261018120000_ba039_voz_naia_componentes.sql` (nuevo, **no aplicado**) | Crea los 3 componentes con el texto actual y los asocia a la versión activa de NaIA |
| `supabase/seeds/centro_agentes_ia_seed.sql` | Mismos 3 componentes, asociados a la v1.0 de la semilla |
| `lib/agentes/ba039-voz.test.ts`, `lib/agentes/ba039-canales.test.ts` (nuevos) + `package.json` | 28 tests nuevos en `npm test` |
| `docs/centro-agentes-ia.md` | §5.2 actualizado (canal nuevo = activarlo en BD) |

## 3. Migración (no aplicada) y cómo deshacerla

`20261018120000_ba039_voz_naia_componentes.sql` es idempotente: `ON CONFLICT DO NOTHING` en componentes (no pisa una edición) y en vínculos (índice único de 20260903030000). No contiene DELETE, DROP ni TRUNCATE. Para deshacerla (el runtime vuelve a la voz de código, que es idéntica):

```sql
BEGIN;
DELETE FROM public.versiones_agente_contextos vac
USING public.componentes_contexto_ia c
WHERE vac.componente_contexto_id = c.id
  AND c.codigo IN ('voz_naia','contrato_salida_naia','contrato_salida_naia_whatsapp');
DELETE FROM public.componentes_contexto_ia
WHERE codigo IN ('voz_naia','contrato_salida_naia','contrato_salida_naia_whatsapp');
COMMIT;
```

Si no se quiere borrar nada, basta con `UPDATE ... SET activo = false, estado = 'inactivo'` sobre esos 3 códigos.

F no necesita migración: `canales_ia.activo` ya existe y en prod están web/whatsapp activos y email/llamada inactivos (semilla + BA-029).

## 4. Tests

- `ba039-voz.test.ts`: regresión E2 con el literal de 4375904; migración = semilla = código; las 5 preguntas × web/whatsapp × turno 1/2+ producen una entrada al modelo idéntica; respaldo si la BD está vacía o trae datos malos; aviso en el log; E3 (las reglas fijas no se borran); contrato por canal; idempotencia de la migración.
- `ba039-canales.test.ts`: canal activo aceptado; canal nuevo activado en BD aceptado; email/llamada (F2), canal desconocido, vacío o que no es texto → 400; web inactivo sin fallback; error de BD y "sin datos" → 503; caché, TTL, sin cachear errores, invalidar.
- Comprobado con una mutación: si se cambia una coma en la voz de la migración, fallan 5 tests.

## 5. Riesgos y pendientes

- **Hasta aplicar la migración en prod:** NaIA usa la voz de código, con el mismo tono. Cada instancia deja una advertencia `[BA-039 voz] … voz_desde_codigo` cada 10 min. La voz todavía no se puede editar desde el panel.
- **F entra en vigor con el deploy, aunque no haya migración:** un error al leer `canales_ia` responde 503 en `/api/naia` y en el simulador. Antes, con la lista fija, la validación no dependía de la BD (luego el executor sí la consultaba).
- La comparación "lado a lado" con el modelo real (E2, 5 preguntas contra Abacus) queda para QA. Aquí se prueba que la entrada al modelo es byte a byte la misma.
- Las versiones borrador creadas después de la migración necesitan tener asociados los 3 componentes. Si no los tienen, usan la voz de código y dejan un aviso.
- La línea «No favoreces ninguna universidad… no prometas admisión, cupo ni beca» queda dentro de la voz editable para conservar el orden exacto. Esa regla también está en el componente `reglas_negocio_naia`.

## 6. Bitácora

| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 | Voz y contrato de salida de NaIA pasan a componentes de BD (`voz`, `contrato_salida`, `contrato_salida_canal`) con respaldo en código idéntico y reglas de no inventar fijas | Criterios E1–E3 del brief E1: tono editable sin cambiar el actual y sin poder borrar reglas | Backend BuscoEdu (bot) |
| 2026-10-18 | Se quita la lista `['web','whatsapp']`; los canales se validan contra `canales_ia.activo` (interfaz + caché de 30 s, fail-closed, nuevo 503 `canales_no_disponibles`) | Criterios F1–F2: canales administrables sin redeploy y rechazo por defecto | Backend BuscoEdu (bot) |
| 2026-10-18 | Migración `20261018120000_ba039_voz_naia_componentes.sql` + semilla (no aplicadas) y 28 tests nuevos | Cargar el texto exacto actual y demostrar la regresión sin BD | Backend BuscoEdu (bot) |
