-- =====================================================================
-- Verificación · Paquete prod 20261019 · Bloque 3 · trg_universidad_crea_oportunidad
-- SOLO LECTURA. El bloque C inserta una universidad de ensayo dentro de un DO que SIEMPRE
-- termina en RAISE (se revierte; no queda ninguna fila). Criterio: todo en ✓.
-- =====================================================================

-- Bloque A · Trigger quitado, función conservada con comentario SIN USO
SELECT 'A1 trigger no existe' AS chequeo,
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.universidades'::regclass
                               AND tgname='trg_universidad_crea_oportunidad') THEN '✓' ELSE '✗' END AS r
UNION ALL SELECT 'A2 función conservada',
       CASE WHEN to_regprocedure('public.fn_crear_oportunidad_universidad()') IS NOT NULL THEN '✓' ELSE '✗' END
UNION ALL SELECT 'A3 comentario SIN USO',
       CASE WHEN obj_description('public.fn_crear_oportunidad_universidad()'::regprocedure,'pg_proc') LIKE 'SIN USO%'
            THEN '✓' ELSE '✗' END
UNION ALL SELECT 'A4 ningún otro trigger usa la función',
       CASE WHEN NOT EXISTS (SELECT 1 FROM pg_trigger
                              WHERE tgfoid = 'public.fn_crear_oportunidad_universidad()'::regprocedure) THEN '✓' ELSE '✗' END
UNION ALL SELECT 'A5 trigger actualizado_en intacto',
       CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.universidades'::regclass
                           AND tgname='trg_universidades_actualizado_en' AND tgenabled='O') THEN '✓' ELSE '✗' END
UNION ALL SELECT 'A6 persona_id sigue NOT NULL (no se tocó)',
       CASE WHEN (SELECT attnotnull FROM pg_attribute WHERE attrelid='public.oportunidades'::regclass
                    AND attname='persona_id') THEN '✓' ELSE '✗' END;

-- Bloque B · Sin oportunidades 'universidad' (igual que antes)
SELECT 'B1 oportunidades tipo universidad' AS chequeo, count(*) AS total
  FROM public.oportunidades WHERE tipo_oportunidad = 'universidad';

-- Bloque C · Ensayo revertido: el alta de universidad ya no falla
DO $ensayo$
DECLARE v_pais uuid; v_id uuid := gen_random_uuid(); v_ops int;
BEGIN
  SELECT pais_id INTO v_pais FROM public.universidades WHERE id = '6069f39d-6bd2-5991-b922-24e58ac7137a';
  INSERT INTO public.universidades
    (id, nombre_oficial, nombre_corto, slug, tipo_institucion, naturaleza, pais_id,
     estado_alianza, estado_validacion, estado_publicacion, es_demo, activo)
  VALUES (v_id, 'Ensayo BD paquete 20261019', 'Ensayo', 'ensayo-bd-paquete-20261019-' || left(v_id::text, 8),
          'institucion_universitaria', 'privada', v_pais, 'aliada', 'validado', 'publicado', true, false);
  SELECT count(*) INTO v_ops FROM public.oportunidades WHERE tipo_oportunidad = 'universidad';
  RAISE EXCEPTION 'ENSAYO_REVERTIDO alta_universidad=✓ (INSERT pasó) oportunidades_universidad=%', v_ops;
END
$ensayo$;
-- Esperado: ERROR «ENSAYO_REVERTIDO alta_universidad=✓ ...». Si sale 23502 (persona_id) → ✗.
