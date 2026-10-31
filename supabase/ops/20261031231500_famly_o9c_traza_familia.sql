-- =====================================================================
-- O9c · Traza de familia en TODO (Ola 9b · OK Jhon t943s/t944u · GO Orq)
-- Autor: BD BuscoEdu (bot) · 2026-10-31
-- Qué: (1) respaldo por tabla, (2) trigger BEFORE INSERT de respaldo
--      (familia_id NULL → familia del vínculo), (3) backfill de los NULL con vínculo,
--      (4) premios huérfanos → soft delete con motivo «huérfano O9».
-- ✗ NOT NULL todavía · ✗ DELETE físico · Idempotente.
-- Deshacer: 20261031231500_famly_o9c_traza_familia_deshacer.sql
-- =====================================================================
BEGIN;

-- Bloque 0: guarda de seguridad → si algún NULL apunta a 2 familias distintas, se aborta todo
DO $g$
DECLARE v_conf int;
BEGIN
  SELECT count(*) INTO v_conf FROM (
    SELECT n.id FROM public.familia_notificaciones n
      CROSS JOIN LATERAL (VALUES ((SELECT familia_id FROM public.familia_miembros WHERE id=n.para_id)),
                                 ((SELECT familia_id FROM public.familia_tareas WHERE id=n.tarea_id)),
                                 ((SELECT familia_id FROM public.familia_solicitudes_premios WHERE id=n.solicitud_id)),
                                 ((SELECT familia_id FROM public.familia_agenda_actividades WHERE id=n.actividad_id))) v(f)
     WHERE n.familia_id IS NULL GROUP BY n.id HAVING count(DISTINCT f) > 1
    UNION ALL
    SELECT p.id FROM public.familia_premios p
      CROSS JOIN LATERAL (SELECT (SELECT familia_id FROM public.familia_miembros WHERE id=p.creado_por)
                          UNION ALL SELECT (SELECT familia_id FROM public.familia_miembros WHERE id=p.asignado_a)
                          UNION ALL SELECT s.familia_id FROM public.familia_solicitudes_premios s WHERE s.premio_id=p.id
                          UNION ALL SELECT h.familia_id FROM public.familia_historial h WHERE h.premio_id=p.id
                          UNION ALL SELECT m.familia_id FROM public.familia_metas m WHERE m.premio_id=p.id) v(f)
     WHERE p.familia_id IS NULL GROUP BY p.id HAVING count(DISTINCT f) > 1
    UNION ALL
    SELECT a.tarea_id FROM public.familia_v6c_aplicaciones a
      CROSS JOIN LATERAL (VALUES ((SELECT familia_id FROM public.familia_miembros WHERE id=a.miembro_id)),
                                 ((SELECT familia_id FROM public.familia_miembros WHERE id=a.actor_id)),
                                 ((SELECT familia_id FROM public.familia_tareas WHERE id=a.tarea_id))) v(f)
     WHERE a.familia_id IS NULL GROUP BY a.tarea_id, a.ronda, a.miembro_id, a.creado_en HAVING count(DISTINCT f) > 1
  ) x;
  IF v_conf > 0 THEN RAISE EXCEPTION 'O9c abortado: % filas con vínculos a familias distintas', v_conf; END IF;
END $g$;

-- Bloque 1: respaldos (solo las filas que se van a tocar), sin acceso para anon/authenticated
CREATE TABLE IF NOT EXISTS respaldos.familia_o9c_notificaciones_previo AS
  SELECT id, familia_id, now() respaldado_en FROM public.familia_notificaciones WHERE familia_id IS NULL;
CREATE TABLE IF NOT EXISTS respaldos.familia_o9c_plantillas_previo AS
  SELECT id, familia_id, now() respaldado_en FROM public.familia_plantillas_tareas WHERE familia_id IS NULL;
CREATE TABLE IF NOT EXISTS respaldos.familia_o9c_premios_previo AS
  SELECT id, familia_id, activo, now() respaldado_en FROM public.familia_premios WHERE familia_id IS NULL;
CREATE TABLE IF NOT EXISTS respaldos.familia_o9c_v6c_aplicaciones_previo AS
  SELECT tarea_id, ronda, miembro_id, accion, creado_en, familia_id, now() respaldado_en
    FROM public.familia_v6c_aplicaciones WHERE familia_id IS NULL;
REVOKE ALL ON respaldos.familia_o9c_notificaciones_previo, respaldos.familia_o9c_plantillas_previo,
              respaldos.familia_o9c_premios_previo, respaldos.familia_o9c_v6c_aplicaciones_previo
  FROM anon, authenticated;

-- Bloque 2: función genérica de respaldo. Cada argumento = 'tabla_ref|columna':
-- busca familia_id en tabla_ref donde id = NEW.columna; usa el primer vínculo que no sea NULL.
CREATE OR REPLACE FUNCTION public.familia_o9c_fid_respaldo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $f$
DECLARE i int; v_ref text; v_col text; v_val text; v_fid bigint;
BEGIN
  IF NEW.familia_id IS NOT NULL THEN RETURN NEW; END IF;
  FOR i IN 0 .. TG_NARGS - 1 LOOP
    v_ref := split_part(TG_ARGV[i], '|', 1);
    v_col := split_part(TG_ARGV[i], '|', 2);
    v_val := to_jsonb(NEW) ->> v_col;
    CONTINUE WHEN v_val IS NULL;
    EXECUTE format('SELECT familia_id FROM public.%I WHERE id = $1::bigint', v_ref) INTO v_fid USING v_val;
    IF v_fid IS NOT NULL THEN NEW.familia_id := v_fid; RETURN NEW; END IF;
  END LOOP;
  RETURN NEW;
