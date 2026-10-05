-- =====================================================
-- A1 · Marcar como QA los contactos «QA ReE2E» del 27-sep.
-- Correr DESPUÉS de 20261005090000_a1_demowapp_hilo_es_qa.sql.
-- Acotado por nombre con prefijo exacto 'QA ReE2E'. No toca nada más.
-- =====================================================

-- 1) Verificación previa (solo lectura). Esperado: 3 personas
--    (Happy = OP-9326EF1D, Fail Closed y el tercero) y sus oportunidades.
SELECT p.id AS persona_id, p.nombres, p.apellidos, p.celular_e164,
       o.id AS oportunidad_id, upper(left(o.id::text, 8)) AS codigo_op, o.nombre
FROM public.personas p
LEFT JOIN public.oportunidades o ON o.persona_id = p.id
WHERE concat_ws(' ', p.nombres, p.apellidos) LIKE 'QA ReE2E%'
ORDER BY p.nombres;

-- 2) Marcado. Si el paso 1 no devolvió exactamente los 3 esperados, NO correr.
BEGIN;
UPDATE public.personas SET es_qa = true
 WHERE concat_ws(' ', nombres, apellidos) LIKE 'QA ReE2E%';

UPDATE public.oportunidades o SET es_qa = true
  FROM public.personas p
 WHERE o.persona_id = p.id AND p.es_qa
   AND concat_ws(' ', p.nombres, p.apellidos) LIKE 'QA ReE2E%';

UPDATE public.aplicaciones a SET es_qa = true
  FROM public.oportunidades o
 WHERE a.oportunidad_id = o.id AND o.es_qa;

UPDATE public.transferencias_universidad t SET es_qa = true, es_facturable = false
  FROM public.oportunidades o
 WHERE t.oportunidad_id = o.id AND o.es_qa;
COMMIT;
