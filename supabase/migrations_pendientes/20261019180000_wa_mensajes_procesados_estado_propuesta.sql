-- PROPUESTA (NO aplicada · requiere OK de Jhon) · C-24 idempotencia pendiente/hecho para wa_mensajes_procesados.
-- Qué: agrega `estado` ('pendiente' | 'hecho') y `actualizado_en`; las filas existentes quedan 'hecho'.
-- Por qué: hoy el código (lote Ola 1/2) marca el wamid al empezar y lo LIBERA si el procesamiento falla,
-- sin columna nueva. Queda un hueco: si la función se corta (timeout de Vercel) no hay catch que libere y el
-- reintento de Meta se descarta. Con `estado`, un wamid 'pendiente' con más de 60 s se puede reclamar de nuevo.
-- El código actual funciona igual con o sin esta columna (no la lee todavía).
-- Deshacer: supabase/ops/20261019_wa_mensajes_procesados_estado_deshacer.sql

ALTER TABLE public.wa_mensajes_procesados
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'hecho',
  ADD COLUMN IF NOT EXISTS actualizado_en timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.wa_mensajes_procesados
  DROP CONSTRAINT IF EXISTS wa_mensajes_procesados_estado_check;
ALTER TABLE public.wa_mensajes_procesados
  ADD CONSTRAINT wa_mensajes_procesados_estado_check CHECK (estado IN ('pendiente', 'hecho'));

CREATE INDEX IF NOT EXISTS idx_wa_mensajes_procesados_pendientes
  ON public.wa_mensajes_procesados (actualizado_en) WHERE estado = 'pendiente';
