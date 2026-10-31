-- =====================================================================
-- O10b · Ola 10 criterios de Producto (#4/#17, #7, #15, #16) — lado BD
-- Autor: BD BuscoEdu (bot) · 2026-10-31 · GO Orq (OK Jhon t954u)
-- Idempotente · aditivo · ✗ DELETE. Deshacer: 20261031234000_famly_o10b_ola10_criterios_deshacer.sql
-- =====================================================================
BEGIN;

-- Bloque 1 (#4/#17): respaldo de tareas ABIERTAS creadas por padre/admin con hijo y sin "aprobada para hacer"
CREATE TABLE IF NOT EXISTS respaldos.familia_o10b_tareas_aph_previo AS
  SELECT t.id, t.familia_id, t.estado, t.aprobada_para_hacer, now() respaldado_en
    FROM public.familia_tareas t JOIN public.familia_miembros m ON m.id = t.creada_por
   WHERE t.asignada_a IS NOT NULL AND coalesce(t.aprobada_para_hacer,false) = false
     AND t.archivada_en IS NULL AND t.estado IN ('pendiente','aviso_aprobada')
     AND coalesce(t.en_subasta,false) = false
     AND coalesce(m.rol_v6d, CASE WHEN m.es_admin THEN 'padre_admin' ELSE 'hijo' END) IN ('padre','padre_admin');
REVOKE ALL ON respaldos.familia_o10b_tareas_aph_previo FROM anon, authenticated;

-- Bloque 2 (#4/#17): backfill — esas tareas pasan directo a la lista (solo las respaldadas)
UPDATE public.familia_tareas t SET aprobada_para_hacer = true
  FROM respaldos.familia_o10b_tareas_aph_previo r
 WHERE t.id = r.id AND coalesce(t.aprobada_para_hacer,false) = false AND t.archivada_en IS NULL;

-- Bloque 3 (#4/#17): regla al crear — tarea creada por padre/admin de la misma familia, con hijo elegido,
-- fuera de subasta y no borrador/solicitada → aprobada_para_hacer = true. Propuesta de hijo sigue igual.
CREATE OR REPLACE FUNCTION public.familia_o10b_aph_padre() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE v_rol text; v_fid bigint;
BEGIN
  IF NEW.creada_por IS NULL OR NEW.asignada_a IS NULL OR coalesce(NEW.en_subasta,false)
     OR coalesce(NEW.estado,'') IN ('borrador','solicitada') OR coalesce(NEW.aprobada_para_hacer,false) THEN
    RETURN NEW;
  END IF;
  SELECT coalesce(m.rol_v6d, CASE WHEN m.es_admin THEN 'padre_admin' ELSE 'hijo' END), m.familia_id
    INTO v_rol, v_fid FROM public.familia_miembros m WHERE m.id = NEW.creada_por;
  IF v_rol IN ('padre','padre_admin') AND (NEW.familia_id IS NULL OR NEW.familia_id = v_fid) THEN
    NEW.aprobada_para_hacer := true;
  END IF;
  RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS b_familia_tareas_o10b_aph_padre ON public.familia_tareas;
CREATE TRIGGER b_familia_tareas_o10b_aph_padre BEFORE INSERT ON public.familia_tareas
  FOR EACH ROW EXECUTE FUNCTION public.familia_o10b_aph_padre();

-- Bloque 4 (#7): horas del aviso anti-duplicado por familia (0 = Apagado; default 12)
ALTER TABLE public.familia_config ADD COLUMN IF NOT EXISTS antidup_horas smallint NOT NULL DEFAULT 12;
DO $d$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'familia_config_antidup_horas_chk') THEN
    ALTER TABLE public.familia_config ADD CONSTRAINT familia_config_antidup_horas_chk
      CHECK (antidup_horas IN (0,1,3,6,12,24));
  END IF;
END $d$;
COMMENT ON COLUMN public.familia_config.antidup_horas IS 'Aviso de tarea repetida: 0=Apagado, 1/3/6/12/24 h. Solo admin vía familia_rpc_config_antidup';

-- Bloque 5 (#7): RPC para que SOLO el admin de la familia de la sesión cambie las horas
CREATE OR REPLACE FUNCTION public.familia_rpc_config_antidup(p_horas integer, p_actor_id integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE v_fid bigint; v_mid integer; v_a public.familia_miembros%ROWTYPE; v_n integer;
BEGIN
  SELECT s.familia_id, s.miembro_id INTO v_fid, v_mid FROM public.familia_mf_sesion_ctx() s LIMIT 1;
  IF v_fid IS NULL THEN RAISE EXCEPTION 'sesión requerida'; END IF;
  SELECT * INTO v_a FROM public.familia_miembros
   WHERE id = coalesce(v_mid, p_actor_id) AND familia_id = v_fid AND coalesce(activo, true);
  IF v_a.id IS NULL OR NOT public.familia_es_admin(v_a) THEN RAISE EXCEPTION 'solo el admin de esta familia puede cambiarlo'; END IF;
  IF p_actor_id IS NOT NULL AND p_actor_id <> v_a.id THEN RAISE EXCEPTION 'actor no coincide con la sesión'; END IF;
  IF p_horas IS NULL OR p_horas NOT IN (0,1,3,6,12,24) THEN RAISE EXCEPTION 'valor inválido (0,1,3,6,12,24)'; END IF;
  UPDATE public.familia_config SET antidup_horas = p_horas, actualizado_en = now() WHERE familia_id = v_fid;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN RAISE EXCEPTION 'familia sin configuración'; END IF;
  RETURN jsonb_build_object('ok', true, 'antidup_horas', p_horas);
END $f$;
REVOKE ALL ON FUNCTION public.familia_rpc_config_antidup(integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.familia_rpc_config_antidup(integer, integer) TO anon, authenticated;

-- Bloque 6 (#15): subasta que cierra sin nadie → (el tick ya la archiva sin descontar) + aviso a los padres
CREATE OR REPLACE FUNCTION public.familia_o10b_subasta_sin_tomar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
BEGIN
  IF OLD.en_subasta AND NOT coalesce(NEW.en_subasta,false) AND OLD.archivada_en IS NULL
     AND NEW.archivada_en IS NOT NULL AND NEW.asignada_a IS NULL AND NEW.familia_id IS NOT NULL THEN
    INSERT INTO public.familia_notificaciones(para_id, tipo, tarea_id, texto, familia_id)
    SELECT m.id, 'tarea', NEW.id, 'Nadie tomó la subasta, quedó archivada: '||coalesce(NEW.titulo,'tarea'), NEW.familia_id
      FROM public.familia_miembros m
     WHERE m.familia_id = NEW.familia_id AND coalesce(m.activo,true)
       AND coalesce(m.rol_v6d, CASE WHEN m.es_admin THEN 'padre_admin' ELSE 'hijo' END) IN ('padre','padre_admin');
  END IF;
  RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS z_familia_tareas_o10b_subasta_sin_tomar ON public.familia_tareas;
CREATE TRIGGER z_familia_tareas_o10b_subasta_sin_tomar AFTER UPDATE ON public.familia_tareas
  FOR EACH ROW EXECUTE FUNCTION public.familia_o10b_subasta_sin_tomar();

-- Bloque 7 (#16): fecha de nacimiento entre hoy−100 años y hoy (solo al crear o al CAMBIAR la fecha)
CREATE OR REPLACE FUNCTION public.familia_o10b_nacimiento_rango() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
BEGIN
  IF NEW.fecha_nacimiento IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.fecha_nacimiento IS DISTINCT FROM OLD.fecha_nacimiento)
     AND (NEW.fecha_nacimiento > current_date OR NEW.fecha_nacimiento < (current_date - interval '100 years')::date) THEN
    RAISE EXCEPTION 'fecha de nacimiento fuera de rango (hoy−100 años a hoy)' USING ERRCODE = '22007';
  END IF;
  RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS b_familia_miembros_o10b_nacimiento ON public.familia_miembros;
CREATE TRIGGER b_familia_miembros_o10b_nacimiento BEFORE INSERT OR UPDATE OF fecha_nacimiento ON public.familia_miembros
  FOR EACH ROW EXECUTE FUNCTION public.familia_o10b_nacimiento_rango();

COMMIT;
