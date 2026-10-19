# Paquete prod BD · 2026-10-19

**Rama:** `feat/bd-paquete-prod-20261019` (desde `origin/main` 5993565 + carga de aliadas) · **Estado:** NO aplicado; espera OK de Jhon.
Todo está en `supabase/ops/20261019_paquete_*`. Cada bloque tiene script, `_deshacer.sql` y `_verificacion.sql` (solo lectura, criterios ✓/✗; los ensayos que escriben terminan en RAISE/ROLLBACK).

## Orden de aplicación

| # | Script | Qué hace (una línea) | Riesgo | Deshacer |
|---|--------|----------------------|--------|----------|
| 1 | `20261019_paquete_3_quitar_trg_universidad.sql` | Quita el trigger que rompe todo alta de universidad (propuesta de Backend, copia sin cambios). | Bajo: no se crean oportunidades B2B automáticas (hoy tampoco). Los scripts de carga 2 y 4 ya no se pueden re-correr tal cual. | `_deshacer.sql` recrea el trigger exacto (vuelve el bug). |
| 2 | `20261019_paquete_1_convertir_modelo_null.sql` | `fn_convertir_aplicacion` toma `modelo_negocio` tal cual; asesor con `IF v_modelo IS NULL OR v_modelo = 'por_inscrito'`: NULL ⇒ snapshot NULL, con asesor, `es_facturable=false` (no hay transferencia). Verificación con caso NULL revertido y persona ficticia. | Medio: es la conversión de leads; solo cambian 3 líneas de BA-041. | `_deshacer.sql` = BA-041 literal. |
| 3 | `20261019_paquete_2_precios_lectura_publica.sql` | `lectura_publica_precios`: anon/authenticated solo ven precios activos, validados, vigentes y de oferta visible. | Bajo: ningún lector público usa la tabla; admin va por `solo_super_admin_select`. | `_deshacer.sql` vuelve a `USING (true)`. |
| 4a | `20261019_paquete_4_tablas_trabajo_exportar.sql` | Exporta las 3 tablas de trabajo (JSON + md5) y guarda la salida en `/home/box/.secrets/respaldos/`. | Ninguno (solo lectura). | — |
| 4b | `20261019_paquete_4_tablas_trabajo_a_respaldos.sql` | Mueve las 3 tablas de `public` al schema privado `respaldos` (sin borrar nada). | Bajo: los deshacer del 19/10 ya apuntan a `respaldos.*`. | `_deshacer.sql` las devuelve a `public` (y usar los deshacer de abed234). |

Después de cada script, correr su `_verificacion.sql`; si sale una ✗, se para y se corre el deshacer de ese bloque.
Por qué este orden: el 3 no depende de nada y desbloquea el CRUD de IES; el 1 se prueba con ofertas reales visibles; el 2 se prueba mejor con las demo ya ocultas; el 4 va al final porque lo usan los deshacer de la carga.

## Logos (`logos-aliadas`)
- **OBSOLETO, NO CORRER:** Bloque 3 de `supabase/ops/20261017_carga_aliadas_4_paso2_carga.sql` (registraba logos con ruta por slug: `poli/logo.svg`, …). Lo reemplaza Backend con `scripts/subir-logos-aliadas.mjs`, ruta `{universidad_id}/logo.{ext}`.
- Revisión del bucket creado el 19/10: las 3 policies (insert/update/delete super_admin) solo filtran `bucket_id`; ninguna restringe por slug ni carpeta ⇒ la ruta nueva está permitida, **sin fix**. El índice `uq_imagenes_universidad_logo_principal` es por `universidad_id` (no depende de la ruta). Límites: 500 KB y png/svg/webp, iguales a los que valida el script.
- Verificación solo lectura: `20261019_paquete_5_logos_bucket_verificacion.sql` (antes y después de que Backend suba). BD no sube nada.

## ⚠ Para otros roles
- **Backend:** `src/lib/demowapp/funnel-aplicar.ts` (líneas 514, 841 y 869) sigue con `modelo_negocio || 'por_inscrito'`; y `fn_ba031_convertir_si_consentido` (migración 20260927210000, línea 132) hace `coalesce(modelo_negocio,'por_inscrito')` solo para decidir si exige consentimiento de transferencia (con NULL no la exige, y es correcto porque no hay transferencia). No rompe nada, pero no está alineado con «NULL = sin definir».
- **Lead Center:** la ficha ya muestra `—` / «Sin definir» cuando el snapshot es NULL; `copiloto/route.ts` lee `modelo_negocio_snapshot`; falta que Backend confirme que trata NULL.
- `fn_crear_oportunidad_universidad()` queda sin uso, con EXECUTE para authenticated (hotfix 7fn). Al ser función de trigger no se puede llamar por RPC; queda para una limpieza aparte.
- El schema `respaldos` no se debe agregar a los «Exposed schemas» de la API.

## Bitácora

| Fecha | Qué | Por qué | Quién |
|-------|-----|---------|-------|
| 2026-10-19 (hora Madrid) | Paquete prod de 4 bloques + verificación del bucket de logos (Bloque 3 del 17/10 marcado OBSOLETO) (modelo NULL en conversión, RLS de precios, quitar trigger de universidades, tablas de trabajo a `respaldos`) con deshacer y verificación; rutas de los deshacer del 19/10 a `respaldos.*`. NO aplicado. | Decisión de Producto (sin modelo no se asume cobro); 187 precios pendientes expuestos a anon; el alta de IES falla; tablas de trabajo en el schema expuesto. | Base de datos BuscoEdu |
