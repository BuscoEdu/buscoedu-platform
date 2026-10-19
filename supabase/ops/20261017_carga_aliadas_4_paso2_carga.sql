-- =====================================================================
-- Paso 2/2 · Carga de 4 aliadas en el catálogo (Poli, Areandina, UNIR, Asturias)
-- Fecha: 2026-10-17 · Quién: Base de datos BuscoEdu · OK Jhon 17/10 12:28 (vía Orquestador)
-- Requisito: haber corrido el Paso 1 (tabla public.carga_aliadas_20261017 con 331 filas).
-- Qué hace: SOLO INSERTA filas nuevas (universidades, sedes, períodos, programas,
--   ofertas, precios). No modifica ni borra nada existente; las 10 demo quedan
--   intactas. Todo va en UNA transacción: si un control falla, no queda nada a medias.
-- Idempotente: ids fijos + ON CONFLICT (id) DO NOTHING. Correrlo 2 veces no duplica.
-- Orden: Bloque 0 → Bloque 1 → Bloque 2. Bloque 3 (logos) solo tras subir los archivos.
-- Ids nuevos de las aliadas:
--   poli      6069f39d-6bd2-5991-b922-24e58ac7137a
--   areandina 53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998
--   unir      79de384c-1c32-5c80-b5c0-70a12a7fa79d
--   asturias  031ff5d5-fc68-519c-88d7-bd37765715b1
-- =====================================================================

-- ---------------------------------------------------------------------
-- Bloque 0 · Respaldo (foto previa). Guarda cuántas ofertas tenía cada
-- universidad y cuántas eran visibles, para comparar y para poder deshacer.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.carga_aliadas_20261017_respaldo AS
SELECT now() AS tomado_en, u.id AS universidad_id, u.nombre_oficial, u.es_demo,
       count(o.id) AS ofertas_total,
       count(o.id) FILTER (WHERE o.activo AND o.estado_publicacion = 'publicado'
                           AND o.estado_validacion = 'validado'
                           AND o.vigente_desde <= current_date
                           AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date)) AS ofertas_visibles
FROM public.universidades u
LEFT JOIN public.ofertas_academicas o ON o.universidad_id = u.id
GROUP BY u.id, u.nombre_oficial, u.es_demo;
ALTER TABLE public.carga_aliadas_20261017_respaldo ENABLE ROW LEVEL SECURITY;
SELECT count(*) AS universidades_en_respaldo FROM public.carga_aliadas_20261017_respaldo;

-- ---------------------------------------------------------------------
-- Bloque 1 · Carga (una sola transacción con controles que abortan si algo no cuadra)
-- ---------------------------------------------------------------------
BEGIN;

-- 1.1 · Columnas de apoyo en la tabla de trabajo para los ids de catálogos
ALTER TABLE public.carga_aliadas_20261017
  ADD COLUMN IF NOT EXISTS nivel_id uuid, ADD COLUMN IF NOT EXISTS modalidad_id uuid,
  ADD COLUMN IF NOT EXISTS jornada_id uuid, ADD COLUMN IF NOT EXISTS area_id uuid,
  ADD COLUMN IF NOT EXISTS periodo_id uuid;

DO $carga$
DECLARE
  -- Normaliza texto: sin tildes, minúsculas y solo letras/números
  v_faltan text;
  v_pais uuid;
  v_ciudad_null boolean;
  v_bogota uuid; v_medellin uuid; v_pereira uuid; v_valledupar uuid;
  r record;
