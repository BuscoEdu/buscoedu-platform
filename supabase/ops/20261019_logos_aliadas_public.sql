-- =====================================================================
-- 20261019 · Logos de las 4 aliadas servidos desde el frontend (public/), NO desde Storage
-- Autor: Base de datos BuscoEdu · 2026-10-19 · NO aplicado (correr SOLO después del deploy de la PR #69,
--   que agrega public/logos-aliadas/{universidad_id}.{ext}, y con OK de Jhon).
-- Decisión del Orquestador (19/10): los logos no van al bucket logos-aliadas. En
--   imagenes_universidad.url_storage se guarda la URL RELATIVA /logos-aliadas/{universidad_id}.{ext}.
-- Tabla (20260129000900): url_storage TEXT libre, tipo TEXT sin CHECK ni enum, es_principal/orden/activo
--   NOT NULL con default. Índice único parcial uq_imagenes_universidad_logo_principal
--   (universidad_id) WHERE tipo='logo' AND es_principal AND activo (creado el 19/10 en
--   20261019_carga_aliadas_1_bucket.sql) ⇒ como mucho 1 logo principal activo por aliada.
-- Ids de fila: los mismos uuid5 de BD (Bloque 3 del 17/10) y de scripts/subir-logos-aliadas.mjs,
--   para que cualquier camino converja en la misma fila.
-- Extensiones (dry-run de Backend + /workspace/aliadas-assets): Poli svg, Areandina svg, UNIR svg, Asturias png.
-- Idempotente (insertar o saltar): si la fila ya está igual, no hace nada; si encuentra otra cosa
--   (fila con ese id distinta, u otro logo principal activo) ABORTA sin escribir: lo decide BD a mano.
-- Deshacer: 20261019_logos_aliadas_public_deshacer.sql · Verificación: _verificacion.sql
-- =====================================================================
BEGIN;

-- Bloque 1 · Datos objetivo (una fila por aliada)
CREATE TEMP TABLE _logos_obj ON COMMIT DROP AS
SELECT * FROM (VALUES
  ('c70d65ed-02d0-5115-8588-451eb6ec0c4a'::uuid, '6069f39d-6bd2-5991-b922-24e58ac7137a'::uuid, 'svg', 'Logo de Politécnico Grancolombiano'),
  ('35b13f3a-7dbd-5b02-a918-e0da34c15fba'::uuid, '53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998'::uuid, 'svg', 'Logo de Fundación Universitaria del Área Andina'),
  ('ae5d68e6-b234-5d8b-81ec-c0254a39082a'::uuid, '79de384c-1c32-5c80-b5c0-70a12a7fa79d'::uuid, 'svg', 'Logo de Fundación Universitaria Internacional de La Rioja (UNIR)'),
  ('e47d93cb-a1d9-5ff5-8caf-8ebdcf05e07d'::uuid, '031ff5d5-fc68-519c-88d7-bd37765715b1'::uuid, 'png', 'Logo de Corporación Universitaria de Asturias')
) AS v(id, universidad_id, ext, alt);
ALTER TABLE _logos_obj ADD COLUMN ruta text;
UPDATE _logos_obj SET ruta = '/logos-aliadas/' || universidad_id || '.' || ext;

-- Bloque 2 · Guardas (si una falla, RAISE y no se escribe nada)
DO $g$
DECLARE v_txt text;
BEGIN
  -- 2.1 Las 4 universidades existen
  SELECT string_agg(o.universidad_id::text, ', ') INTO v_txt
    FROM _logos_obj o WHERE NOT EXISTS (SELECT 1 FROM public.universidades u WHERE u.id = o.universidad_id);
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'ABORTADO: no existen las universidades %', v_txt; END IF;

  -- 2.2 Si la fila ya existe con ese id, debe ser exactamente la objetivo (si no, se decide a mano)
  SELECT string_agg(i.id::text, ', ') INTO v_txt
    FROM public.imagenes_universidad i JOIN _logos_obj o ON o.id = i.id
   WHERE i.universidad_id IS DISTINCT FROM o.universidad_id OR i.tipo IS DISTINCT FROM 'logo'
      OR i.url_storage IS DISTINCT FROM o.ruta OR NOT i.es_principal OR NOT i.activo;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'ABORTADO: filas con el id de este script pero distintas (p. ej. ruta de Storage o desactivadas): %', v_txt; END IF;

  -- 2.3 No debe haber OTRO logo principal activo para la aliada (chocaría con el índice único)
  SELECT string_agg(i.universidad_id::text, ', ') INTO v_txt
    FROM public.imagenes_universidad i JOIN _logos_obj o ON o.universidad_id = i.universidad_id
   WHERE i.tipo = 'logo' AND i.es_principal AND i.activo AND i.id <> o.id;
  IF v_txt IS NOT NULL THEN RAISE EXCEPTION 'ABORTADO: ya hay otro logo principal activo para %', v_txt; END IF;
END $g$;

-- Bloque 3 · Insertar o saltar
INSERT INTO public.imagenes_universidad
  (id, universidad_id, tipo, url_storage, nombre_archivo, descripcion, texto_alternativo, es_principal, orden, activo)
SELECT o.id, o.universidad_id, 'logo', o.ruta, o.universidad_id || '.' || o.ext,
       'Logo servido desde public/logos-aliadas (PR #69). Script 20261019_logos_aliadas_public.', o.alt, true, 0, true
  FROM _logos_obj o
ON CONFLICT (id) DO NOTHING;

-- Bloque 4 · Control: 4/4 filas objetivo y 1 principal activo por aliada
DO $c$
BEGIN
  IF (SELECT count(*) FROM public.imagenes_universidad i JOIN _logos_obj o ON o.id = i.id
       WHERE i.url_storage = o.ruta AND i.tipo = 'logo' AND i.es_principal AND i.activo) <> 4 THEN
    RAISE EXCEPTION 'ABORTADO: no quedaron las 4 filas objetivo.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.imagenes_universidad i JOIN _logos_obj o ON o.universidad_id = i.universidad_id
              WHERE i.tipo = 'logo' AND i.es_principal AND i.activo
              GROUP BY i.universidad_id HAVING count(*) <> 1) THEN
    RAISE EXCEPTION 'ABORTADO: alguna aliada no tiene exactamente 1 logo principal activo.';
  END IF;
END $c$;

COMMIT;
