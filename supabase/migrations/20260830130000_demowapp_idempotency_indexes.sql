-- Demo WApp: protección de idempotencia ante reintentos y polling concurrente.
-- No crea entidades nuevas ni modifica datos existentes.

CREATE UNIQUE INDEX IF NOT EXISTS comunicaciones_transaccionales_demowapp_idempotency_uq
  ON public.comunicaciones_transaccionales ((metadatos ->> 'idempotency_key'))
  WHERE canal = 'demo_wapp' AND metadatos ? 'idempotency_key';

CREATE UNIQUE INDEX IF NOT EXISTS mensajes_conversacion_referencia_uq
  ON public.mensajes_conversacion (conversacion_id, referencia_externa)
  WHERE referencia_externa IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notas_crm_demowapp_idempotency_uq
  ON public.notas_crm (oportunidad_id, persona_id, contenido)
  WHERE contenido LIKE '[demowapp:%';

CREATE UNIQUE INDEX IF NOT EXISTS eventos_negocio_demowapp_idempotency_uq
  ON public.eventos_negocio (evento, (metadatos ->> 'idempotency_key'))
  WHERE metadatos ? 'idempotency_key';
