# Cierres y línea de tiempo del funnel

## Modelo operativo

El funnel canónico es `Nuevo → En acceso → Transferida → En gestión → Cerrada`.
`Ganada` y `Perdida` son subetapas de `Cerrada`, pero pueden alcanzarse desde
cualquier etapa activa. La aplicación no obliga a recorrer todas las etapas.

## Reglas

- Ganada valida requisitos activos configurados en `funnel_cierre_requisitos`.
- Perdida exige una causa activa de `funnel_causas_perdida` y comentario.
- Desaparecido sigue siendo reversible; no equivale a Perdida.
- Reabrir exige destino y motivo, y no elimina el evento original de cierre.

## Auditoría

`oportunidades_cierres` registra el estado anterior, tipo de cierre, causa,
comentario, evidencias, canal, actor y eventual reapertura. `historial_etapas_oportunidad`
continúa siendo la secuencia de movimientos que alimenta la línea de tiempo.

## Operación

1. Ejecutar la migración `20260906100000_funnel_cierres_parametrizables.sql`.
2. Parametrizar requisitos y causas desde `/admin/funnel/cierres`.
3. Abrir una oportunidad y usar `Cerrar oportunidad`.
4. Verificar que el cierre aparece como salida hacia `Cerrada`.
5. Reabrir con motivo y confirmar que el cierre original permanece visible.
