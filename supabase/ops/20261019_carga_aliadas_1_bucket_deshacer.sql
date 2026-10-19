-- =====================================================================
-- Deshacer 20261019 · Paso 1/5 · Bucket `logos-aliadas`
-- Orden: correr DESPUÉS de deshacer el paso 4 (logos en imagenes_universidad).
-- No borra archivos: si el bucket tiene objetos, primero hay que vaciarlo
-- desde la Storage API / dashboard (Supabase no permite borrar objetos por SQL).
-- =====================================================================
BEGIN;
-- Bloque 1 · Políticas de escritura del bucket
DROP POLICY IF EXISTS "logos_aliadas_insert_super_admin" ON storage.objects;
DROP POLICY IF EXISTS "logos_aliadas_update_super_admin" ON storage.objects;
DROP POLICY IF EXISTS "logos_aliadas_delete_super_admin" ON storage.objects;
-- Bloque 2 · Índice de un logo principal por universidad
DROP INDEX IF EXISTS public.uq_imagenes_universidad_logo_principal;
-- Bloque 3 · Bucket (solo si está vacío)
DELETE FROM storage.buckets b
 WHERE b.id = 'logos-aliadas'
   AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = b.id);
COMMIT;
-- Verificación: 0 filas
SELECT id FROM storage.buckets WHERE id = 'logos-aliadas';
