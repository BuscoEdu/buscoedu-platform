-- Migración: Crear tabla imagenes_universidad
-- Descripción: Metadatos de imágenes institucionales almacenadas en Supabase Storage.

CREATE TABLE IF NOT EXISTS public.imagenes_universidad (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  universidad_id UUID REFERENCES public.universidades(id) ON DELETE CASCADE,
  tipo TEXT,
  url_storage TEXT,
  nombre_archivo TEXT,
  descripcion TEXT,
  texto_alternativo TEXT,
  es_principal BOOLEAN NOT NULL DEFAULT false,
  orden INT NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_por UUID REFERENCES public.usuarios_internos(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.imagenes_universidad IS 'Metadatos de logos, banners y galería de universidades.';
COMMENT ON COLUMN public.imagenes_universidad.url_storage IS 'Ruta/URL del archivo en Supabase Storage.';
COMMENT ON COLUMN public.imagenes_universidad.es_principal IS 'Indica la imagen principal de presentación de la universidad.';
COMMENT ON COLUMN public.imagenes_universidad.orden IS 'Orden de visualización dentro de la galería de la universidad.';

CREATE INDEX IF NOT EXISTS idx_imagenes_universidad_universidad_id ON public.imagenes_universidad (universidad_id);
CREATE INDEX IF NOT EXISTS idx_imagenes_universidad_creado_por ON public.imagenes_universidad (creado_por);
CREATE INDEX IF NOT EXISTS idx_imagenes_universidad_activo ON public.imagenes_universidad (activo);
CREATE INDEX IF NOT EXISTS idx_imagenes_universidad_principal ON public.imagenes_universidad (universidad_id, es_principal);
CREATE INDEX IF NOT EXISTS idx_imagenes_universidad_orden ON public.imagenes_universidad (universidad_id, orden);
