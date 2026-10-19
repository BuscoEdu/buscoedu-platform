-- =====================================================================
-- 20261019 · Carga aliadas · Paso 1/5 · Bucket de logos `logos-aliadas`
-- OK de Jhon 2026-10-19 16:18 (Europe/Madrid) vía Orquestador. Prod khnrnnoxyzuulagemfbh.
-- Origen: bloques 1 y 2 de 20261007_restyle_bucket_logos_aliadas.sql, sin cambios de fondo.
-- Idempotente: ON CONFLICT en el bucket, DROP POLICY IF EXISTS + CREATE, índice IF NOT EXISTS.
-- Deshacer: 20261019_carga_aliadas_1_bucket_deshacer.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- Bloque 1 · Crear/ajustar bucket (una transacción)
-- ---------------------------------------------------------------------
BEGIN;

-- 1.1 Bucket público SOLO para logos: lectura anónima por URL pública,
--     máx. 500 KB y solo imágenes PNG/SVG/WebP.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('logos-aliadas', 'logos-aliadas', true, 512000,
        ARRAY['image/png', 'image/svg+xml', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public             = EXCLUDED.public,
    file_size_limit    = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 1.2 Escritura solo super_admin activo (mismo criterio que la RLS de
--     imagenes_universidad). El service role de BE ya salta RLS.
--     La lectura pública la da public=true; no se crea policy SELECT anónima
--     (evita listar el bucket completo).
DROP POLICY IF EXISTS "logos_aliadas_insert_super_admin" ON storage.objects;
CREATE POLICY "logos_aliadas_insert_super_admin"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'logos-aliadas'
  AND EXISTS (
    SELECT 1 FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid() AND r.codigo = 'super_admin' AND ui.activo = true
  )
);

DROP POLICY IF EXISTS "logos_aliadas_update_super_admin" ON storage.objects;
CREATE POLICY "logos_aliadas_update_super_admin"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'logos-aliadas'
  AND EXISTS (
    SELECT 1 FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid() AND r.codigo = 'super_admin' AND ui.activo = true
  )
)
WITH CHECK (bucket_id = 'logos-aliadas');

DROP POLICY IF EXISTS "logos_aliadas_delete_super_admin" ON storage.objects;
CREATE POLICY "logos_aliadas_delete_super_admin"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'logos-aliadas'
  AND EXISTS (
    SELECT 1 FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid() AND r.codigo = 'super_admin' AND ui.activo = true
  )
);

-- 1.3 Un solo logo principal activo por universidad (índice único parcial).
--     Seguro hoy: la tabla no tiene logos (ver Bloque 0).
CREATE UNIQUE INDEX IF NOT EXISTS uq_imagenes_universidad_logo_principal
ON public.imagenes_universidad (universidad_id)
WHERE tipo = 'logo' AND es_principal AND activo;

COMMIT;

-- ---------------------------------------------------------------------
-- Bloque 2 · Verificación (solo lectura)
-- ---------------------------------------------------------------------
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'logos-aliadas';

SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname LIKE 'logos_aliadas_%'
ORDER BY policyname;   -- esperado: 3 filas (delete, insert, update)

