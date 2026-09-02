-- DemoWapp: los marcadores de idempotencia pertenecen a eventos_negocio, no
-- al historial de comentarios de una oportunidad. Los eventos ya conservan la
-- clave técnica en metadatos y esta limpieza elimina únicamente notas internas
-- generadas por la simulación.

DROP INDEX IF EXISTS public.notas_crm_demowapp_idempotency_uq;

DELETE FROM public.notas_crm
WHERE contenido LIKE '[demowapp:%';
