-- =====================================================
-- DESHACER 20261018150000_ba036_037_soporte_panel_ia
-- Autor: Base de datos BuscoEdu (bot) · 2026-10-18
-- Qué hace: quita funciones y triggers; RENOMBRA pruebas_conexion_ia y bitacora_config_ia
--   (+ sus índices) con sufijo _retirada_20261018 (sin borrar datos); quita columnas y
--   restricciones nuevas; saca la versión del historial.
-- ⚠ Antes: Backend deja de usar estas funciones/columnas. Las columnas de proveedores_ia
--   (preset, adaptador, url_base, asistente) pierden su valor: respaldar primero con
--   SELECT id, preset_codigo, tipo_adaptador, url_base, asistente_paso, asistente_borrador FROM proveedores_ia;
-- =====================================================
BEGIN;

-- Bloque 1: funciones de negocio.
DROP FUNCTION IF EXISTS public.fn_ia_marcar_alerta_vista(uuid, uuid);
DROP FUNCTION IF EXISTS public.fn_ia_restaurar_version(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.fn_ia_cambiar_interruptor(text, uuid, boolean, jsonb, uuid);
DROP FUNCTION IF EXISTS public.fn_ia_modelo_disponible(uuid);
DROP FUNCTION IF EXISTS public.fn_ia_prueba_vigente(uuid);

-- Bloque 2: triggers de solo inserción (las tablas se renombran, no se borran).
DROP TRIGGER IF EXISTS trg_pruebas_conexion_ia_solo_insercion ON public.pruebas_conexion_ia;
DROP TRIGGER IF EXISTS trg_bitacora_config_ia_solo_insercion ON public.bitacora_config_ia;
DROP FUNCTION IF EXISTS public.fn_ia_solo_insercion();

-- Bloque 3: renombrar tablas e índices.
DO $$
DECLARE t text; i text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bitacora_config_ia', 'pruebas_conexion_ia'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL AND to_regclass('public.' || t || '_retirada_20261018') IS NULL THEN
      FOR i IN SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = t LOOP
        EXECUTE format('ALTER INDEX public.%I RENAME TO %I', i, left(i, 40) || '_ret20261018');
      END LOOP;
      EXECUTE format('ALTER TABLE public.%I RENAME TO %I', t, t || '_retirada_20261018');
    END IF;
  END LOOP;
END $$;

-- Bloque 4: columnas y restricciones.
ALTER TABLE public.alertas_gasto_ia DROP COLUMN IF EXISTS vista_por;
ALTER TABLE public.proveedores_ia
  DROP CONSTRAINT IF EXISTS proveedores_ia_preset_check,
  DROP CONSTRAINT IF EXISTS proveedores_ia_tipo_adaptador_check,
  DROP CONSTRAINT IF EXISTS proveedores_ia_url_base_check,
  DROP CONSTRAINT IF EXISTS proveedores_ia_asistente_paso_check,
  DROP CONSTRAINT IF EXISTS proveedores_ia_borrador_sin_secretos_check,
  DROP COLUMN IF EXISTS asistente_borrador,
  DROP COLUMN IF EXISTS asistente_paso,
  DROP COLUMN IF EXISTS url_base,
  DROP COLUMN IF EXISTS tipo_adaptador,
  DROP COLUMN IF EXISTS preset_codigo,
  DROP COLUMN IF EXISTS config_actualizada_en;
ALTER TABLE public.despliegues_ia DROP COLUMN IF EXISTS config_actualizada_en;

-- Bloque 5: historial.
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261018150000';

COMMIT;
