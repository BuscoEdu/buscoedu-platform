-- =====================================================================
-- 20261019 · Carga aliadas · Paso 5/5 · Ocultar las 10 universidades demo (SIN borrar)
-- OK de Jhon 2026-10-19 16:18 (Europe/Madrid) vía Orquestador. Prod khnrnnoxyzuulagemfbh.
-- Requisito: paso 4 verificado (291 reales visibles).
-- Qué cambia: SOLO public.ofertas_academicas de las 10 demo (universidad_id aaaaaaaa-00NN-…):
--   activo = false y estado_publicacion = 'oculto'.
-- Por qué estos dos campos:
--   · Todo camino público filtra la oferta por activo + estado_publicacion='publicado' + validado + vigencia:
--     obtenerOfertas / obtenerOfertasPorIds (Explorar, Home, ficha), NaIA (/api/naia valida ofertas_relevantes)
--     y WhatsApp (catalogo-supabase.ts usa obtenerOfertas). Así desaparecen con o sin NEXT_PUBLIC_ALIADAS_IDS.
--   · activo=false además corta el funnel Aplicar (funnel-aplicar.ts solo mira activo) si alguien
--     llega con un oferta_id demo viejo.
--   · No se tocan universidades, programas ni sedes demo (el portal no las usa para decidir visibilidad);
--     así las aplicaciones/oportunidades históricas que apuntan a ofertas demo siguen resolviendo nombres.
-- Idempotente: los valores previos se guardan fila por fila UNA vez (ON CONFLICT DO NOTHING).
-- Deshacer: 20261019_carga_aliadas_5_ocultar_demo_deshacer.sql
-- =====================================================================
BEGIN;
DO $ocultar$
DECLARE n_upd int; n_demo_vis int; n_reales_vis int;
BEGIN
  -- Bloque 1 · Control previo: la carga real debe estar visible (291) antes de ocultar la demo
  SELECT count(*) INTO n_reales_vis FROM public.ofertas_academicas o
   WHERE NOT o.es_demo AND o.activo AND o.estado_publicacion='publicado' AND o.estado_validacion='validado'
     AND o.vigente_desde <= current_date AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date);
  IF n_reales_vis <> 291 THEN
    RAISE EXCEPTION 'ABORTADO: se esperaban 291 ofertas reales visibles y hay %', n_reales_vis;
  END IF;

  -- Bloque 2 · Respaldo fila por fila de los valores previos (solo la primera vez)
  CREATE TABLE IF NOT EXISTS public.carga_aliadas_20261019_demo_previo (
    oferta_id uuid PRIMARY KEY, universidad_id uuid NOT NULL,
    activo boolean NOT NULL, estado_publicacion text NOT NULL, tomado_en timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public.carga_aliadas_20261019_demo_previo ENABLE ROW LEVEL SECURITY;
  INSERT INTO public.carga_aliadas_20261019_demo_previo (oferta_id, universidad_id, activo, estado_publicacion)
  SELECT o.id, o.universidad_id, o.activo, o.estado_publicacion FROM public.ofertas_academicas o
   WHERE o.universidad_id::text LIKE 'aaaaaaaa-00%' AND o.es_demo
  ON CONFLICT (oferta_id) DO NOTHING;
  IF (SELECT count(*) FROM public.carga_aliadas_20261019_demo_previo) <> 500 THEN
    RAISE EXCEPTION 'ABORTADO: el respaldo de demo no tiene 500 filas.';
  END IF;

  -- Bloque 3 · Ocultar (solo ofertas demo de las 10 universidades demo)
  UPDATE public.ofertas_academicas o SET activo = false, estado_publicacion = 'oculto'
   WHERE o.universidad_id::text LIKE 'aaaaaaaa-00%' AND o.es_demo
     AND (o.activo OR o.estado_publicacion <> 'oculto');
  GET DIAGNOSTICS n_upd = ROW_COUNT;

  -- Bloque 4 · Controles finales: 0 demo visibles y 291 reales visibles
  SELECT count(*) INTO n_demo_vis FROM public.ofertas_academicas o
   WHERE o.es_demo AND o.activo AND o.estado_publicacion='publicado' AND o.estado_validacion='validado'
     AND o.vigente_desde <= current_date AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date);
  SELECT count(*) INTO n_reales_vis FROM public.ofertas_academicas o
   WHERE NOT o.es_demo AND o.activo AND o.estado_publicacion='publicado' AND o.estado_validacion='validado'
     AND o.vigente_desde <= current_date AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date);
  IF n_demo_vis <> 0 OR n_reales_vis <> 291 THEN
    RAISE EXCEPTION 'ABORTADO: demo visibles=% reales visibles=%', n_demo_vis, n_reales_vis;
  END IF;
  RAISE NOTICE 'Ocultar demo OK: actualizadas=% demo_visibles=0 reales_visibles=291', n_upd;
END
$ocultar$;
COMMIT;

-- Verificación (solo lectura): esperado demo_visibles=0, reales_visibles=291
SELECT count(*) FILTER (WHERE es_demo) AS demo_visibles, count(*) FILTER (WHERE NOT es_demo) AS reales_visibles
FROM public.ofertas_academicas o
WHERE o.activo AND o.estado_publicacion='publicado' AND o.estado_validacion='validado'
  AND o.vigente_desde <= current_date AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date);
