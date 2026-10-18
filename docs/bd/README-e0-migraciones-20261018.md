# E0 · Centro de control WA · Reconciliación de migraciones en producción

**Proyecto Supabase:** `khnrnnoxyzuulagemfbh` (producción) · **Fecha:** 2026-10-18 (hora de Madrid)
**Pedido por:** Orquestador BuscoEdu, con OK de Jhon para escribir en Supabase · **Ejecutó:** Base de datos BuscoEdu (bot)
**Fuente:** `buscoedu-knowledge/briefs/centro-control-wa-spec.md` §16

## Para qué sirve
Antes de este trabajo, el historial de migraciones de prod tenía 1 sola fila (BA-032), aunque el esquema real ya tenía casi todo.
Con un historial así, `supabase db push` intentaría volver a correr 43 archivos. Aquí se alinea el historial con lo que de verdad hay en prod, y se aplican solo las pendientes que son seguras.

## Qué se hizo
| Paso | Archivo | Efecto |
|---|---|---|
| 0 | `/workspace/bd-backups/20261018/` | Respaldo previo: definiciones de funciones, policies, textos de NaIA y config del despliegue |
| 1 | `supabase/ops/20261018_e0_paso1_reconciliar_historial.sql` | Registra 36 migraciones como aplicadas (antes se verificaron sus 82 objetos en prod: 82/82 presentes). Cambia la versión de BA-032 de 20261017212837 a 20261017120000 (es la misma migración). Solo toca el historial, sin DDL. |
| 2 | `supabase/ops/20261018_e0_paso2_aplicar_pendientes.sql` | Aplica 150200, 160000 y 190000, cada una con su fila en el historial, todo en una sola transacción |
| — | `supabase/ops/20261018_e0_deshacer.sql` | Deshace los pasos 1 y 2 y deja el estado del respaldo |

**Resultado verificado:** el historial pasa de 1 a 40 filas, con 0 errores.
- `fn_cambiar_etapa` ahora valida que el subestado pertenezca a la etapa.
- `usuarios_internos` ya no tiene policy DELETE (quedan 3 policies).
- `personalidad_naia` y `formato_respuesta_naia` quedan en la versión `ba024`.
- El despliegue «NaIA Producción» queda con `temperature` 0.6.

## Qué NO se hizo (STOP, falta decidir)
1. **`20260830143100_fase3_validar_aplicacion`**
   - Además de crear `fn_validar_aplicacion`, vuelve a escribir `fn_convertir_aplicacion` y mete la validación *después* de crear la persona, la oportunidad, el historial y la asignación. Cuando el resultado es `duplicada` o `limite_alcanzado`, devuelve ok=false sin deshacer nada, así que quedan oportunidades huérfanas asignadas a un asesor.
   - Lo usa `app/api/leadcenter/convertir/route.ts`.
   - Hay otro problema hoy en prod: `fn_ba031_convertir_si_consentido` llama a `fn_validar_aplicacion`, que no existe. Por eso Aplicar por WhatsApp falla cuando la persona ya existe.
   - Propuesta: corregir el archivo para que valide antes de escribir (o que haga RAISE) y luego aplicarlo.
2. **`20260830150100_funnel_rls_superadmin_mutations`**
   - Crea policies de INSERT, UPDATE y **DELETE físico** para usuarios autenticados en etapas, subestados y reglas. Eso choca con la regla de no borrar físicamente.
   - Hoy ningún cliente las necesita, porque el admin usa service role.
   - Propuesta: hacer una versión sin DELETE (o no hacer nada) y que la decida Producto/Orquestador.
3. **`20260815_*` (2 archivos con la misma versión `20260815`)**
   - Su efecto ya está en prod, pero los dos chocan en la clave primaria del historial y el CLI tampoco los acepta.
   - Hay que renombrarlos en el repo, por ejemplo `20260815000000_…` y `20260815000100_…`, y después registrarlos con el mismo patrón del paso 1.

## Deuda conocida
- En las migraciones base `20260129*` (000200, y de 000500 a 001000), prod tiene índices con otros nombres. Quedaron registradas como aplicadas porque las tablas existen. Nada se duplica, porque no se vuelven a correr.

## Bitácora
| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 | Respaldo, reconciliación del historial (36 filas más el ajuste de versión de BA-032) y aplicación de 150200, 160000 y 190000 | E0 Centro de control WA: dejar `db push` usable sin reaplicar nada | Base de datos BuscoEdu (bot), por pedido del Orquestador con OK de Jhon |
