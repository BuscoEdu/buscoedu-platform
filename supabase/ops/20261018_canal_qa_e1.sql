-- =====================================================================
-- 20261018_canal_qa_e1.sql
-- Qué: crea el canal de IA `qa_e1` (sin agente) con tope diario USD 5 y
--      alerta al 80 %. Autor: Base de datos BuscoEdu. OK de Jhon 18/10 17:23.
-- Idempotente: se puede correr varias veces sin duplicar nada.
-- No toca web, whatsapp, NaIA (agentes_ia), proveedores_ia (Abacus) ni despliegues.
-- =====================================================================
BEGIN;

-- Bloque 1: crear el canal si no existe. agente_predeterminado_id queda NULL
-- (sin agente publicado). El trigger trg_canales_ia_tope_por_defecto crea
-- automáticamente su fila en topes_gasto_ia con los valores por defecto.
INSERT INTO public.canales_ia (codigo, nombre, tipo, descripcion, activo, agente_predeterminado_id)
VALUES ('qa_e1', 'QA E1', 'texto', 'Canal de pruebas QA E1. Sin agente publicado.', true, NULL)
ON CONFLICT (codigo) DO NOTHING;

-- Bloque 2: fijar el tope con la función oficial (BA-038). Solo deja registro
-- en bitacora_topes_gasto_ia si el valor cambia de verdad; si el tope ya es
-- 5.00 / 80 (default del trigger), la función no escribe bitácora.
DO $$
DECLARE r jsonb;
BEGIN
  r := public.fn_ia_actualizar_tope('qa_e1', 5.00, 80, NULL);
  IF coalesce((r->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'fn_ia_actualizar_tope falló: %', r;
  END IF;
END $$;

-- Bloque 3: verificación (fail-closed). El canal debe existir sin agente y con su tope.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.canales_ia c JOIN public.topes_gasto_ia t ON t.canal_id = c.id
    WHERE c.codigo = 'qa_e1' AND c.agente_predeterminado_id IS NULL
      AND t.tope_diario_usd = 5.00 AND t.umbral_alerta_pct = 80) THEN
    RAISE EXCEPTION 'Verificación qa_e1 falló';
  END IF;
END $$;

COMMIT;
