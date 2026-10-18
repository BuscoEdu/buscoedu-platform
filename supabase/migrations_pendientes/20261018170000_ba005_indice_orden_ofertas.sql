-- =====================================================
-- BA-005 · Índice para el orden estable del catálogo de ofertas (creado_en DESC, id)
-- Autor: Backend BuscoEdu (bot) · 2026-10-18 · post-QA E1
--
-- *** NO APLICADA – requiere OK de Jhon y plan de BD ***
-- Propuesta LOCAL para que la revise el bot de Base de datos. No se ejecutó contra
-- ningún entorno. Vive en supabase/migrations_pendientes/ (el CLI no lee esta carpeta),
-- así un `supabase db push` no la toma por accidente. Para aplicarla: plan + OK de Jhon,
-- volver a moverla a supabase/migrations/ con versión nueva.
--
-- Qué hace: crea un índice b-tree sobre public.ofertas_academicas (creado_en DESC, id).
-- Para qué: desde el commit FE c5fb085, `obtenerOfertas` (src/lib/ofertas.ts, contrato
-- BA-005, lo usan Explorar, NaIA, WhatsApp, Demo WApp y las cifras del Home) ordena con
-- `ORDER BY creado_en DESC, id ASC` + `LIMIT/OFFSET`. El índice tiene exactamente ese
-- orden, así que Postgres puede recorrerlo y cortar en LIMIT sin ordenar todo el
-- catálogo en cada página de «Mostrar más».
--
-- Por qué compuesto y NO parcial (justificación):
--   La consulta filtra activo = true, estado_publicacion = 'publicado',
--   estado_validacion = 'validado', vigencia (vigente_desde <= hoy y vigente_hasta nulo o
--   >= hoy) y universidad_id IN (aliadas). Se evaluó un índice parcial
--   `WHERE activo AND estado_publicacion = 'publicado' AND estado_validacion = 'validado'`:
--   sería más chico, pero (1) el planner solo lo usa si puede probar que el WHERE de la
--   consulta implica el predicado, y PostgREST puede mandar los valores como parámetros
--   (planes genéricos), con lo que el parcial podría ignorarse; (2) hoy el catálogo es
--   chico (≈50 ofertas visibles en QA) y casi todo lo publicado cumple esos filtros, así
--   que la ganancia es mínima. La vigencia (rango por fecha) y universidad_id IN no
--   pueden ir delante de creado_en sin perder el orden del índice. Por eso se propone el
--   compuesto simple, que sirve para cualquier filtro. El parcial queda abajo, comentado,
--   como alternativa para que BD decida con EXPLAIN en staging.
--
-- Supuestos a verificar por BD: la columna `creado_en` existe en ofertas_academicas
-- (la consulta en producción ya ordena por ella) e `id` es uuid PK.
-- Tabla grande en prod → preferir `CREATE INDEX CONCURRENTLY` fuera de transacción.
-- Deshacer: supabase/ops/20261018_ba005_indice_orden_ofertas_deshacer.sql
-- =====================================================

-- Índice del orden estable: mismo orden que ORDER BY creado_en DESC, id ASC de obtenerOfertas.
create index if not exists idx_ofertas_academicas_creado_en_desc_id
  on public.ofertas_academicas (creado_en desc, id);

-- Alternativa parcial (NO activa; solo si EXPLAIN en staging demuestra que se usa):
-- create index if not exists idx_ofertas_academicas_publicadas_creado_en_desc_id
--   on public.ofertas_academicas (creado_en desc, id)
--   where activo = true and estado_publicacion = 'publicado' and estado_validacion = 'validado';

-- Documenta el índice en el catálogo de Postgres para quien lo encuentre después.
comment on index public.idx_ofertas_academicas_creado_en_desc_id is
  'BA-005 · orden estable de obtenerOfertas (creado_en desc, id asc) para paginar «Mostrar más». Propuesto 2026-10-18 por Backend BuscoEdu (bot).';