END $f$;
REVOKE ALL ON FUNCTION public.familia_o9c_fid_respaldo() FROM PUBLIC, anon, authenticated;

-- Bloque 3: triggers BEFORE INSERT (prefijo «a_» = corre primero) en las tablas con vínculo que no lo tenían
DO $t$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('familia_agenda_actividades',  $$'familia_miembros|miembro_id','familia_miembros|creada_por'$$),
    ('familia_agenda_excepciones',  $$'familia_agenda_actividades|actividad_id','familia_miembros|creado_por'$$),
    ('familia_badges',              $$'familia_miembros|miembro_id'$$),
    ('familia_fotos_storage_borrar',$$'familia_tareas|tarea_id'$$),
    ('familia_mesada_periodos',     $$'familia_miembros|liberado_por'$$),
    ('familia_mesadas',             $$'familia_miembros|miembro_id'$$),
    ('familia_metas',               $$'familia_miembros|miembro_id','familia_premios|premio_id'$$),
    ('familia_multas',              $$'familia_miembros|creado_por'$$),
    ('familia_multas_aplicadas',    $$'familia_miembros|miembro_id','familia_miembros|actor_id'$$),
    ('familia_notificaciones',      $$'familia_miembros|para_id','familia_tareas|tarea_id','familia_solicitudes_premios|solicitud_id','familia_agenda_actividades|actividad_id'$$),
    ('familia_plantillas_tareas',   $$'familia_miembros|creado_por'$$),
    ('familia_premios',             $$'familia_miembros|creado_por','familia_miembros|asignado_a'$$),
    ('familia_series',              $$'familia_miembros|creada_por'$$),
    ('familia_sesiones',            $$'familia_miembros|miembro_id'$$),
    ('familia_solicitudes_premios', $$'familia_miembros|miembro_id','familia_premios|premio_id'$$),
    ('familia_v6c_aplicaciones',    $$'familia_miembros|miembro_id','familia_miembros|actor_id','familia_tareas|tarea_id'$$)
  ) v(tabla, args) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS a_%1$s_o9c_fid ON public.%1$I', r.tabla);
    EXECUTE format('CREATE TRIGGER a_%1$s_o9c_fid BEFORE INSERT ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.familia_o9c_fid_respaldo(%2$s)', r.tabla, r.args);
  END LOOP;
END $t$;

-- Bloque 4: backfill de notificaciones (destinatario → tarea → solicitud → actividad)
UPDATE public.familia_notificaciones n SET familia_id = coalesce(
  (SELECT familia_id FROM public.familia_miembros WHERE id=n.para_id),
  (SELECT familia_id FROM public.familia_tareas WHERE id=n.tarea_id),
  (SELECT familia_id FROM public.familia_solicitudes_premios WHERE id=n.solicitud_id),
  (SELECT familia_id FROM public.familia_agenda_actividades WHERE id=n.actividad_id))
WHERE n.familia_id IS NULL;

-- Bloque 5: backfill de plantillas (creador)
UPDATE public.familia_plantillas_tareas p SET familia_id = m.familia_id
  FROM public.familia_miembros m WHERE p.familia_id IS NULL AND m.id = p.creado_por;

-- Bloque 6: backfill de v6c_aplicaciones (miembro → actor → tarea)
UPDATE public.familia_v6c_aplicaciones a SET familia_id = coalesce(
  (SELECT familia_id FROM public.familia_miembros WHERE id=a.miembro_id),
  (SELECT familia_id FROM public.familia_miembros WHERE id=a.actor_id),
  (SELECT familia_id FROM public.familia_tareas WHERE id=a.tarea_id))
WHERE a.familia_id IS NULL;

-- Bloque 7: premios. Columnas nuevas para el soft delete (aditivas), luego backfill
-- (creador → asignado → solicitud/canje → historial → meta)
ALTER TABLE public.familia_premios ADD COLUMN IF NOT EXISTS archivado_en timestamptz;
ALTER TABLE public.familia_premios ADD COLUMN IF NOT EXISTS archivado_motivo text;
UPDATE public.familia_premios p SET familia_id = coalesce(
  (SELECT familia_id FROM public.familia_miembros WHERE id=p.creado_por),
  (SELECT familia_id FROM public.familia_miembros WHERE id=p.asignado_a),
  (SELECT min(familia_id) FROM public.familia_solicitudes_premios WHERE premio_id=p.id),
  (SELECT min(familia_id) FROM public.familia_historial WHERE premio_id=p.id),
  (SELECT min(familia_id) FROM public.familia_metas WHERE premio_id=p.id))
WHERE p.familia_id IS NULL;

-- Bloque 8: premios sin ningún vínculo → soft delete (siguen NULL = invisibles para toda familia)
UPDATE public.familia_premios SET activo = false, archivado_en = now(), archivado_motivo = 'huérfano O9'
 WHERE familia_id IS NULL AND archivado_en IS NULL;

COMMIT;
