-- =====================================================================
-- 20261019200000 · PROPUESTA (NO aplicada) · Logos de las 4 aliadas en
-- public.imagenes_universidad
-- Autor: Backend BuscoEdu (bot) · 2026-10-19
-- Dueño de aplicarla: Base de datos BuscoEdu, solo con OK de Jhon (paquete de prod).
-- Está en migrations_pendientes/: `supabase db push` NO la lee.
--
-- Alternativa SQL a la fase F3 de scripts/subir-logos-aliadas.mjs
-- (correr el script con `--aplicar --sin-bd` y después este SQL).
-- Mismos ids de fila que el Bloque 3 de BD (20261017_carga_aliadas_4_paso2_carga.sql),
-- pero con la ruta acordada `{universidad_id}/logo.{ext}` en lugar de `poli/logo.svg`.
-- ⚠ No correr también el Bloque 3 de BD: busca rutas por slug que no se suben
--   (insertaría 0 filas; y si hubiera logo activo, lo salta igual).
--
-- Contrato con el portal (src/lib/logos-aliadas.ts → getLogosAliadas):
--   tipo='logo' AND activo=true AND universidad_id IN NEXT_PUBLIC_ALIADAS_IDS,
--   url_storage = SOLO la ruta dentro del bucket `logos-aliadas` (sin https://),
--   gana es_principal=true y luego el orden menor; alt = texto_alternativo.
--
-- Idempotente: ON CONFLICT (id) DO NOTHING + NOT EXISTS por (universidad_id, tipo='logo', activo).
-- Respeta el índice único parcial uq_imagenes_universidad_logo_principal
-- (un logo principal activo por universidad) que BD creó el 2026-10-19.
-- Deshacer: supabase/ops/20261019_logos_aliadas_deshacer.sql
-- Tras un deshacer (activo=false) este SQL NO reactiva las filas (ON CONFLICT id):
-- reactivarlas es un UPDATE explícito que decide BD.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Bloque 0 · Diagnóstico (solo lectura). Esperado: 4 objetos en el bucket
-- y 0 logos registrados para las 4 aliadas.
-- ---------------------------------------------------------------------
SELECT name, metadata->>'mimetype' AS mime, (metadata->>'size')::int AS bytes
FROM storage.objects
WHERE bucket_id = 'logos-aliadas'
  AND name IN ('6069f39d-6bd2-5991-b922-24e58ac7137a/logo.svg',
               '53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998/logo.svg',
               '79de384c-1c32-5c80-b5c0-70a12a7fa79d/logo.svg',
               '031ff5d5-fc68-519c-88d7-bd37765715b1/logo.png')
ORDER BY name;

SELECT universidad_id, id, url_storage, es_principal, activo
FROM public.imagenes_universidad
WHERE tipo = 'logo'
  AND universidad_id IN ('6069f39d-6bd2-5991-b922-24e58ac7137a', '53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998',
                         '79de384c-1c32-5c80-b5c0-70a12a7fa79d', '031ff5d5-fc68-519c-88d7-bd37765715b1');

-- ---------------------------------------------------------------------
-- Bloque 1 · Registro (una transacción)
-- Solo inserta la fila si el archivo ya está en el bucket (no deja filas
-- que apunten a un objeto inexistente) y si la aliada aún no tiene un logo
-- activo (insertar o saltar por universidad_id + tipo).
-- ---------------------------------------------------------------------
BEGIN;

INSERT INTO public.imagenes_universidad
  (id, universidad_id, tipo, url_storage, nombre_archivo, descripcion, texto_alternativo, es_principal, orden, activo)
SELECT l.id, l.universidad_id, 'logo', l.ruta, split_part(l.ruta, '/', 2),
       'Logo aliada · carga 2026-10-19 · origen ' || l.origen, l.alt, true, 0, true
FROM (VALUES
  ('c70d65ed-02d0-5115-8588-451eb6ec0c4a'::uuid, '6069f39d-6bd2-5991-b922-24e58ac7137a'::uuid,
   '6069f39d-6bd2-5991-b922-24e58ac7137a/logo.svg', 'poli/logo.svg', 'Logo de Politécnico Grancolombiano'),
  ('35b13f3a-7dbd-5b02-a918-e0da34c15fba'::uuid, '53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998'::uuid,
   '53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998/logo.svg', 'areandina/logo.svg', 'Logo de Fundación Universitaria del Área Andina'),
  ('ae5d68e6-b234-5d8b-81ec-c0254a39082a'::uuid, '79de384c-1c32-5c80-b5c0-70a12a7fa79d'::uuid,
   '79de384c-1c32-5c80-b5c0-70a12a7fa79d/logo.svg', 'unir/logo.svg', 'Logo de Fundación Universitaria Internacional de La Rioja (UNIR)'),
  ('e47d93cb-a1d9-5ff5-8caf-8ebdcf05e07d'::uuid, '031ff5d5-fc68-519c-88d7-bd37765715b1'::uuid,
   '031ff5d5-fc68-519c-88d7-bd37765715b1/logo.png', 'asturias/logo-web.png', 'Logo de Corporación Universitaria de Asturias')
) AS l(id, universidad_id, ruta, origen, alt)
WHERE EXISTS (SELECT 1 FROM public.universidades u WHERE u.id = l.universidad_id)
  AND EXISTS (SELECT 1 FROM storage.objects so WHERE so.bucket_id = 'logos-aliadas' AND so.name = l.ruta)
  AND NOT EXISTS (SELECT 1 FROM public.imagenes_universidad i
                  WHERE i.universidad_id = l.universidad_id AND i.tipo = 'logo' AND i.activo)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------
-- Bloque 2 · Verificación (solo lectura). Esperado: 4 filas, activo=true,
-- es_principal=true, objeto_existe=true. Si falta una, revisar Bloque 0.
-- ---------------------------------------------------------------------
SELECT i.universidad_id, u.nombre_oficial, i.url_storage, i.es_principal, i.activo,
       EXISTS (SELECT 1 FROM storage.objects so
               WHERE so.bucket_id = 'logos-aliadas' AND so.name = i.url_storage) AS objeto_existe
FROM public.imagenes_universidad i
JOIN public.universidades u ON u.id = i.universidad_id
WHERE i.id IN ('c70d65ed-02d0-5115-8588-451eb6ec0c4a', '35b13f3a-7dbd-5b02-a918-e0da34c15fba',
               'ae5d68e6-b234-5d8b-81ec-c0254a39082a', 'e47d93cb-a1d9-5ff5-8caf-8ebdcf05e07d')
ORDER BY u.nombre_oficial;
