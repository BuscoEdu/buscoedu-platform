-- PROPUESTA (NO aplicada · requiere OK de Jhon) · Fix trg_universidad_crea_oportunidad.
-- Autor: Backend BuscoEdu (bot) · 2026-10-19
-- Problema: el trigger AFTER INSERT ON public.universidades (creado en
--   20260904010000_tipos_oportunidad_universidad.sql, función redefinida en
--   20260906150000_funnel_subestado_obligatorio.sql) ejecuta fn_crear_oportunidad_universidad(),
--   que hace INSERT INTO public.oportunidades SIN persona_id. En prod persona_id es NOT NULL, así que
--   el INSERT del trigger falla con 23502 y, por ser AFTER INSERT en la misma transacción, revierte
--   el alta de la universidad: hoy NINGUNA universidad se puede crear (CRUD admin ni cargas de BD).
--   BD lo esquivó en la carga de aliadas (DR-8) desactivándolo solo durante su INSERT.
-- Para qué servía: crear una oportunidad B2B (tipo_oportunidad = 'universidad') por cada IES nueva.
--   Nunca creó ninguna en prod (las 10 demo y las 4 aliadas no tienen; ver README carga aliadas DR-8),
--   porque una IES no tiene persona y la columna exige una.
-- Fix elegido (mínimo y correcto): QUITAR el trigger. Se conserva la función (sin uso) para que el
--   deshacer pueda recrear el trigger tal cual.
-- Alternativas descartadas:
--   · Quitar NOT NULL de oportunidades.persona_id (+ CHECK tipo='universidad' OR persona_id IS NOT NULL):
--     cambia una invariante del CRM de estudiantes (RLS por persona, tareas, notas, aplicaciones,
--     Lead Center) para revivir una función que nadie usa; decisión de producto aparte.
--   · Hacer que la función «se salte» sin persona: una universidad nueva nunca tiene persona, así que
--     siempre se saltaría; es lo mismo que quitar el trigger, pero dejando código muerto que parece vivo.
-- Impacto: el alta de universidades vuelve a funcionar; no se crean oportunidades B2B automáticas
--   (igual que hoy, porque hoy fallan). Las oportunidades 'universidad' se podrán crear a mano o
--   con un flujo nuevo si producto lo pide.
-- Idempotente: DROP TRIGGER IF EXISTS. Correrlo dos veces no cambia nada.
-- Deshacer: supabase/ops/20261019_fix_trg_universidad_crea_oportunidad_deshacer.sql

BEGIN;

-- Bloque 1: quitar el trigger roto. Por qué: es la única pieza que rompe el INSERT en universidades;
-- la tabla oportunidades y su NOT NULL quedan intactos.
DROP TRIGGER IF EXISTS trg_universidad_crea_oportunidad ON public.universidades;

-- Bloque 2: dejar constancia en la función (que se conserva) de que ya no la dispara ningún trigger.
-- Por qué: que nadie la vuelva a enganchar sin resolver antes persona_id NOT NULL.
DO $$
BEGIN
  IF to_regprocedure('public.fn_crear_oportunidad_universidad()') IS NOT NULL THEN
    COMMENT ON FUNCTION public.fn_crear_oportunidad_universidad() IS
      'SIN USO desde 20261019190000: su trigger se quitó porque inserta oportunidades sin persona_id (NOT NULL) y rompía el alta de universidades.';
  END IF;
END $$;

COMMIT;

-- Bloque 3: verificación (esperado: 0 filas = el trigger ya no existe).
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.universidades'::regclass
  AND tgname = 'trg_universidad_crea_oportunidad';
