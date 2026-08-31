-- =====================================================
-- CENTRO DE AGENTES IA
-- Sistema de gobierno y parametrización de agentes IA.
-- Migra la lógica de NaIA como primer agente configurable.
--
-- Convenciones respetadas del repositorio:
--   * Esquema public.
--   * RLS restringida a super_admin mediante public.is_super_admin().
--   * Auditoría (creado_por / actualizado_por / etc.) referencia a
--     public.usuarios_internos(id) — modelo de identidad interna del
--     panel administrativo (NO auth.users), consistente con contexto_naia
--     y el resto del panel admin.
--   * Borrado lógico mediante columna activo (nunca DELETE físico).
--
-- Seguridad: el endpoint público /api/naia usa el cliente service_role,
-- que bypassa RLS; por tanto NaIA sigue operando sin sesión de usuario.
-- =====================================================

BEGIN;

-- =====================================================
-- Tabla 1: agentes_ia
-- =====================================================
CREATE TABLE IF NOT EXISTS public.agentes_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  tipo_agente text NOT NULL DEFAULT 'asesor_educativo',
  objetivo text,
  idioma_principal text NOT NULL DEFAULT 'es',
  entorno text NOT NULL DEFAULT 'produccion',
  version_activa_id uuid, -- FK circular, se agrega después con ALTER TABLE
  estado text NOT NULL DEFAULT 'borrador',
  activo boolean NOT NULL DEFAULT true,
  creado_por uuid REFERENCES public.usuarios_internos(id) ON DELETE SET NULL,
  actualizado_por uuid REFERENCES public.usuarios_internos(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agentes_ia_estado_check CHECK (estado IN ('borrador', 'activo', 'pausado', 'archivado'))
);

-- =====================================================
-- Tabla 2: proveedores_ia
-- =====================================================
CREATE TABLE IF NOT EXISTS public.proveedores_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE NOT NULL,
  nombre text NOT NULL,
  tipo_proveedor text NOT NULL DEFAULT 'llm',
  descripcion text,
  capacidades jsonb,
  estado text NOT NULL DEFAULT 'activo',
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proveedores_ia_estado_check CHECK (estado IN ('activo', 'inactivo', 'archivado'))
);

-- =====================================================
-- Tabla 3: despliegues_ia
-- Solo almacena la REFERENCIA (nombre) de la variable de entorno,
-- nunca el valor real del token ni del deployment id.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.despliegues_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id uuid NOT NULL REFERENCES public.proveedores_ia(id),
  nombre text NOT NULL,
  identificador_externo text,  -- nombre de la variable de entorno del deployment_id
  modelo text,
  ambiente text NOT NULL DEFAULT 'produccion',
  configuracion_tecnica jsonb,
  referencia_secreto text,     -- nombre de la variable de entorno del token
  estado text NOT NULL DEFAULT 'activo',
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT despliegues_ia_estado_check CHECK (estado IN ('activo', 'inactivo', 'archivado'))
);

-- =====================================================
-- Tabla 4: versiones_agente_ia
-- =====================================================
CREATE TABLE IF NOT EXISTS public.versiones_agente_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id uuid NOT NULL REFERENCES public.agentes_ia(id),
  numero_version text NOT NULL,
  nombre_version text,
  estado text NOT NULL DEFAULT 'borrador',
  objetivo_version text,
  notas_cambio text,
  configuracion_snapshot jsonb,
  publicada_en timestamptz,
  desactivada_en timestamptz,
  creada_por uuid REFERENCES public.usuarios_internos(id) ON DELETE SET NULL,
  aprobada_por uuid REFERENCES public.usuarios_internos(id) ON DELETE SET NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT versiones_agente_ia_estado_check CHECK (estado IN ('borrador', 'publicada', 'desactivada', 'archivada')),
  CONSTRAINT versiones_agente_ia_version_unica UNIQUE (agente_id, numero_version)
);

-- FK circular: agentes_ia.version_activa_id -> versiones_agente_ia.id
ALTER TABLE public.agentes_ia
  DROP CONSTRAINT IF EXISTS fk_version_activa;
ALTER TABLE public.agentes_ia
  ADD CONSTRAINT fk_version_activa
  FOREIGN KEY (version_activa_id) REFERENCES public.versiones_agente_ia(id);

