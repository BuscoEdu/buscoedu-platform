-- =====================================================================
-- v6b_15 · B15 Descripción (opcional, máx. 280). Idempotente.
-- familia_tareas.descripcion YA existe (v1 la usa con el valor 'META' para metas: se respeta).
-- Se añade a plantillas, y un trigger normaliza (trim; vacío → NULL) y hereda de la plantilla al crear.
-- =====================================================================
-- Bloque 1: columna en plantillas
ALTER TABLE public.familia_plantillas_tareas ADD COLUMN IF NOT EXISTS descripcion text;
-- Bloque 2: vínculo tarea → plantilla (lo usan B15 herencia y B18 cupo). Nullable, sin borrar en cascada.
ALTER TABLE public.familia_tareas ADD COLUMN IF NOT EXISTS plantilla_id integer
  REFERENCES public.familia_plantillas_tareas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS familia_tareas_plantilla_hijo_idx ON public.familia_tareas(plantilla_id, asignada_a) WHERE plantilla_id IS NOT NULL;
-- Bloque 3: longitud máxima (las filas actuales cumplen: 0 descripciones no nulas)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='familia_plantillas_descripcion_len_chk') THEN
    ALTER TABLE public.familia_plantillas_tareas ADD CONSTRAINT familia_plantillas_descripcion_len_chk
      CHECK (descripcion IS NULL OR char_length(descripcion) <= 280); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='familia_tareas_descripcion_len_chk') THEN
    ALTER TABLE public.familia_tareas ADD CONSTRAINT familia_tareas_descripcion_len_chk
      CHECK (descripcion IS NULL OR char_length(descripcion) <= 280); END IF;
END $$;
-- Bloque 4: normalizar + heredar (solo si la tarea no trae descripción y tiene plantilla)
CREATE OR REPLACE FUNCTION public.familia_trg_v6b_descripcion()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.descripcion IS NOT NULL THEN
    NEW.descripcion := nullif(btrim(NEW.descripcion), '');
  END IF;
  IF TG_TABLE_NAME = 'familia_tareas' AND TG_OP = 'INSERT' AND NEW.descripcion IS NULL AND NEW.plantilla_id IS NOT NULL THEN
    SELECT p.descripcion INTO NEW.descripcion FROM public.familia_plantillas_tareas p WHERE p.id = NEW.plantilla_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.familia_trg_v6b_descripcion() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS familia_tareas_v6b_b15 ON public.familia_tareas;
CREATE TRIGGER familia_tareas_v6b_b15 BEFORE INSERT OR UPDATE OF descripcion ON public.familia_tareas
  FOR EACH ROW EXECUTE FUNCTION public.familia_trg_v6b_descripcion();
DROP TRIGGER IF EXISTS familia_plantillas_v6b_b15 ON public.familia_plantillas_tareas;
CREATE TRIGGER familia_plantillas_v6b_b15 BEFORE INSERT OR UPDATE OF descripcion ON public.familia_plantillas_tareas
  FOR EACH ROW EXECUTE FUNCTION public.familia_trg_v6b_descripcion();
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
