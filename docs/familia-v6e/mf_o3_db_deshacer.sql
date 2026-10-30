-- DESHACER MF O3 · Solo capa BD (no borra datos de negocio ni columnas familia_id)
-- Revierte: índices nuevos de O3 + vista historial a la definición respaldada.
-- No toca puntos. No DROP TABLE de negocio. Respaldo en respaldos.* se conserva.
-- Quién: BD bot. Ejecutar solo si hace falta rollback de O3 DB.

-- Quitar índices compuestos O3
DROP INDEX IF EXISTS public.familia_notifs_fam_para_creado_idx;
DROP INDEX IF EXISTS public.familia_tareas_fam_creado_idx;
DROP INDEX IF EXISTS public.familia_tareas_fam_asignada_idx;
DROP INDEX IF EXISTS public.familia_hist_fam_creado_idx;
DROP INDEX IF EXISTS public.familia_agenda_fam_miembro_idx;
DROP INDEX IF EXISTS public.familia_mensajes_fam_creado_idx;
DROP INDEX IF EXISTS public.familia_solicitudes_fam_creado_idx;
DROP INDEX IF EXISTS public.familia_mesadas_fam_miembro_idx;
DROP INDEX IF EXISTS public.familia_sesiones_fam_miembro_idx;

-- Quitar índices simples añadidos en O3 (no los de O1: tareas/notifs/hist/miembros)
DROP INDEX IF EXISTS public.familia_premios_familia_id_idx;
DROP INDEX IF EXISTS public.familia_solicitudes_familia_id_idx;
DROP INDEX IF EXISTS public.familia_mensajes_familia_id_idx;
DROP INDEX IF EXISTS public.familia_plantillas_familia_id_idx;
DROP INDEX IF EXISTS public.familia_deberes_familia_id_idx;
DROP INDEX IF EXISTS public.familia_config_familia_id_idx;
DROP INDEX IF EXISTS public.familia_series_familia_id_idx;
DROP INDEX IF EXISTS public.familia_agenda_act_familia_id_idx;
DROP INDEX IF EXISTS public.familia_agenda_exc_familia_id_idx;
DROP INDEX IF EXISTS public.familia_mesadas_familia_id_idx;
DROP INDEX IF EXISTS public.familia_mesada_per_familia_id_idx;
DROP INDEX IF EXISTS public.familia_multas_familia_id_idx;
DROP INDEX IF EXISTS public.familia_multas_niv_familia_id_idx;
DROP INDEX IF EXISTS public.familia_multas_apl_familia_id_idx;
DROP INDEX IF EXISTS public.familia_permisos_familia_id_idx;
DROP INDEX IF EXISTS public.familia_fotos_bor_familia_id_idx;
DROP INDEX IF EXISTS public.familia_sesiones_familia_id_idx;
DROP INDEX IF EXISTS public.familia_metas_familia_id_idx;
DROP INDEX IF EXISTS public.familia_badges_familia_id_idx;
DROP INDEX IF EXISTS public.familia_v6c_apl_familia_id_idx;

-- Restaurar vista historial desde respaldo (si existe)
DO $$
DECLARE v_def text;
BEGIN
  IF to_regclass('respaldos.familia_mf_o3_previo_vista_historial') IS NULL THEN
    RAISE NOTICE 'mf_o3_deshacer: sin respaldo de vista; se omite';
    RETURN;
  END IF;
  SELECT def INTO v_def
    FROM respaldos.familia_mf_o3_previo_vista_historial
   ORDER BY tomado_en DESC LIMIT 1;
  IF v_def IS NULL OR btrim(v_def) = '' THEN
    RAISE NOTICE 'mf_o3_deshacer: respaldo de vista vacío; se omite';
    RETURN;
  END IF;
  -- Recrear con la definición exacta respaldada (DROP: OR REPLACE no reordena columnas)
  DROP VIEW IF EXISTS public.familia_historial_v;
  EXECUTE 'CREATE VIEW public.familia_historial_v WITH (security_invoker = true) AS ' || v_def;
  GRANT SELECT ON public.familia_historial_v TO anon, authenticated, service_role;
END $$;

-- Guarda: puntos intactos
DO $$
DECLARE
  v int[];
  esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v
    FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'mf_o3_deshacer_guarda_pts: puntos = % (esperado %)', v, esperado;
  END IF;
END $$;