BEGIN
  -- 1.2 · Control previo: la tabla de trabajo debe tener 331 filas (291 publicables)
  IF (SELECT count(*) FROM public.carga_aliadas_20261017) <> 331
     OR (SELECT count(*) FROM public.carga_aliadas_20261017 WHERE publicable) <> 291 THEN
    RAISE EXCEPTION 'Paso 1 incompleto: se esperaban 331 filas y 291 publicables.';
  END IF;

  -- 1.3 · Control: no debe existir ya otra universidad con el mismo nombre o slug (otro id)
  SELECT string_agg(u.nombre_oficial, ', ') INTO v_faltan
  FROM public.universidades u
  WHERE u.id NOT IN ('6069f39d-6bd2-5991-b922-24e58ac7137a','53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998',
                     '79de384c-1c32-5c80-b5c0-70a12a7fa79d','031ff5d5-fc68-519c-88d7-bd37765715b1')
    AND (lower(u.slug) IN ('politecnico-grancolombiano','fundacion-universitaria-del-area-andina',
                           'unir-colombia','corporacion-universitaria-de-asturias')
         OR lower(translate(u.nombre_oficial,'ÁÉÍÓÚáéíóú','AEIOUaeiou')) IN
            ('politecnico grancolombiano','fundacion universitaria del area andina',
             'fundacion universitaria internacional de la rioja (unir)','corporacion universitaria de asturias'));
  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Ya existe una universidad con ese nombre/slug: %. Revisar antes de cargar.', v_faltan;
  END IF;

  -- 1.4 · País Colombia (obligatorio en universidades y sedes)
  SELECT id INTO v_pais FROM public.paises
  WHERE lower(translate(nombre,'ÁÉÍÓÚáéíóú','AEIOUaeiou')) = 'colombia' LIMIT 1;
  IF v_pais IS NULL THEN RAISE EXCEPTION 'No existe el país Colombia en public.paises.'; END IF;

  -- 1.5 · Ciudades de las sedes presenciales (deben existir; no se crean ciudades)
  SELECT id INTO v_bogota FROM public.ciudades
   WHERE lower(translate(nombre,'ÁÉÍÓÚáéíóú','AEIOUaeiou')) LIKE 'bogota%' ORDER BY nombre LIMIT 1;
  SELECT id INTO v_medellin FROM public.ciudades
   WHERE lower(translate(nombre,'ÁÉÍÓÚáéíóú','AEIOUaeiou')) = 'medellin' LIMIT 1;
  SELECT id INTO v_pereira FROM public.ciudades
   WHERE lower(translate(nombre,'ÁÉÍÓÚáéíóú','AEIOUaeiou')) = 'pereira' LIMIT 1;
  SELECT id INTO v_valledupar FROM public.ciudades
   WHERE lower(translate(nombre,'ÁÉÍÓÚáéíóú','AEIOUaeiou')) = 'valledupar' LIMIT 1;
  IF v_bogota IS NULL OR v_medellin IS NULL OR v_pereira IS NULL OR v_valledupar IS NULL THEN
    RAISE EXCEPTION 'Falta ciudad en public.ciudades (Bogotá=% Medellín=% Pereira=% Valledupar=%).',
      v_bogota, v_medellin, v_pereira, v_valledupar;
  END IF;
  -- ¿sedes.ciudad_id admite NULL? Si sí, la sede Virtual va sin ciudad (no filtra por ciudad).
  -- Si no, se usa Bogotá (municipio de registro SNIES de los programas virtuales).
  SELECT NOT attnotnull INTO v_ciudad_null FROM pg_attribute
   WHERE attrelid = 'public.sedes'::regclass AND attname = 'ciudad_id';

  -- 1.6 · Nivel académico: nombre del Excel → registro de niveles_academicos (con sinónimos)
  UPDATE public.carga_aliadas_20261017 c SET nivel_id = (
    SELECT n.id FROM public.niveles_academicos n
    WHERE lower(translate(n.nombre,'ÁÉÍÓÚáéíóú','AEIOUaeiou')) = ANY (CASE c.nivel_academico
      WHEN 'Universitario' THEN ARRAY['universitario','pregrado','profesional','profesional universitario','pregrado universitario']
      WHEN 'Especialización universitaria' THEN ARRAY['especializacion universitaria','especializacion']
      WHEN 'Maestría' THEN ARRAY['maestria']
      WHEN 'Tecnológico' THEN ARRAY['tecnologico','tecnologia','tecnologo','tecnologica']
      WHEN 'Formación técnica profesional' THEN ARRAY['formacion tecnica profesional','tecnico profesional','tecnico']
      ELSE ARRAY[lower(translate(c.nivel_academico,'ÁÉÍÓÚáéíóú','AEIOUaeiou'))] END)
    ORDER BY n.nombre LIMIT 1);
  SELECT string_agg(DISTINCT nivel_academico, ', ') INTO v_faltan
    FROM public.carga_aliadas_20261017 WHERE nivel_id IS NULL;
  IF v_faltan IS NOT NULL THEN RAISE EXCEPTION 'Nivel sin equivalente en niveles_academicos: %', v_faltan; END IF;

  -- 1.7 · Modalidad (con sinónimos para A distancia e Híbrida)
  UPDATE public.carga_aliadas_20261017 c SET modalidad_id = (
    SELECT m.id FROM public.modalidades m
    WHERE lower(translate(m.nombre,'ÁÉÍÓÚáéíóú','AEIOUaeiou')) = ANY (CASE c.modalidad
      WHEN 'A distancia' THEN ARRAY['a distancia','distancia','distancia tradicional']
      WHEN 'Híbrida (Presencial-Virtual)' THEN ARRAY['hibrida','hibrida (presencial-virtual)','semipresencial','presencial-virtual','blended']
      ELSE ARRAY[lower(translate(c.modalidad,'ÁÉÍÓÚáéíóú','AEIOUaeiou'))] END)
    ORDER BY m.nombre LIMIT 1);
  SELECT string_agg(DISTINCT modalidad, ', ') INTO v_faltan
    FROM public.carga_aliadas_20261017 WHERE modalidad_id IS NULL;
  IF v_faltan IS NOT NULL THEN RAISE EXCEPTION 'Modalidad sin equivalente en modalidades: %', v_faltan; END IF;

  -- 1.8 · Jornada y área: opcionales (si no hay equivalente quedan vacías, no se inventan)
  UPDATE public.carga_aliadas_20261017 c SET
    jornada_id = (SELECT j.id FROM public.jornadas j
                  WHERE lower(translate(j.nombre,'ÁÉÍÓÚáéíóú','AEIOUaeiou')) = lower(c.jornada) LIMIT 1),
    area_id = (SELECT a.id FROM public.areas_conocimiento a
               WHERE lower(translate(a.nombre,'ÁÉÍÓÚáéíóú','AEIOUaeiou'))
                   = lower(translate(c.area_conocimiento,'ÁÉÍÓÚáéíóú','AEIOUaeiou'))
                 AND c.area_conocimiento <> 'Sin información' LIMIT 1);

  -- 1.9 · Universidades (4). Aliadas reales, no demo, publicadas.
  INSERT INTO public.universidades
    (id, nombre_oficial, nombre_corto, sigla, slug, tipo_institucion, naturaleza, pais_id,
     pagina_web, estado_alianza, estado_publicacion, es_demo, activo)
  VALUES
    ('6069f39d-6bd2-5991-b922-24e58ac7137a','Politécnico Grancolombiano','Poli',NULL,'politecnico-grancolombiano','institucion_universitaria','privada',v_pais,'https://www.poli.edu.co','aliada','publicado',false,true),
    ('53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998','Fundación Universitaria del Área Andina','Areandina',NULL,'fundacion-universitaria-del-area-andina','institucion_universitaria','privada',v_pais,'https://www.areandina.edu.co','aliada','publicado',false,true),
    ('79de384c-1c32-5c80-b5c0-70a12a7fa79d','Fundación Universitaria Internacional de La Rioja (UNIR)','UNIR','UNIR','unir-colombia','institucion_universitaria','privada',v_pais,'https://unir.edu.co','aliada','publicado',false,true),
    ('031ff5d5-fc68-519c-88d7-bd37765715b1','Corporación Universitaria de Asturias','Asturias',NULL,'corporacion-universitaria-de-asturias','institucion_universitaria','privada',v_pais,'https://uniasturias.edu.co','aliada','publicado',false,true)
  ON CONFLICT (id) DO NOTHING;

  -- 1.10 · Sedes (9). Sede = lugar donde se dicta la oferta.
  INSERT INTO public.sedes (id, universidad_id, nombre, slug, tipo, pais_id, ciudad_id, estado_publicacion, es_demo, activo)
  SELECT DISTINCT ON (c.sede_id) c.sede_id, c.universidad_id,
         CASE c.sede_nombre WHEN 'Bogotá, D.C.' THEN 'Bogotá' ELSE c.sede_nombre END,
         c.aliada_slug || '-' || CASE c.sede_nombre WHEN 'Bogotá, D.C.' THEN 'bogota' WHEN 'Medellín' THEN 'medellin'
                                   ELSE lower(c.sede_nombre) END,
         CASE WHEN c.sede_nombre = 'Virtual' THEN 'virtual'
              WHEN c.sede_nombre = 'Bogotá, D.C.' THEN 'principal'
              WHEN c.aliada_slug = 'areandina' AND c.sede_nombre = 'Pereira' THEN 'seccional'
              ELSE NULL END,
         v_pais,
         CASE c.sede_nombre WHEN 'Bogotá, D.C.' THEN v_bogota WHEN 'Medellín' THEN v_medellin
              WHEN 'Pereira' THEN v_pereira WHEN 'Valledupar' THEN v_valledupar
              ELSE CASE WHEN v_ciudad_null THEN NULL ELSE v_bogota END END,
         'publicado', false, true
  FROM public.carga_aliadas_20261017 c
  ORDER BY c.sede_id
  ON CONFLICT (id) DO NOTHING;

  -- 1.11 · Período académico por aliada (las IES no publican calendario abierto:
  -- se crea uno explícito "por confirmar"; no se inventan fechas)
  INSERT INTO public.periodos_academicos (id, universidad_id, nombre, notas, estado, activo) VALUES
    ('38708f86-cbfa-533e-9495-781896093490','6069f39d-6bd2-5991-b922-24e58ac7137a','Por confirmar · catálogo 2026','Calendario no publicado por la IES (carga 2026-10-17).','activo',true),
    ('79c4bd75-ffcc-539e-ba92-aa2316a7a4ea','53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998','Por confirmar · catálogo 2026','Calendario no publicado por la IES (carga 2026-10-17).','activo',true),
    ('7043546f-ea31-5515-be45-c057a9c98f6b','79de384c-1c32-5c80-b5c0-70a12a7fa79d','Por confirmar · catálogo 2026','Calendario no publicado por la IES (carga 2026-10-17).','activo',true),
    ('90423ea2-4f1b-5a84-93d8-112a35b27a6c','031ff5d5-fc68-519c-88d7-bd37765715b1','Por confirmar · catálogo 2026','Calendario no publicado por la IES (carga 2026-10-17).','activo',true)
  ON CONFLICT (id) DO NOTHING;
  UPDATE public.carga_aliadas_20261017 SET periodo_id = CASE aliada_slug
    WHEN 'poli' THEN '38708f86-cbfa-533e-9495-781896093490'::uuid
    WHEN 'areandina' THEN '79c4bd75-ffcc-539e-ba92-aa2316a7a4ea'::uuid
    WHEN 'unir' THEN '7043546f-ea31-5515-be45-c057a9c98f6b'::uuid
    ELSE '90423ea2-4f1b-5a84-93d8-112a35b27a6c'::uuid END;

  -- 1.12 · Programas (331). Publicable → validado + publicado; resto → pendiente + creado_internamente.
  INSERT INTO public.programas_academicos
    (id, universidad_id, sede_id, nombre_oficial, nombre_corto, codigo_snies, nivel_academico_id,
     modalidad_id, jornada_id, area_conocimiento_id, duracion_valor, duracion_unidad, numero_creditos,
     titulo_otorgado, descripcion, estado_validacion, estado_publicacion, activo)
  SELECT c.programa_id, c.universidad_id, c.sede_id, c.nombre_oficial, c.nombre_corto, c.codigo_snies,
         c.nivel_id, c.modalidad_id, c.jornada_id, c.area_id, c.duracion_valor, c.duracion_unidad,
         c.numero_creditos, c.titulo_otorgado, c.descripcion,
         CASE WHEN c.publicable THEN 'validado' ELSE 'pendiente' END,
         CASE WHEN c.publicable THEN 'publicado' ELSE 'creado_internamente' END, true
  FROM public.carga_aliadas_20261017 c
  ON CONFLICT (id) DO NOTHING;

  -- 1.13 · Ofertas (331). Vigencia: desde = fecha de carga (o la publicada); hasta = la menor
  -- entre el vencimiento del registro calificado y 2026-12-31 (precios 2026).
  -- No publicables: sin vigente_desde → nunca salen en Explorar.
  INSERT INTO public.ofertas_academicas
    (id, programa_id, universidad_id, sede_id, periodo_academico_id, nombre_oferta,
     vigente_desde, vigente_hasta, estado_validacion, estado_publicacion, es_demo, activo)
  SELECT c.oferta_id, c.programa_id, c.universidad_id, c.sede_id, c.periodo_id, c.nombre_oferta,
         c.vigente_desde, c.vigente_hasta,
         CASE WHEN c.publicable THEN 'validado' ELSE 'pendiente' END,
         CASE WHEN c.publicable THEN 'publicado' ELSE 'creado_internamente' END, false, true
  FROM public.carga_aliadas_20261017 c
  ON CONFLICT (id) DO NOTHING;

  -- 1.14 · Precios (versionados). Con periodicidad → validado. Sin periodicidad →
  -- MARCADO: pendiente + nota (la IES publica el valor pero no cada cuánto se paga).
  INSERT INTO public.precios_oferta
    (id, oferta_id, periodo_academico_id, tipo_valor, concepto_cobro, valor, moneda, periodicidad,
     descripcion_condiciones, fuente, estado_validacion, vigente_desde, vigente_hasta, es_precio_activo)
  SELECT c.precio_id, c.oferta_id, c.periodo_id, 'universidad', c.concepto_cobro, c.precio,
         coalesce(c.moneda,'COP'), c.periodicidad,
         CASE WHEN c.periodicidad IS NULL
              THEN 'MARCA: periodicidad no publicada por la institución; confirmar antes de mostrar.' END,
         c.fuente_precio,
         CASE WHEN c.periodicidad IS NULL THEN 'pendiente' ELSE 'validado' END,
         c.vigente_desde, c.vigente_hasta, true
  FROM public.carga_aliadas_20261017 c
  WHERE c.precio IS NOT NULL
  ON CONFLICT (id) DO NOTHING;

  -- 1.15 · Auditoría de la carga (tabla existente cargas_catalogo)
  INSERT INTO public.cargas_catalogo (id, tipo, nombre_archivo, estado, total_filas, filas_creadas,
    filas_omitidas, resumen, confirmado_en, finalizado_en)
  VALUES ('a49db869-1b7b-541e-ac4e-ba0c9ed084a7','ofertas','programas-aliadas-2026-10-05.xlsx (SQL BD 2026-10-17)',
    'completado', 331, 331, 3,
    '{"aliadas":["poli","areandina","unir","asturias"],"publicables":291,"no_publicadas":40,"excluidas":["52058","109936","111217"],"sergio_arboleda":"standby"}'::jsonb,
    now(), now())
  ON CONFLICT (id) DO NOTHING;

  -- 1.16 · Control final: visibles por aliada con el MISMO filtro de Explorar. Si no cuadra → todo se deshace.
  FOR r IN
    SELECT x.slug, x.esperado,
           (SELECT count(*) FROM public.ofertas_academicas o
             WHERE o.universidad_id = x.id AND o.activo AND o.estado_publicacion = 'publicado'
               AND o.estado_validacion = 'validado' AND o.vigente_desde <= current_date
               AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date)) AS real
    FROM (VALUES ('poli','6069f39d-6bd2-5991-b922-24e58ac7137a'::uuid,101),
                 ('areandina','53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998'::uuid,94),
                 ('unir','79de384c-1c32-5c80-b5c0-70a12a7fa79d'::uuid,46),
                 ('asturias','031ff5d5-fc68-519c-88d7-bd37765715b1'::uuid,50)) AS x(slug,id,esperado)
  LOOP
    IF r.real <> r.esperado THEN
      RAISE EXCEPTION 'Control falló en %: visibles % ≠ esperado %', r.slug, r.real, r.esperado;
    END IF;
  END LOOP;
  RAISE NOTICE 'Carga OK: 4 aliadas, 9 sedes, 331 programas/ofertas, 291 visibles.';
