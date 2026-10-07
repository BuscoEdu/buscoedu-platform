-- =====================================================================
-- Restyle A2 · Ola 1/3 · BD — Bucket público de logos de aliadas
-- Archivo OPS (NO es migración). Se pega en Supabase SQL Editor SOLO
-- cuando Orquestador lo pida a Jhon ("Jhon, …"). NO aplicado en prod.
-- Idempotente: se puede re-correr sin duplicar nada.
-- Contrato BE: lee el bucket de SUPABASE_LOGOS_BUCKET (default 'logos-aliadas')
-- y arma la URL pública desde imagenes_universidad.url_storage (solo la ruta).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Bloque 0 · Diagnóstico (solo lectura). Correr primero.
-- ---------------------------------------------------------------------
-- ¿Ya existe el bucket?
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id = 'logos-aliadas';

-- ¿Cuántos logos hay hoy en imagenes_universidad? (esperado: 0)
SELECT universidad_id, count(*) AS logos,
       count(*) FILTER (WHERE es_principal AND activo) AS principales_activos
FROM public.imagenes_universidad
WHERE tipo = 'logo'
GROUP BY universidad_id;

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

-- ---------------------------------------------------------------------
-- Bloque 3 · Plantilla de carga (NO correr hasta tener los 5 archivos
-- con permiso de uso subidos al bucket). Una fila por aliada.
-- url_storage = SOLO la ruta dentro del bucket, ej. 'poli/logo.svg'.
-- ---------------------------------------------------------------------
-- INSERT INTO public.imagenes_universidad
--   (universidad_id, tipo, url_storage, nombre_archivo, texto_alternativo, es_principal, orden, activo)
-- VALUES
--   ('<uuid_universidad>', 'logo', '<carpeta>/logo.svg', 'logo.svg', 'Logo de <Nombre universidad>', true, 0, true);
