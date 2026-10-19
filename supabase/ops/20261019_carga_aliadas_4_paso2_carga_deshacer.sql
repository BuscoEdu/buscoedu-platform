-- =====================================================================
-- Deshacer 20261019 · Paso 4/5 · Carga de 4 aliadas
-- SIN borrado físico: apaga y archiva todo lo creado por la carga, usando los
-- ids de public.carga_aliadas_20261019. Idempotente.
-- ORDEN: si el paso 5 (ocultar demo) está aplicado, correr ANTES
--   20261019_carga_aliadas_5_ocultar_demo_deshacer.sql, o el portal queda vacío.
-- =====================================================================
BEGIN;
-- Bloque 1 · Precios
UPDATE public.precios_oferta SET es_precio_activo = false
 WHERE id IN (SELECT precio_id FROM public.carga_aliadas_20261019) AND es_precio_activo;
-- Bloque 2 · Ofertas y programas
UPDATE public.ofertas_academicas SET activo = false, estado_publicacion = 'archivado'
 WHERE id IN (SELECT oferta_id FROM public.carga_aliadas_20261019);
UPDATE public.programas_academicos SET activo = false, estado_publicacion = 'archivado'
 WHERE id IN (SELECT programa_id FROM public.carga_aliadas_20261019);
-- Bloque 3 · Sedes y períodos
UPDATE public.sedes SET activo = false, estado_publicacion = 'archivado'
 WHERE id IN (SELECT DISTINCT sede_id FROM public.carga_aliadas_20261019);
UPDATE public.periodos_academicos SET activo = false
 WHERE id IN (SELECT DISTINCT periodo_id FROM public.carga_aliadas_20261019);
-- Bloque 4 · Logos (si se registraron) y universidades
UPDATE public.imagenes_universidad SET activo = false
 WHERE universidad_id IN (SELECT DISTINCT universidad_id FROM public.carga_aliadas_20261019);
UPDATE public.universidades SET activo = false, estado_publicacion = 'archivado', estado_alianza = 'inactiva'
 WHERE id IN (SELECT DISTINCT universidad_id FROM public.carga_aliadas_20261019);
-- Bloque 5 · Ciudades creadas por esta carga (Pereira, Valledupar: ids fijos del generador)
UPDATE public.ciudades SET activo = false
 WHERE id IN ('0c2dc14d-5373-5b79-ba69-1a443ce57892','9f7b8f8a-b4df-567b-9ab6-ba05261ad7a3');
-- Bloque 6 · Traza en la auditoría de cargas
UPDATE public.cargas_catalogo
   SET resumen = resumen || jsonb_build_object('deshecha_en', now())
 WHERE id = 'a49db869-1b7b-541e-ac4e-ba0c9ed084a7';
COMMIT;
-- Verificación: esperado 0 ofertas reales visibles
SELECT count(*) AS reales_visibles FROM public.ofertas_academicas o
WHERE o.id IN (SELECT oferta_id FROM public.carga_aliadas_20261019)
  AND o.activo AND o.estado_publicacion='publicado';