END
$carga$;

COMMIT;

-- ---------------------------------------------------------------------
-- Bloque 2 · Verificación (solo lectura). Esperado:
--   poli 115/101 · areandina 118/94 · unir 46/46 · asturias 52/50 (total/visibles)
--   y las universidades demo con los mismos números del respaldo.
-- ---------------------------------------------------------------------
SELECT u.nombre_corto, u.id,
       count(o.id) AS ofertas_total,
       count(o.id) FILTER (WHERE o.activo AND o.estado_publicacion='publicado' AND o.estado_validacion='validado'
                           AND o.vigente_desde <= current_date
                           AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date)) AS visibles,
       (SELECT count(*) FROM public.precios_oferta p JOIN public.ofertas_academicas o2 ON o2.id=p.oferta_id
         WHERE o2.universidad_id=u.id AND p.descripcion_condiciones LIKE 'MARCA:%') AS precios_marcados
FROM public.universidades u
LEFT JOIN public.ofertas_academicas o ON o.universidad_id = u.id
WHERE u.id IN ('6069f39d-6bd2-5991-b922-24e58ac7137a','53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998',
               '79de384c-1c32-5c80-b5c0-70a12a7fa79d','031ff5d5-fc68-519c-88d7-bd37765715b1')
GROUP BY u.nombre_corto, u.id ORDER BY u.nombre_corto;

