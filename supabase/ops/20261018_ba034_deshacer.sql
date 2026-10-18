-- =====================================================
-- Deshacer BA-034 · registros_costo_ia
-- Qué hace: elimina la tabla de registros de costo IA creada por
--   20261018130000_ba034_registros_costo_ia.sql (y con ella sus índices y su policy).
-- Para qué: volver al estado previo. El backend sigue funcionando: si la tabla no
--   existe, el registro de costo avisa en el log y la respuesta al estudiante sigue.
-- OJO: borra el historial de costos guardado. Exportarlo antes si se necesita.
-- No se ejecuta solo; correr a mano con OK de Jhon.
-- =====================================================
BEGIN;
DROP TABLE IF EXISTS public.registros_costo_ia;
COMMIT;
