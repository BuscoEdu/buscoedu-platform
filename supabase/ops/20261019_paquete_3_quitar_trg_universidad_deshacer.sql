-- =====================================================================
-- Deshacer · Paquete prod 20261019 · Bloque 3 (copia de BD, sin cambios en el SQL) de
--   wt-copy-wa: supabase/ops/20261019_fix_trg_universidad_crea_oportunidad_deshacer.sql
-- Revisado: recrea el trigger igual a 20260904010000 (AFTER INSERT, FOR EACH ROW) y deja la
--   función sin comentario, como estaba (ninguna migración le puso COMMENT).
-- =====================================================================
-- DESHACER de supabase/migrations_pendientes/20261019190000_fix_trg_universidad_crea_oportunidad_propuesta.sql
-- Autor: Backend BuscoEdu (bot) · 2026-10-19 · NO correr sin OK de Jhon.
-- Qué: vuelve a crear trg_universidad_crea_oportunidad exactamente como en
--   20260904010000_tipos_oportunidad_universidad.sql (AFTER INSERT, FOR EACH ROW).
-- ⚠ Al deshacer vuelve el bug: mientras oportunidades.persona_id sea NOT NULL, todo INSERT en
--   universidades falla. Usar solo si el fix causó otro problema y se acepta ese bloqueo.
-- Idempotente: DROP TRIGGER IF EXISTS + CREATE TRIGGER; correrlo dos veces deja un solo trigger.

BEGIN;

-- Bloque 1: recrear el trigger (solo si la función sigue existiendo; si no, se aborta con mensaje claro).
DO $$
BEGIN
  IF to_regprocedure('public.fn_crear_oportunidad_universidad()') IS NULL THEN
    RAISE EXCEPTION 'No existe public.fn_crear_oportunidad_universidad(); restaurarla desde 20260906150000 antes de deshacer.';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_universidad_crea_oportunidad ON public.universidades;
CREATE TRIGGER trg_universidad_crea_oportunidad
AFTER INSERT ON public.universidades
FOR EACH ROW EXECUTE FUNCTION public.fn_crear_oportunidad_universidad();

-- Bloque 2: quitar el comentario «SIN USO» que puso el fix (la función vuelve a estar en uso).
COMMENT ON FUNCTION public.fn_crear_oportunidad_universidad() IS NULL;

COMMIT;

-- Bloque 3: verificación (esperado: 1 fila, tgenabled = 'O').
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.universidades'::regclass
  AND tgname = 'trg_universidad_crea_oportunidad';
