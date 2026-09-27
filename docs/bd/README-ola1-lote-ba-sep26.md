# Cierre Ola 1 — Lote BA septiembre 2026

**Rama:** `feat/lote-ba-sep26`
**Base:** `origin/main`
**Fecha de cierre:** 27 de septiembre de 2026 (Madrid, UTC+2)
**Alcance:** trabajo de documentación y preparación operativa de BD. No se
 ejecutó SQL en producción y no se abrió PR.

## Resumen de entregables

### BA-019 — Orden de migraciones determinista

- Se conserva `supabase/migrations/20260830143000_contexto_naia.sql`.
- Se renombra únicamente el nombre de
  `20260830143000_fase3_validar_aplicacion.sql` a
  `20260830143100_fase3_validar_aplicacion.sql` mediante `git mv`.
- El contenido no se modifica. El orden lexicográfico ya no tiene dos archivos
  con el mismo timestamp.

### BA-004 — Renovar vigencias

- Se conserva sin cambios el filtro de vigencia de `src/lib/ofertas.ts`.
- Se preparó `supabase/ops/20260927_ba004_renovar_vigencias.sql`, listo para
  pegar y revisar en Supabase.
- El SQL selecciona ofertas con `activo = true`, `estado_publicacion =
  'publicado'`, `estado_validacion = 'validado'` y `vigente_hasta` vencido.
- La fecha comercial elegida es `2026-12-31`.
- También alinea las filas activas relacionadas en `precios_oferta` (solo
  `es_precio_activo = true`) y `beneficios_oferta` (solo `activo = true`).
  Los precios históricos/inactivos no se tocan.
- Incluye verificación previa y posterior, usa transacción y no hace DELETE
  físico.
- **Pendiente operativo:** Orquestador debe pedirle a Jhon que revise y ejecute
  el SQL en el proyecto Supabase correcto. Este lote no lo ejecuta.

### BA-006 — Geografía

- Se documenta en `docs/bd/BA-006-geografia.md` que sedes, ciudades y regiones
  están vacías en el corte actual, por lo que FE oculta los filtros.
- Contrato FE: `mostrarFiltroLugar = countUsables >= 1`.
- No se creó seed: el repositorio no tiene `CREATE TABLE` completo de los cuatro
  catálogos geográficos. El documento deja el seed pendiente de dump de schema
  de producción y aporta un SELECT de conteo de solo lectura.
- La BD puede sembrar en paralelo cuando se confirme el schema; no se inventaron
  columnas ni valores en este lote.

### BA-009 — Fuente única de contexto NaIA

- Se documenta en `docs/bd/BA-009-fuente-contexto-naia.md` que el canónico es el
  Centro IA (`agentes_ia`, `versiones_agente_ia`, contextos asociados, canal,
  fuentes y despliegues).
- `contexto_naia` queda como legacy para historial/admin legacy y no es runtime
  del portal ni fuente de `/api/naia`.
- Se mantiene `20260830143000_contexto_naia.sql`; no se borra la tabla.
- No hay apply obligatorio en producción para BA-009, salvo solicitud explícita
  de Backend para cortar una lectura legacy. Backend corta la API.

## Checklist portal y operaciones

### Portal / FE

- [ ] Ejecutar una búsqueda de Derecho después del apply de BA-004 y confirmar
      que las ofertas válidas renovadas aparecen.
- [ ] Confirmar que `src/lib/ofertas.ts` mantiene los filtros
      `activo/publicado/validado` y las fechas; no reemplazar el filtro por un
      bypass.
- [ ] Validar que una ficha muestre programa, universidad, sede y modalidad.
- [ ] Comprobar filtros de programa, nivel, modalidad, ciudad y país sin errores
      PostgREST.
- [ ] Mantener ocultos los filtros de lugar cuando `countUsables < 1`, según
      BA-006.
- [ ] Cuando BD siembre geografía, refrescar el conteo y validar que los filtros
      se habiliten solo con al menos una opción utilizable.
- [ ] Confirmar que `/api/naia` usa el executor del Centro IA y no
      `contexto_naia`.

### BD / Supabase / ops

- [ ] Verificar proyecto y entorno antes de pegar el SQL BA-004.
- [ ] Ejecutar primero el SELECT previo del script y revisar el conjunto objetivo.
- [ ] Ejecutar el script completo en una ventana operativa y guardar los
      resultados de verificación posterior.
- [ ] Revisar que ofertas, precios activos y beneficios activos queden con
      `vigente_hasta = 2026-12-31`.
- [ ] No borrar filas ni modificar precios históricos/inactivos.
- [ ] Para BA-006, obtener el dump de schema productivo antes de preparar seed.
- [ ] Después de cualquier seed, revisar FKs, RLS y la correspondencia país →
      región → ciudad → sede.
- [ ] Para BA-009, revisar versión activa, contextos, canal y despliegue desde
      `/admin/ia`; no aplicar una migración para reactivar legacy.

## SQL para pegar en Supabase

### BA-004

```text
supabase/ops/20260927_ba004_renovar_vigencias.sql
```

Es el único SQL de datos de este lote. No se ejecutó en producción.

### BA-006

No hay archivo de seed en esta ola. El SELECT de conteo está documentado en
[`BA-006-geografia.md`](BA-006-geografia.md). La semilla queda pendiente de dump
schema de producción; prepararla solo después de confirmar las columnas reales.

## Archivos tocados

- `supabase/migrations/20260830143100_fase3_validar_aplicacion.sql` — renombre
  BA-019 desde el timestamp duplicado.
- `supabase/ops/20260927_ba004_renovar_vigencias.sql` — SQL listo para pegar,
  BA-004.
- `docs/bd/BA-006-geografia.md` — estado, contrato FE, conteo y bloqueo de seed.
- `docs/bd/BA-009-fuente-contexto-naia.md` — fuente canónica y legacy.
- `docs/bd/README-ola1-lote-ba-sep26.md` — este cierre.
- `README.md` — nota corta de cierre enlazando la documentación de la ola.

Se mantienen sin modificación de contenido:

- `supabase/migrations/20260830143000_contexto_naia.sql`.
- `src/lib/ofertas.ts`.

## Riesgos y responsables

- **BA-004 toca datos productivos:** extender vigencias puede hacer visibles
  ofertas, precios o beneficios que estaban vencidos. Orquestador debe pedirle a
  Jhon revisar el conjunto previo, la fecha `2026-12-31` y el proyecto destino
  antes de ejecutar.
- **Alineación comercial:** renovar una oferta no confirma por sí misma precio,
  cupos o condiciones comerciales; el equipo de operaciones debe verificarlos.
- **BA-006 tiene schema incompleto en el repo:** no se debe pegar una semilla
  basada en suposiciones. Requiere dump de schema de producción.
- **BA-009 depende de Backend:** cualquier corte de lectura legacy debe ocurrir
  en la API/backend; no se debe convertir `contexto_naia` en fuente de runtime.
- **Aplicación de migraciones:** BA-019 solo cambia nombre; no se aplicaron
  migraciones ni SQL productivo como parte de este lote.