-- Demo intacta: debe salir 0 filas (ninguna universidad previa cambió sus conteos)
SELECT r.nombre_oficial, r.ofertas_visibles AS antes, count(o.id) FILTER (WHERE o.activo AND o.estado_publicacion='publicado'
       AND o.estado_validacion='validado' AND o.vigente_desde <= current_date
       AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date)) AS ahora
FROM public.carga_aliadas_20261017_respaldo r
LEFT JOIN public.ofertas_academicas o ON o.universidad_id = r.universidad_id
GROUP BY r.nombre_oficial, r.ofertas_visibles
HAVING r.ofertas_visibles <> count(o.id) FILTER (WHERE o.activo AND o.estado_publicacion='publicado'
       AND o.estado_validacion='validado' AND o.vigente_desde <= current_date
       AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date));

-- ---------------------------------------------------------------------
-- Bloque 3 · Logos · ⚠ OBSOLETO desde 2026-10-19: NO CORRER. Lo reemplaza scripts/subir-logos-aliadas.mjs
--   (Backend, ruta {universidad_id}/logo.{ext}). Se deja solo como historia.
-- (Original: correr SOLO después de: bucket SQL 20261007 bloques 0→1→2
-- + subir los 4 archivos al bucket logos-aliadas con estas rutas exactas:
--   poli/logo.svg · areandina/logo.svg · unir/logo.svg · asturias/logo-web.png)
-- Solo inserta el logo si el archivo ya está en el bucket (si falta uno, ese no se registra).
-- ---------------------------------------------------------------------
INSERT INTO public.imagenes_universidad
  (id, universidad_id, tipo, url_storage, nombre_archivo, texto_alternativo, es_principal, orden, activo)
