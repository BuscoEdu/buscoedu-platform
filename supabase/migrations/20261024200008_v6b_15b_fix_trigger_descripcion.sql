-- =====================================================================
-- v6b_15b · Corrige familia_trg_v6b_descripcion: en plantillas NEW no tiene plantilla_id y PL/pgSQL
-- no cortocircuita el AND → error 42703 al editar descripción de una plantilla. Se separa por tabla.
-- Detectado en la prueba con ROLLBACK, antes de cualquier uso real. Idempotente.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.familia_trg_v6b_descripcion()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_pid integer;
BEGIN
  IF NEW.descripcion IS NOT NULL THEN
    NEW.descripcion := nullif(btrim(NEW.descripcion), '');
  END IF;
  IF TG_TABLE_NAME = 'familia_tareas' AND TG_OP = 'INSERT' THEN
    v_pid := (to_jsonb(NEW)->>'plantilla_id')::integer;            -- acceso seguro por nombre
    IF NEW.descripcion IS NULL AND v_pid IS NOT NULL THEN
      SELECT p.descripcion INTO NEW.descripcion FROM public.familia_plantillas_tareas p WHERE p.id = v_pid;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.familia_trg_v6b_descripcion() FROM PUBLIC, anon, authenticated;