-- =====================================================
-- Tabla 5: componentes_contexto_ia
-- =====================================================
CREATE TABLE IF NOT EXISTS public.componentes_contexto_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE NOT NULL,
  nombre text NOT NULL,
  tipo_contexto text NOT NULL,
  contenido text NOT NULL,
  prioridad integer NOT NULL DEFAULT 100,
  es_obligatorio boolean NOT NULL DEFAULT false,
  version text NOT NULL DEFAULT '1.0',
  estado text NOT NULL DEFAULT 'activo',
  activo boolean NOT NULL DEFAULT true,
  creado_por uuid REFERENCES public.usuarios_internos(id) ON DELETE SET NULL,
  actualizado_por uuid REFERENCES public.usuarios_internos(id) ON DELETE SET NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT componentes_contexto_ia_estado_check CHECK (estado IN ('activo', 'inactivo', 'archivado'))
);

-- =====================================================
-- Tabla 6: versiones_agente_contextos
-- =====================================================
CREATE TABLE IF NOT EXISTS public.versiones_agente_contextos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_agente_id uuid NOT NULL REFERENCES public.versiones_agente_ia(id),
  componente_contexto_id uuid NOT NULL REFERENCES public.componentes_contexto_ia(id),
  orden integer NOT NULL DEFAULT 0,
  rol_contexto text NOT NULL DEFAULT 'sistema',
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- Tabla 7: canales_ia
-- =====================================================
CREATE TABLE IF NOT EXISTS public.canales_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE NOT NULL,
  nombre text NOT NULL,
  tipo text NOT NULL DEFAULT 'texto',
  descripcion text,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- Tabla 8: configuraciones_agente_canal
-- =====================================================
CREATE TABLE IF NOT EXISTS public.configuraciones_agente_canal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_agente_id uuid NOT NULL REFERENCES public.versiones_agente_ia(id),
  canal_id uuid NOT NULL REFERENCES public.canales_ia(id),
  nombre_publico text,
  tono text,
  longitud_maxima_respuesta integer,
  reglas_especificas text,
  plantilla_respuesta text,
  requiere_consentimiento boolean NOT NULL DEFAULT true,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- Tabla 9: herramientas_ia
-- =====================================================
CREATE TABLE IF NOT EXISTS public.herramientas_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  tipo_operacion text NOT NULL DEFAULT 'consulta',
  requiere_confirmacion boolean NOT NULL DEFAULT false,
  requiere_consentimiento boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- Tabla 10: agente_herramientas
-- =====================================================
CREATE TABLE IF NOT EXISTS public.agente_herramientas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_agente_id uuid NOT NULL REFERENCES public.versiones_agente_ia(id),
  herramienta_id uuid NOT NULL REFERENCES public.herramientas_ia(id),
  habilitada boolean NOT NULL DEFAULT true,
  canales_permitidos jsonb,
  requiere_aprobacion_humana boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- Tabla 11: fuentes_contexto_ia
-- =====================================================
CREATE TABLE IF NOT EXISTS public.fuentes_contexto_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text UNIQUE NOT NULL,
  nombre text NOT NULL,
  tipo_fuente text NOT NULL DEFAULT 'tabla_supabase',
  entidad_origen text,
  configuracion_consulta jsonb,
  reglas_filtro text,
  estado text NOT NULL DEFAULT 'activo',
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fuentes_contexto_ia_estado_check CHECK (estado IN ('activo', 'inactivo', 'archivado'))
);

-- =====================================================
-- Tabla 12: agente_fuentes_contexto
-- =====================================================
CREATE TABLE IF NOT EXISTS public.agente_fuentes_contexto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_agente_id uuid NOT NULL REFERENCES public.versiones_agente_ia(id),
  fuente_contexto_id uuid NOT NULL REFERENCES public.fuentes_contexto_ia(id),
  prioridad integer NOT NULL DEFAULT 100,
  modo_acceso text NOT NULL DEFAULT 'solo_lectura',
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- =====================================================
-- Tabla 13: pruebas_agente_ia
-- =====================================================
CREATE TABLE IF NOT EXISTS public.pruebas_agente_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_agente_id uuid NOT NULL REFERENCES public.versiones_agente_ia(id),
  nombre_prueba text NOT NULL,
  mensaje_entrada text NOT NULL,
  contexto_prueba jsonb,
  respuesta_esperada text,
  respuesta_obtenida text,
  resultado text NOT NULL DEFAULT 'pendiente',
  observaciones text,
  ejecutada_por uuid REFERENCES public.usuarios_internos(id) ON DELETE SET NULL,
  ejecutada_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pruebas_agente_ia_resultado_check CHECK (resultado IN ('pendiente', 'exitosa', 'fallida'))
);

