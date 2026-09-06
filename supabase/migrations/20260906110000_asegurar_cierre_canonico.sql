-- Garantiza el destino común del cierre: Cerrada/Ganada y Cerrada/Perdida.
-- No modifica etapas existentes ni mueve oportunidades históricas.
BEGIN;

DO $$
DECLARE
  v_cerrada uuid;
BEGIN
  SELECT id INTO v_cerrada
  FROM public.etapas_embudo
  WHERE lower(trim(nombre)) = 'cerrada'
  ORDER BY orden
  LIMIT 1;

  IF v_cerrada IS NULL THEN
    INSERT INTO public.etapas_embudo
      (nombre, descripcion, orden, color, es_etapa_final_ganada, es_etapa_final_perdida, activo)
    VALUES
      ('Cerrada', 'Agrupa los cierres Ganada y Perdida.', 999, '#64748B', false, false, true)
    RETURNING id INTO v_cerrada;
  END IF;

  INSERT INTO public.subestados_oportunidad
    (etapa_id, nombre, descripcion, orden, tiempo_maximo_horas, activo)
  SELECT v_cerrada, 'Ganada', 'Conversión validada.', 1, NULL, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.subestados_oportunidad
    WHERE etapa_id = v_cerrada AND lower(trim(nombre)) = 'ganada'
  );

  INSERT INTO public.subestados_oportunidad
    (etapa_id, nombre, descripcion, orden, tiempo_maximo_horas, activo)
  SELECT v_cerrada, 'Perdida', 'Cierre no convertido con causa registrada.', 2, NULL, true
  WHERE NOT EXISTS (
    SELECT 1 FROM public.subestados_oportunidad
    WHERE etapa_id = v_cerrada AND lower(trim(nombre)) = 'perdida'
  );
END $$;

COMMIT;
