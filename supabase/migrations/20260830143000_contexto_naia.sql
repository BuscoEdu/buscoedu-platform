-- =====================================================
-- FASE 6 · Contexto administrable de NaIA
-- Tabla versionada + RLS super_admin
-- =====================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.contexto_naia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  instrucciones_sistema TEXT,
  tono TEXT,
  prioridades_conversacionales JSONB NOT NULL DEFAULT '{}'::jsonb,
  respuestas_guiadas JSONB NOT NULL DEFAULT '{}'::jsonb,
  estado VARCHAR(50) NOT NULL DEFAULT 'borrador',
  activo BOOLEAN NOT NULL DEFAULT false,
  creado_por UUID REFERENCES public.usuarios_internos(id) ON DELETE SET NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contexto_naia_estado_check CHECK (estado IN ('borrador', 'publicado', 'archivado'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contexto_naia_version_unique ON public.contexto_naia(version);
CREATE INDEX IF NOT EXISTS idx_contexto_naia_estado ON public.contexto_naia(estado);
CREATE INDEX IF NOT EXISTS idx_contexto_naia_activo ON public.contexto_naia(activo);

-- Solo puede existir UNA versión activa publicada.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contexto_naia_single_active
  ON public.contexto_naia((CASE WHEN activo THEN 1 END))
  WHERE activo = true;

ALTER TABLE public.contexto_naia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contexto_naia_super_admin_select ON public.contexto_naia;
CREATE POLICY contexto_naia_super_admin_select ON public.contexto_naia
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

DROP POLICY IF EXISTS contexto_naia_super_admin_insert ON public.contexto_naia;
CREATE POLICY contexto_naia_super_admin_insert ON public.contexto_naia
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS contexto_naia_super_admin_update ON public.contexto_naia;
CREATE POLICY contexto_naia_super_admin_update ON public.contexto_naia
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS contexto_naia_super_admin_delete ON public.contexto_naia;
CREATE POLICY contexto_naia_super_admin_delete ON public.contexto_naia
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

COMMIT;
