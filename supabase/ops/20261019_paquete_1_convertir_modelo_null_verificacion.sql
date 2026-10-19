-- =====================================================================
-- Verificación · Paquete prod 20261019 · Bloque 1 · fn_convertir_aplicacion (modelo NULL)
-- SOLO LECTURA. Los bloques A–C solo leen el catálogo. El bloque D llama a la función
-- dentro de un DO que SIEMPRE termina en RAISE (todo se revierte, no queda ninguna fila).
-- Criterio: todas las filas en ✓.
-- =====================================================================

-- Bloque A · Definición aplicada
WITH f AS (SELECT p.oid, pg_get_functiondef(p.oid) AS def, p.prosecdef, p.proconfig
           FROM pg_proc p WHERE p.oid = 'public.fn_convertir_aplicacion(jsonb)'::regprocedure)
SELECT 'A1 modelo sin coalesce' AS chequeo,
       CASE WHEN def LIKE '%v_modelo          := v_oferta.modelo_negocio;%'
             AND def NOT LIKE '%coalesce(v_oferta.modelo_negocio, ''por_inscrito'')%' THEN '✓' ELSE '✗' END AS r FROM f
UNION ALL SELECT 'A2 asesor con NULL o por_inscrito',
       CASE WHEN def LIKE '%IF v_modelo IS NULL OR v_modelo = ''por_inscrito'' THEN%' THEN '✓' ELSE '✗' END FROM f
UNION ALL SELECT 'A3 transferencia solo por_lead',
       CASE WHEN def LIKE '%IF v_modelo = ''por_lead'' THEN%' THEN '✓' ELSE '✗' END FROM f
UNION ALL SELECT 'A4 SECURITY DEFINER', CASE WHEN prosecdef THEN '✓' ELSE '✗' END FROM f
UNION ALL SELECT 'A5 search_path=public', CASE WHEN proconfig @> ARRAY['search_path=public'] THEN '✓' ELSE '✗' END FROM f;

-- Bloque B · Permisos (solo service_role)
SELECT 'B1 anon sin EXECUTE' AS chequeo,
       CASE WHEN NOT has_function_privilege('anon','public.fn_convertir_aplicacion(jsonb)','execute') THEN '✓' ELSE '✗' END AS r
UNION ALL SELECT 'B2 authenticated sin EXECUTE',
       CASE WHEN NOT has_function_privilege('authenticated','public.fn_convertir_aplicacion(jsonb)','execute') THEN '✓' ELSE '✗' END
UNION ALL SELECT 'B3 service_role con EXECUTE',
       CASE WHEN has_function_privilege('service_role','public.fn_convertir_aplicacion(jsonb)','execute') THEN '✓' ELSE '✗' END;

-- Bloque C · Destino del snapshot admite NULL
SELECT 'C1 modelo_negocio_snapshot nullable' AS chequeo,
       CASE WHEN (SELECT NOT attnotnull FROM pg_attribute WHERE attrelid='public.oportunidades'::regclass
                  AND attname='modelo_negocio_snapshot') THEN '✓' ELSE '✗' END AS r
UNION ALL SELECT 'C2 CHECK del snapshot admite NULL',
       CASE WHEN (SELECT pg_get_constraintdef(oid) FROM pg_constraint
                  WHERE conname='oportunidades_modelo_negocio_snapshot_check') ILIKE '%IS NULL%' THEN '✓' ELSE '✗' END;

-- Bloque D · Caso NULL en transacción revertida (DO que SIEMPRE termina en RAISE).
-- Sin datos personales reales: la persona es ficticia (celular +570000019101, «Ensayo BD»).
-- Usa como referencia una oferta visible de aliada con modelo NULL (no se modifica; todo se revierte).
-- Esperado en el mensaje: ok=true snapshot=NULL asesor=✓ facturables=0 → ✓.
DO $ensayo$
DECLARE v_oferta uuid; v_res jsonb; v_cons jsonb; v_snap text; v_asesor uuid; v_transf int;
BEGIN
  SELECT o.id INTO v_oferta FROM public.ofertas_academicas o
    JOIN public.universidades u ON u.id = o.universidad_id AND u.es_demo IS NOT TRUE
   WHERE o.modelo_negocio IS NULL AND o.activo AND o.estado_publicacion='publicado'
     AND o.estado_validacion='validado' AND o.vigente_desde <= current_date
     AND (o.vigente_hasta IS NULL OR o.vigente_hasta >= current_date) AND o.periodo_academico_id IS NOT NULL
   ORDER BY o.id LIMIT 1;
  IF v_oferta IS NULL THEN RAISE EXCEPTION 'D ✗ no hay oferta visible con modelo NULL para ensayar'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('codigo', codigo, 'otorgado', true)), '[]'::jsonb)
           || '[{"codigo":"contacto","otorgado":true}]'::jsonb
    INTO v_cons FROM public.tipos_consentimiento WHERE activo AND es_obligatorio;
  v_res := public.fn_convertir_aplicacion(jsonb_build_object(
    'clave_idempotencia','ensayo-paquete-20261019-' || gen_random_uuid(),
    'celular_e164','+570000019101', 'nombres','Ensayo BD', 'oferta_id', v_oferta,
    'consentimientos', v_cons));
  SELECT modelo_negocio_snapshot, asesor_asignado_id INTO v_snap, v_asesor
    FROM public.oportunidades WHERE id = nullif(v_res->>'oportunidad_id','')::uuid;
  -- es_facturable=false: no debe existir ninguna transferencia facturable para esa oportunidad
  SELECT count(*) INTO v_transf FROM public.transferencias_universidad
   WHERE oportunidad_id = nullif(v_res->>'oportunidad_id','')::uuid AND es_facturable IS TRUE;
  RAISE EXCEPTION 'ENSAYO_REVERTIDO ok=% snapshot=% asesor=% facturables=% → %',
    v_res->>'ok', coalesce(v_snap,'NULL'), CASE WHEN v_asesor IS NOT NULL THEN '✓' ELSE '✗' END, v_transf,
    CASE WHEN (v_res->>'ok')::boolean AND v_snap IS NULL AND v_asesor IS NOT NULL AND v_transf = 0
         THEN '✓' ELSE '✗ ' || v_res::text END;
END
$ensayo$;