-- =====================================================
-- Tabla 14: ejecuciones_agente_ia
-- conversacion_id / mensaje_id son nullable y SIN FK dura para no
-- acoplar a nombres exactos de tablas existentes de conversación.
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ejecuciones_agente_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_id uuid NOT NULL REFERENCES public.agentes_ia(id),
  version_agente_id uuid NOT NULL REFERENCES public.versiones_agente_ia(id),
  despliegue_id uuid NOT NULL REFERENCES public.despliegues_ia(id),
  canal_id uuid NOT NULL REFERENCES public.canales_ia(id),
  conversacion_id uuid,
  mensaje_id uuid,
  estado text NOT NULL DEFAULT 'exitoso',
  duracion_ms integer,
  tokens_entrada integer,
  tokens_salida integer,
  respuesta jsonb,
  herramientas_ejecutadas jsonb,
  error text,
  ejecutado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ejecuciones_agente_ia_estado_check CHECK (estado IN ('exitoso', 'error', 'fallback'))
);

-- =====================================================
-- Índices
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_agentes_ia_codigo ON public.agentes_ia(codigo);
CREATE INDEX IF NOT EXISTS idx_agentes_ia_estado ON public.agentes_ia(estado);
CREATE INDEX IF NOT EXISTS idx_despliegues_ia_proveedor ON public.despliegues_ia(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_versiones_agente_ia_agente ON public.versiones_agente_ia(agente_id);
CREATE INDEX IF NOT EXISTS idx_versiones_agente_ia_estado ON public.versiones_agente_ia(estado);
CREATE INDEX IF NOT EXISTS idx_vac_version ON public.versiones_agente_contextos(version_agente_id);
CREATE INDEX IF NOT EXISTS idx_vac_componente ON public.versiones_agente_contextos(componente_contexto_id);
CREATE INDEX IF NOT EXISTS idx_config_canal_version ON public.configuraciones_agente_canal(version_agente_id);
CREATE INDEX IF NOT EXISTS idx_config_canal_canal ON public.configuraciones_agente_canal(canal_id);
CREATE INDEX IF NOT EXISTS idx_agente_herramientas_version ON public.agente_herramientas(version_agente_id);
CREATE INDEX IF NOT EXISTS idx_agente_fuentes_version ON public.agente_fuentes_contexto(version_agente_id);
CREATE INDEX IF NOT EXISTS idx_pruebas_version ON public.pruebas_agente_ia(version_agente_id);
CREATE INDEX IF NOT EXISTS idx_ejecuciones_agente ON public.ejecuciones_agente_ia(agente_id);
CREATE INDEX IF NOT EXISTS idx_ejecuciones_canal ON public.ejecuciones_agente_ia(canal_id);
CREATE INDEX IF NOT EXISTS idx_ejecuciones_estado ON public.ejecuciones_agente_ia(estado);
CREATE INDEX IF NOT EXISTS idx_ejecuciones_fecha ON public.ejecuciones_agente_ia(ejecutado_en DESC);

-- =====================================================
-- RLS: solo super_admin puede operar el Centro de Agentes IA.
-- El endpoint público usa service_role (bypassa RLS).
-- =====================================================
DO $$
DECLARE
  t text;
  tablas text[] := ARRAY[
    'agentes_ia',
    'proveedores_ia',
    'despliegues_ia',
    'versiones_agente_ia',
    'componentes_contexto_ia',
    'versiones_agente_contextos',
    'canales_ia',
    'configuraciones_agente_canal',
    'herramientas_ia',
    'agente_herramientas',
    'fuentes_contexto_ia',
    'agente_fuentes_contexto',
    'pruebas_agente_ia',
    'ejecuciones_agente_ia'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_sa_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_super_admin());',
      t || '_sa_select', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_sa_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());',
      t || '_sa_insert', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_sa_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());',
      t || '_sa_update', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_sa_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.is_super_admin());',
      t || '_sa_delete', t
    );
  END LOOP;
END $$;

COMMIT;
