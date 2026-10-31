-- DESHACER MF O3 ops QA familia2 / limpieza m52 (restore desde respaldos; no borra #1)
-- Quién: BD bot. No restaura PINs en claro en logs.

-- Quitar miembros/config/familia QA2 (solo nickname qa2mfcasa)
DELETE FROM public.familia_sesiones s
 WHERE s.familia_id IN (SELECT id FROM public.familia_familias WHERE lower(nickname)='qa2mfcasa');
DELETE FROM public.familia_config WHERE familia_id IN (SELECT id FROM public.familia_familias WHERE lower(nickname)='qa2mfcasa');
DELETE FROM public.familia_miembros WHERE familia_id IN (SELECT id FROM public.familia_familias WHERE lower(nickname)='qa2mfcasa')
  AND (lower(coalesce(alias_entrada,'')) LIKE 'qa%');
DELETE FROM public.familia_familias WHERE lower(nickname)='qa2mfcasa';

-- Restaurar miembro 52 y tareas desde respaldo (si existen)
INSERT INTO public.familia_miembros (
  id, nombre, rol, emoji, edad, puntos, pin, creado_en, frase, color, es_admin,
  fecha_nacimiento, puntos_historicos, foto_url, zona_horaria, mesada_monto, mesada_pausada,
  tema, tiene_movil, rol_v6d, telefono, familia_id, alias_entrada
)
SELECT id, nombre, rol, emoji, edad, puntos, pin, creado_en, frase, color, es_admin,
  fecha_nacimiento, puntos_historicos, foto_url, zona_horaria, mesada_monto, mesada_pausada,
  tema, tiene_movil, rol_v6d, telefono, familia_id, alias_entrada
FROM respaldos.familia_mf_o3_ops_m52_miembro b
WHERE NOT EXISTS (SELECT 1 FROM public.familia_miembros m WHERE m.id=b.id);

-- Tareas: insert mínimo por columnas del respaldo (SELECT *)
-- Si el respaldo tiene tomado_en extra, listar columnas explícitas vía dinámica omitida:
-- restaurar solo si tabla existe y hay filas
DO $$
BEGIN
  IF to_regclass('respaldos.familia_mf_o3_ops_m52_tareas') IS NULL THEN RETURN; END IF;
  -- Reinsertar con todas las columnas de negocio excepto tomado_en
  EXECUTE $q$
    INSERT INTO public.familia_tareas
    SELECT (to_jsonb(b) - 'tomado_en')::public.familia_tareas
      FROM respaldos.familia_mf_o3_ops_m52_tareas b
     WHERE NOT EXISTS (SELECT 1 FROM public.familia_tareas t WHERE t.id=b.id)
  $q$;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'mf_o3_ops_deshacer: restauración tareas parcial/falló: %', SQLERRM;
END $$;

-- Guarda pts
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'mf_o3_ops_deshacer_pts: puntos=% esperado=%', v, esperado;
  END IF;
END $$;
