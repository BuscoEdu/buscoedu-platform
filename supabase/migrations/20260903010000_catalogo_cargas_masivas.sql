-- Carga masiva gobernada de catálogo educativo.
-- Los UUID internos siguen siendo la identidad de BuscoEdu. Los códigos SNIES
-- y códigos entregados por universidades se guardan como referencias externas.

CREATE TABLE IF NOT EXISTS public.referencias_externas_programa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programa_id UUID NOT NULL REFERENCES public.programas_academicos(id) ON DELETE CASCADE,
  universidad_id UUID NOT NULL REFERENCES public.universidades(id) ON DELETE CASCADE,
  fuente TEXT NOT NULL DEFAULT 'archivo_super_admin',
  codigo_externo TEXT NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT referencias_externas_programa_codigo_no_vacio CHECK (length(trim(codigo_externo)) > 0),
  CONSTRAINT referencias_externas_programa_unica UNIQUE (universidad_id, fuente, codigo_externo)
);

CREATE INDEX IF NOT EXISTS idx_referencias_externas_programa_programa
  ON public.referencias_externas_programa(programa_id);

CREATE TABLE IF NOT EXISTS public.cargas_catalogo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('programas', 'ofertas')),
  nombre_archivo TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'previsualizado'
    CHECK (estado IN ('previsualizado', 'confirmado', 'completado', 'completado_con_alertas', 'fallido')),
  total_filas INTEGER NOT NULL DEFAULT 0,
  filas_creadas INTEGER NOT NULL DEFAULT 0,
  filas_actualizadas INTEGER NOT NULL DEFAULT 0,
  filas_omitidas INTEGER NOT NULL DEFAULT 0,
  filas_con_error INTEGER NOT NULL DEFAULT 0,
  resumen JSONB NOT NULL DEFAULT '{}'::jsonb,
  creado_por UUID REFERENCES public.usuarios_internos(id) ON DELETE SET NULL,
  confirmado_por UUID REFERENCES public.usuarios_internos(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmado_en TIMESTAMPTZ,
  finalizado_en TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.cargas_catalogo_filas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carga_id UUID NOT NULL REFERENCES public.cargas_catalogo(id) ON DELETE CASCADE,
  numero_linea INTEGER NOT NULL,
  datos_origen JSONB NOT NULL DEFAULT '{}'::jsonb,
  accion TEXT NOT NULL CHECK (accion IN ('crear', 'vincular', 'actualizar', 'omitir', 'error')),
  resultado TEXT NOT NULL CHECK (resultado IN ('creado', 'vinculado', 'actualizado', 'omitido', 'error')),
  programa_id UUID REFERENCES public.programas_academicos(id) ON DELETE SET NULL,
  oferta_id UUID REFERENCES public.ofertas_academicas(id) ON DELETE SET NULL,
  mensajes JSONB NOT NULL DEFAULT '[]'::jsonb,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT cargas_catalogo_filas_linea_unica UNIQUE (carga_id, numero_linea)
);

CREATE INDEX IF NOT EXISTS idx_cargas_catalogo_creado_en ON public.cargas_catalogo(creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_cargas_catalogo_filas_carga ON public.cargas_catalogo_filas(carga_id);

ALTER TABLE public.referencias_externas_programa ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargas_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargas_catalogo_filas ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.referencias_externas_programa IS
  'Mapa entre el UUID interno de BuscoEdu y códigos externos de una universidad o fuente.';
COMMENT ON TABLE public.cargas_catalogo IS
  'Auditoría de importaciones masivas de programas y ofertas ejecutadas por super_admin.';
