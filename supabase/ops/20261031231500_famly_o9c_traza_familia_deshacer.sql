-- Deshacer O9c: quita los triggers y la función, devuelve familia_id/activo según los respaldos
-- y elimina las 2 columnas nuevas de premios (no existían antes).
BEGIN;
DO $t$
DECLARE r record;
BEGIN
  FOR r IN SELECT tgname, tgrelid::regclass AS tabla FROM pg_trigger WHERE tgname LIKE 'a\_familia\_%\_o9c\_fid' LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', r.tgname, r.tabla);
  END LOOP;
END $t$;
DROP FUNCTION IF EXISTS public.familia_o9c_fid_respaldo();
UPDATE public.familia_notificaciones t SET familia_id = NULL FROM respaldos.familia_o9c_notificaciones_previo r WHERE t.id = r.id;
UPDATE public.familia_plantillas_tareas t SET familia_id = NULL FROM respaldos.familia_o9c_plantillas_previo r WHERE t.id = r.id;
UPDATE public.familia_premios t SET familia_id = NULL, activo = r.activo FROM respaldos.familia_o9c_premios_previo r WHERE t.id = r.id;
UPDATE public.familia_v6c_aplicaciones t SET familia_id = NULL FROM respaldos.familia_o9c_v6c_aplicaciones_previo r
 WHERE t.tarea_id = r.tarea_id AND t.ronda IS NOT DISTINCT FROM r.ronda AND t.miembro_id IS NOT DISTINCT FROM r.miembro_id
   AND t.accion IS NOT DISTINCT FROM r.accion AND t.creado_en = r.creado_en;
ALTER TABLE public.familia_premios DROP COLUMN IF EXISTS archivado_en, DROP COLUMN IF EXISTS archivado_motivo;
COMMIT;
