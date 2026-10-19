-- =====================================================================
-- Deshacer · 20261019_logos_aliadas_public.sql
-- Sin borrado físico (la tabla tiene `activo`): desactiva SOLO las 4 filas creadas por el script,
--   identificadas por id + ruta relativa /logos-aliadas/{universidad_id}.{ext}.
-- Estado previo (verificado en prod 19/10 ~18:05 Madrid): 0 logos registrados para las 4 aliadas,
--   así que con activo=false el Home vuelve a lo de antes (lee solo tipo='logo' AND activo).
-- No toca filas de otro origen (p. ej. rutas de Storage). Idempotente.
-- =====================================================================
BEGIN;
UPDATE public.imagenes_universidad i
   SET activo = false, actualizado_en = now()
  FROM (VALUES
    ('c70d65ed-02d0-5115-8588-451eb6ec0c4a'::uuid, '/logos-aliadas/6069f39d-6bd2-5991-b922-24e58ac7137a.svg'),
    ('35b13f3a-7dbd-5b02-a918-e0da34c15fba'::uuid, '/logos-aliadas/53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998.svg'),
    ('ae5d68e6-b234-5d8b-81ec-c0254a39082a'::uuid, '/logos-aliadas/79de384c-1c32-5c80-b5c0-70a12a7fa79d.svg'),
    ('e47d93cb-a1d9-5ff5-8caf-8ebdcf05e07d'::uuid, '/logos-aliadas/031ff5d5-fc68-519c-88d7-bd37765715b1.png')
  ) AS o(id, ruta)
 WHERE i.id = o.id AND i.url_storage = o.ruta AND i.activo;
COMMIT;
-- Verificación del deshacer: esperado 0 filas activas con ruta /logos-aliadas/
SELECT count(*) AS activas_ruta_public FROM public.imagenes_universidad
 WHERE tipo = 'logo' AND activo AND url_storage LIKE '/logos-aliadas/%';
