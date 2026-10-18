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

## Paso 3 · Decisiones sobre los 3 STOP (Orquestador con OK de Jhon, 2026-10-18)
Archivo: `supabase/ops/20261018_e0_paso3_decisiones_stop.sql` (una transacción, idempotente).
1. **143100 recortada**
   - Ahora solo crea `fn_validar_aplicacion`, que es un cambio aditivo. Se quitó del archivo la reescritura de `fn_convertir_aplicacion` y quedó una nota dentro explicando por qué.
   - Para qué sirve: `fn_ba031_convertir_si_consentido` la necesita, así que Aplicar por WhatsApp con una persona que ya existe vuelve a funcionar.
   - `fn_convertir_aplicacion` quedó intacta (md5 `0fb145102b91fa27e40866e2b6748f16`, el mismo de antes).
   - Prueba en prod, solo de lectura:
     - Persona existente con la misma oferta → `duplicada` ✓
     - Misma persona con otra oferta → `ok` ✓
     - Parámetros nulos → `parametros_invalidos` ✓
2. **150100 descartada**
   - No se aplica ni se registra. El archivo lleva un encabezado «OBSOLETA · NO APLICAR».
   - ⚠ Mientras siga en `supabase/migrations/`, `db push` la aplicaría. Hay que sacarla en E1.
3. **20260815 ×2 renombradas** en la rama local a `20260815000000_add_visitante_id_to_eventos_negocio.sql` y `20260815000100_rls_lectura_publica_relacionadas.sql`, y registradas en el historial sin DDL.
   - Algunos documentos viejos (`docs/INVENTARIO_FASE0_20260830.md` y otros) todavía citan los nombres anteriores. Es solo una referencia histórica.

**Resultado:** el historial tiene 43 filas, que son los 44 archivos locales menos 150100. Hubo 0 errores.

## Deuda conocida
- E1: `fn_convertir_aplicacion` debe validar antes de escribir (o hacer RAISE). Hoy `/api/leadcenter/convertir` puede crear un duplicado sin bloqueo.
- E1: sacar 150100 de `supabase/migrations/`.
- En las migraciones base `20260129*` (000200, y de 000500 a 001000), prod tiene índices con otros nombres. Quedaron registradas como aplicadas porque las tablas existen. Nada se duplica, porque no se vuelven a correr.

## Bitácora
| Fecha | Qué | Por qué | Quién |
|---|---|---|---|
| 2026-10-18 | Respaldo, reconciliación del historial (36 filas más el ajuste de versión de BA-032) y aplicación de 150200, 160000 y 190000 | E0 Centro de control WA: dejar `db push` usable sin reaplicar nada | Base de datos BuscoEdu (bot), por pedido del Orquestador con OK de Jhon |
| 2026-10-18 | Paso 3: 143100 recortada (solo `fn_validar_aplicacion`), 150100 marcada obsoleta, 20260815 ×2 renombradas y registradas. Historial = 43 | Decisión del Orquestador sobre los 3 STOP; arreglar BA-031 sin introducir oportunidades huérfanas | Base de datos BuscoEdu (bot), con OK de Jhon vía Orquestador |