SELECT l.id, l.universidad_id, 'logo', l.ruta, split_part(l.ruta,'/',2), l.alt, true, 0, true
FROM (VALUES
  ('c70d65ed-02d0-5115-8588-451eb6ec0c4a'::uuid,'6069f39d-6bd2-5991-b922-24e58ac7137a'::uuid,'poli/logo.svg','Logo de Politécnico Grancolombiano'),
  ('35b13f3a-7dbd-5b02-a918-e0da34c15fba'::uuid,'53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998'::uuid,'areandina/logo.svg','Logo de Fundación Universitaria del Área Andina'),
  ('ae5d68e6-b234-5d8b-81ec-c0254a39082a'::uuid,'79de384c-1c32-5c80-b5c0-70a12a7fa79d'::uuid,'unir/logo.svg','Logo de Fundación Universitaria Internacional de La Rioja (UNIR)'),
  ('e47d93cb-a1d9-5ff5-8caf-8ebdcf05e07d'::uuid,'031ff5d5-fc68-519c-88d7-bd37765715b1'::uuid,'asturias/logo-web.png','Logo de Corporación Universitaria de Asturias')
) AS l(id, universidad_id, ruta, alt)
WHERE EXISTS (SELECT 1 FROM storage.objects so WHERE so.bucket_id = 'logos-aliadas' AND so.name = l.ruta)
  AND NOT EXISTS (SELECT 1 FROM public.imagenes_universidad i
                  WHERE i.universidad_id = l.universidad_id AND i.tipo = 'logo' AND i.es_principal AND i.activo)
