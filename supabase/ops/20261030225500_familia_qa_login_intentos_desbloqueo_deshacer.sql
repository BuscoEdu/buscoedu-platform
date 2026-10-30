-- DESHACER · familia_qa_login_intentos_desbloqueo
-- Restaura filas de intentos QA respaldadas. NO recrea m55 (usar limpieza o3o4_deshacer).
-- Fecha: 2026-10-30 Europe/Madrid

-- Restaurar intentos desde respaldo (solo si ya no existen)
INSERT INTO public.familia_login_intentos (id, familia_id, alias_norm, fallos, bloqueado_hasta, actualizado_en)
SELECT b.id, b.familia_id, b.alias_norm, b.fallos, b.bloqueado_hasta, b.actualizado_en
  FROM respaldos.familia_qa_login_intentos_desbloq b
 WHERE NOT EXISTS (
   SELECT 1 FROM public.familia_login_intentos i WHERE i.id = b.id
 )
   AND NOT EXISTS (
   SELECT 1 FROM public.familia_login_intentos i
    WHERE i.familia_id = b.familia_id AND i.alias_norm = b.alias_norm
 );
-- Nota: tras restaurar, el bloqueo puede volver a aplicar si bloqueado_hasta > now().

-- Guarda: no tocar m1–m6 / QA2
DO $$
DECLARE v int[]; esperado int[] := ARRAY[0,0,99,52,119,77];
BEGIN
  SELECT array_agg(puntos ORDER BY id) INTO v FROM public.familia_miembros WHERE id BETWEEN 1 AND 6;
  IF v IS DISTINCT FROM esperado THEN
    RAISE EXCEPTION 'deshacer_login_desbloq_pts: puntos=% esperado=%', v, esperado;
  END IF;
END $$;
