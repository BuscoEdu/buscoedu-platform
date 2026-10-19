-- =====================================================================
-- Deshacer 20261019 · Logos de las 4 aliadas (imagenes_universidad + Storage)
-- Autor: Backend BuscoEdu (bot) · 2026-10-19 · NO aplicado.
-- Dueño de aplicarlo: Base de datos BuscoEdu, solo con OK de Jhon.
-- Revierte: supabase/migrations_pendientes/20261019200000_logos_aliadas_imagenes_universidad_propuesta.sql
--           y la fase F3 de scripts/subir-logos-aliadas.mjs.
--
-- La tabla tiene `activo` → soft-delete (activo=false), sin borrado físico.
-- Solo toca las 4 filas por id fijo Y ruta exacta: no afecta otros logos.
-- Con activo=false getLogosAliadas deja de leerlas y la franja del Home
-- se oculta sola (lista vacía → no se pinta). Idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Bloque 1 · Desactivar las 4 filas (una transacción)
-- ---------------------------------------------------------------------
BEGIN;

UPDATE public.imagenes_universidad
   SET activo = false, actualizado_en = now()
 WHERE activo
   AND (id, url_storage) IN (
     ('c70d65ed-02d0-5115-8588-451eb6ec0c4a'::uuid, '6069f39d-6bd2-5991-b922-24e58ac7137a/logo.svg'),
     ('35b13f3a-7dbd-5b02-a918-e0da34c15fba'::uuid, '53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998/logo.svg'),
     ('ae5d68e6-b234-5d8b-81ec-c0254a39082a'::uuid, '79de384c-1c32-5c80-b5c0-70a12a7fa79d/logo.svg'),
     ('e47d93cb-a1d9-5ff5-8caf-8ebdcf05e07d'::uuid, '031ff5d5-fc68-519c-88d7-bd37765715b1/logo.png')
   );

COMMIT;

-- ---------------------------------------------------------------------
-- Bloque 2 · Verificación (solo lectura). Esperado: 0 filas activas.
-- ---------------------------------------------------------------------
SELECT id, universidad_id, url_storage, activo
FROM public.imagenes_universidad
WHERE id IN ('c70d65ed-02d0-5115-8588-451eb6ec0c4a', '35b13f3a-7dbd-5b02-a918-e0da34c15fba',
             'ae5d68e6-b234-5d8b-81ec-c0254a39082a', 'e47d93cb-a1d9-5ff5-8caf-8ebdcf05e07d')
  AND activo;

-- ---------------------------------------------------------------------
-- Bloque 3 · Archivos en Storage (NO es SQL: Supabase no borra objetos por SQL)
-- Opcional: el bucket es público, así que mientras existan los archivos sus
-- URLs siguen respondiendo aunque el portal ya no las muestre.
-- Desde el Dashboard (Storage → logos-aliadas → borrar las 4 carpetas uuid)
-- o con la Storage API (credencial de servicio en el entorno, nunca impresa):
--
--   curl -sS -X DELETE "$SUPABASE_URL/storage/v1/object/logos-aliadas" \
--     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
--     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
--     -H "Content-Type: application/json" \
--     -d '{"prefixes":["6069f39d-6bd2-5991-b922-24e58ac7137a/logo.svg",
--                      "53f1c6bc-3e06-5b8d-91e0-6ed8b25b5998/logo.svg",
--                      "79de384c-1c32-5c80-b5c0-70a12a7fa79d/logo.svg",
--                      "031ff5d5-fc68-519c-88d7-bd37765715b1/logo.png"]}'
--
-- Con el bucket vacío, BD puede correr 20261019_carga_aliadas_1_bucket_deshacer.sql
-- (en wt-bd-carga) si también quiere quitar el bucket.
-- =====================================================================
