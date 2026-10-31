-- Deshacer O10c: devuelve estado, resuelto_en y nota de las 9 filas al valor respaldado.
BEGIN;
UPDATE public.famly_hallazgos h SET estado = r.estado, resuelto_en = r.resuelto_en, nota_resolucion = r.nota_resolucion
  FROM respaldos.famly_o10c_hallazgos_previo r WHERE h.id = r.id;
COMMIT;
