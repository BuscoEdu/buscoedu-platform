-- Deshacer de la PROPUESTA 20261019180000_wa_mensajes_procesados_estado_propuesta.sql (C-24).
-- Qué: quita índice, CHECK y columnas `estado` / `actualizado_en`. No toca los wamid ya registrados.
-- Por qué: volver al esquema de la migración 20261017120000_ba032_whatsapp_meta.sql si la propuesta se revierte.

DROP INDEX IF EXISTS public.idx_wa_mensajes_procesados_pendientes;
ALTER TABLE public.wa_mensajes_procesados DROP CONSTRAINT IF EXISTS wa_mensajes_procesados_estado_check;
ALTER TABLE public.wa_mensajes_procesados
  DROP COLUMN IF EXISTS actualizado_en,
  DROP COLUMN IF EXISTS estado;