ON CONFLICT (id) DO NOTHING;
-- Verificación logos: esperado 4 filas
SELECT universidad_id, url_storage FROM public.imagenes_universidad
WHERE id IN ('c70d65ed-02d0-5115-8588-451eb6ec0c4a','35b13f3a-7dbd-5b02-a918-e0da34c15fba',
             'ae5d68e6-b234-5d8b-81ec-c0254a39082a','e47d93cb-a1d9-5ff5-8caf-8ebdcf05e07d');

-- ---------------------------------------------------------------------
-- Bloque 4 · CÓMO DESHACER (sin borrar nada: apaga y archiva). No correr salvo orden.
-- ---------------------------------------------------------------------
-- BEGIN;
-- UPDATE public.precios_oferta SET es_precio_activo = false, actualizado_en = now()
--  WHERE id IN (SELECT precio_id FROM public.carga_aliadas_20261017);
-- UPDATE public.ofertas_academicas SET activo = false, estado_publicacion = 'archivado'
--  WHERE id IN (SELECT oferta_id FROM public.carga_aliadas_20261017);
-- UPDATE public.programas_academicos SET activo = false, estado_publicacion = 'archivado'
--  WHERE id IN (SELECT programa_id FROM public.carga_aliadas_20261017);
-- UPDATE public.sedes SET activo = false, estado_publicacion = 'archivado'
--  WHERE id IN (SELECT DISTINCT sede_id FROM public.carga_aliadas_20261017);
-- UPDATE public.periodos_academicos SET activo = false
--  WHERE id IN (SELECT DISTINCT periodo_id FROM public.carga_aliadas_20261017);
-- UPDATE public.imagenes_universidad SET activo = false
--  WHERE universidad_id IN (SELECT DISTINCT universidad_id FROM public.carga_aliadas_20261017);
-- UPDATE public.universidades SET activo = false, estado_publicacion = 'archivado', estado_alianza = 'inactiva'
--  WHERE id IN (SELECT DISTINCT universidad_id FROM public.carga_aliadas_20261017);
-- COMMIT;
