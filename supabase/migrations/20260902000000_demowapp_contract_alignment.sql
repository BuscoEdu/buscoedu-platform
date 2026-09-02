-- Demo WApp usa el canal CRM válido `whatsapp` y se identifica por metadatos.
-- Sustituye el índice legado, cuyo predicado apuntaba al canal inexistente
-- `demo_wapp`, por un índice de idempotencia para los pushes simulados reales.

DROP INDEX IF EXISTS public.comunicaciones_transaccionales_demowapp_idempotency_uq;

CREATE UNIQUE INDEX IF NOT EXISTS comunicaciones_transaccionales_demowapp_idempotency_uq
  ON public.comunicaciones_transaccionales ((metadatos ->> 'idempotency_key'))
  WHERE canal = 'whatsapp'
    AND metadatos ->> 'origen' = 'demowapp_push'
    AND metadatos ? 'idempotency_key';
