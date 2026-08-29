# 📦 Migraciones SQL - Panel de Administración BuscoEdu

## 🎯 Instrucciones

1. Ve a tu proyecto Supabase: https://supabase.com/dashboard
2. Abre el **"SQL Editor"** (en el menú izquierdo)
3. **Copia TODO el código SQL de abajo**
4. Pégalo en el editor
5. Click en **"RUN"** para ejecutar
6. Verifica que se ejecutó sin errores

---

## 📝 Código SQL Completo

```sql
-- =====================================================
-- MIGRACIONES COMPLETAS DEL PANEL DE ADMINISTRACIÓN
-- BuscoEdu Platform
-- =====================================================
-- 
-- Este script es IDEMPOTENTE: puedes ejecutarlo múltiples veces sin problemas
-- =====================================================

BEGIN;

-- =====================================================
-- MIGRACIÓN 1: TABLA ROLES
-- =====================================================

CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    permisos JSONB DEFAULT '{}'::jsonb,
    activo BOOLEAN DEFAULT true,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.roles IS 'Catálogo de roles internos de BuscoEdu';
COMMENT ON COLUMN public.roles.codigo IS 'Código único del rol (super_admin, admin, asesor, etc.)';
COMMENT ON COLUMN public.roles.permisos IS 'Permisos granulares en formato JSON';

CREATE INDEX IF NOT EXISTS idx_roles_activo ON public.roles(activo);

INSERT INTO public.roles (codigo, nombre, descripcion, permisos, activo) VALUES
('super_admin', 'Super Administrador', 'Acceso completo al sistema', '{"all": true}'::jsonb, true),
('admin', 'Administrador', 'Gestión de contenido y operaciones', '{"universidades": true, "programas": true}'::jsonb, true),
('asesor', 'Asesor Comercial', 'Gestión de leads y conversaciones', '{"leads": true, "crm": true}'::jsonb, true),
('editor_contenido', 'Editor de Contenido', 'Creación y edición de contenido educativo', '{"contenido": true}'::jsonb, true),
('analista', 'Analista', 'Visualización de reportes y métricas', '{"reportes": true, "readonly": true}'::jsonb, true),
('operaciones', 'Operaciones', 'Gestión operativa y soporte', '{"soporte": true, "configuracion": true}'::jsonb, true)
ON CONFLICT (codigo) DO NOTHING;

-- =====================================================
-- MIGRACIÓN 2: TABLA USUARIOS_INTERNOS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.usuarios_internos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    rol_id UUID REFERENCES public.roles(id) ON DELETE SET NULL,
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    correo TEXT UNIQUE NOT NULL,
    telefono TEXT,
    cargo TEXT,
    activo BOOLEAN DEFAULT true,
    ultimo_acceso_en TIMESTAMPTZ,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.usuarios_internos IS 'Usuarios del equipo interno de BuscoEdu';
COMMENT ON COLUMN public.usuarios_internos.auth_user_id IS 'Vínculo con la tabla auth.users de Supabase';
COMMENT ON COLUMN public.usuarios_internos.rol_id IS 'Rol asignado del catálogo roles';

CREATE INDEX IF NOT EXISTS idx_usuarios_internos_rol ON public.usuarios_internos(rol_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_internos_auth_user ON public.usuarios_internos(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_internos_activo ON public.usuarios_internos(activo);
CREATE INDEX IF NOT EXISTS idx_usuarios_internos_ultimo_acceso ON public.usuarios_internos(ultimo_acceso_en);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_internos_auth_unique ON public.usuarios_internos(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- =====================================================
-- MIGRACIÓN 3: TABLA JORNADAS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.jornadas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    activo BOOLEAN DEFAULT true
);

COMMENT ON TABLE public.jornadas IS 'Catálogo de jornadas académicas (diurna, nocturna, etc.)';
COMMENT ON COLUMN public.jornadas.codigo IS 'Código único de la jornada';

CREATE INDEX IF NOT EXISTS idx_jornadas_activo ON public.jornadas(activo);

INSERT INTO public.jornadas (codigo, nombre, descripcion, activo) VALUES
('diurna', 'Diurna', 'Clases durante el día (mañana y/o tarde)', true),
('nocturna', 'Nocturna', 'Clases en horario nocturno', true),
('fines_de_semana', 'Fines de Semana', 'Clases los sábados y domingos', true),
('intensiva', 'Intensiva', 'Clases concentradas en períodos cortos', true),
('flexible', 'Flexible', 'Horarios flexibles o a convenir', true)
ON CONFLICT (codigo) DO NOTHING;

-- =====================================================
-- MIGRACIÓN 4: TABLA TIPOS_BENEFICIO
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tipos_beneficio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    activo BOOLEAN DEFAULT true
);

COMMENT ON TABLE public.tipos_beneficio IS 'Catálogo de tipos de beneficios comerciales';
COMMENT ON COLUMN public.tipos_beneficio.codigo IS 'Código único del tipo de beneficio';

CREATE INDEX IF NOT EXISTS idx_tipos_beneficio_activo ON public.tipos_beneficio(activo);

INSERT INTO public.tipos_beneficio (codigo, nombre, descripcion, activo) VALUES
('beca_postulacion', 'Beca por Postulación', 'Beca otorgada a través de proceso de postulación', true),
('beca_apropiacion_directa', 'Beca por Apropiación Directa', 'Beca otorgada automáticamente según perfil', true),
('descuento', 'Descuento', 'Descuento porcentual o fijo en el precio', true),
('financiacion', 'Financiación', 'Plan de financiación o pago diferido', true),
('beneficio_convenio', 'Beneficio por Convenio', 'Beneficio por convenio institucional o empresarial', true),
('beneficio_temporal', 'Beneficio Temporal', 'Promoción o beneficio por tiempo limitado', true),
('otro', 'Otro', 'Otro tipo de beneficio no categorizado', true)
ON CONFLICT (codigo) DO NOTHING;

-- =====================================================
-- MIGRACIÓN 5: TABLA PERIODOS_ACADEMICOS
-- =====================================================

CREATE TABLE IF NOT EXISTS public.periodos_academicos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    universidad_id UUID REFERENCES public.universidades(id) ON DELETE CASCADE,
    sede_id UUID REFERENCES public.sedes(id) ON DELETE SET NULL,
    nombre TEXT NOT NULL,
    tipo_periodicidad TEXT,
    fecha_inicio DATE,
    fecha_fin DATE,
    fecha_limite_inscripcion DATE,
    fecha_limite_matricula DATE,
    anio INT,
    numero_periodo INT,
    estado TEXT DEFAULT 'activo',
    notas TEXT,
    activo BOOLEAN DEFAULT true,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.periodos_academicos IS 'Periodos académicos oficiales de universidades y sedes';
COMMENT ON COLUMN public.periodos_academicos.tipo_periodicidad IS 'semestral, cuatrimestral, trimestral, anual, intensivo';
COMMENT ON COLUMN public.periodos_academicos.estado IS 'activo, en_curso, finalizado, cancelado';

CREATE INDEX IF NOT EXISTS idx_periodos_academicos_universidad ON public.periodos_academicos(universidad_id);
CREATE INDEX IF NOT EXISTS idx_periodos_academicos_sede ON public.periodos_academicos(sede_id);
CREATE INDEX IF NOT EXISTS idx_periodos_academicos_activo ON public.periodos_academicos(activo);
CREATE INDEX IF NOT EXISTS idx_periodos_academicos_estado ON public.periodos_academicos(estado);
CREATE INDEX IF NOT EXISTS idx_periodos_academicos_anio ON public.periodos_academicos(anio);
CREATE INDEX IF NOT EXISTS idx_periodos_academicos_fecha_inicio ON public.periodos_academicos(fecha_inicio);

-- =====================================================
-- MIGRACIÓN 6: TABLA PERIODOS_COMERCIALES
-- =====================================================

CREATE TABLE IF NOT EXISTS public.periodos_comerciales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    descripcion TEXT,
    fecha_inicio DATE,
    fecha_fin DATE,
    periodo_academico_objetivo_id UUID REFERENCES public.periodos_academicos(id) ON DELETE SET NULL,
    estado TEXT DEFAULT 'activo',
    activo BOOLEAN DEFAULT true,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.periodos_comerciales IS 'Ventanas comerciales de campañas vinculadas a periodos académicos';
COMMENT ON COLUMN public.periodos_comerciales.estado IS 'activo, finalizado, cancelado';

CREATE INDEX IF NOT EXISTS idx_periodos_comerciales_objetivo ON public.periodos_comerciales(periodo_academico_objetivo_id);
CREATE INDEX IF NOT EXISTS idx_periodos_comerciales_activo ON public.periodos_comerciales(activo);
CREATE INDEX IF NOT EXISTS idx_periodos_comerciales_estado ON public.periodos_comerciales(estado);
CREATE INDEX IF NOT EXISTS idx_periodos_comerciales_fecha_inicio ON public.periodos_comerciales(fecha_inicio);

-- =====================================================
-- MIGRACIÓN 7: TABLA PRECIOS_OFERTA
-- =====================================================

CREATE TABLE IF NOT EXISTS public.precios_oferta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oferta_id UUID REFERENCES public.ofertas_academicas(id) ON DELETE CASCADE,
    tipo_valor TEXT,
    concepto_cobro TEXT,
    valor NUMERIC(12, 2),
    moneda TEXT DEFAULT 'COP',
    periodicidad TEXT,
    impuestos_incluidos BOOLEAN DEFAULT false,
    descripcion_condiciones TEXT,
    periodo_academico_id UUID REFERENCES public.periodos_academicos(id) ON DELETE SET NULL,
    fuente TEXT,
    estado_validacion TEXT DEFAULT 'pendiente',
    fecha_validacion TIMESTAMPTZ,
    validado_por UUID REFERENCES public.usuarios_internos(id) ON DELETE SET NULL,
    vigente_desde DATE,
    vigente_hasta DATE,
    es_precio_activo BOOLEAN DEFAULT true,
    reemplaza_precio_id UUID REFERENCES public.precios_oferta(id) ON DELETE SET NULL,
    creado_por UUID REFERENCES public.usuarios_internos(id) ON DELETE SET NULL,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.precios_oferta IS 'Sistema versionado de precios - NUNCA editar, solo crear nuevos';
COMMENT ON COLUMN public.precios_oferta.es_precio_activo IS 'true = precio vigente, false = precio histórico';
COMMENT ON COLUMN public.precios_oferta.reemplaza_precio_id IS 'ID del precio anterior (para trazabilidad)';

CREATE INDEX IF NOT EXISTS idx_precios_oferta_oferta ON public.precios_oferta(oferta_id);
CREATE INDEX IF NOT EXISTS idx_precios_oferta_periodo ON public.precios_oferta(periodo_academico_id);
CREATE INDEX IF NOT EXISTS idx_precios_oferta_validacion ON public.precios_oferta(estado_validacion);
CREATE INDEX IF NOT EXISTS idx_precios_oferta_activo ON public.precios_oferta(es_precio_activo);

-- =====================================================
-- MIGRACIÓN 8: TABLA BENEFICIOS_OFERTA
-- =====================================================

CREATE TABLE IF NOT EXISTS public.beneficios_oferta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    oferta_id UUID REFERENCES public.ofertas_academicas(id) ON DELETE CASCADE,
    tipo_beneficio_id UUID REFERENCES public.tipos_beneficio(id) ON DELETE SET NULL,
    nombre_beneficio TEXT NOT NULL,
    descripcion TEXT,
    condiciones TEXT,
    cupos_disponibles INT,
    vigente_desde DATE,
    vigente_hasta DATE,
    estado_validacion TEXT DEFAULT 'pendiente',
    estado_publicacion TEXT DEFAULT 'creado_internamente',
    es_principal BOOLEAN DEFAULT false,
    activo BOOLEAN DEFAULT true,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.beneficios_oferta IS 'Beneficios asociados a ofertas académicas';
COMMENT ON COLUMN public.beneficios_oferta.es_principal IS 'true = beneficio destacado de la oferta';

CREATE INDEX IF NOT EXISTS idx_beneficios_oferta_oferta ON public.beneficios_oferta(oferta_id);
CREATE INDEX IF NOT EXISTS idx_beneficios_oferta_tipo ON public.beneficios_oferta(tipo_beneficio_id);
CREATE INDEX IF NOT EXISTS idx_beneficios_oferta_validacion ON public.beneficios_oferta(estado_validacion);
CREATE INDEX IF NOT EXISTS idx_beneficios_oferta_publicacion ON public.beneficios_oferta(estado_publicacion);
CREATE INDEX IF NOT EXISTS idx_beneficios_oferta_activo ON public.beneficios_oferta(activo);

-- =====================================================
-- MIGRACIÓN 9: TABLA IMAGENES_UNIVERSIDAD
-- =====================================================

CREATE TABLE IF NOT EXISTS public.imagenes_universidad (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    universidad_id UUID REFERENCES public.universidades(id) ON DELETE CASCADE,
    tipo TEXT,
    url_storage TEXT,
    nombre_archivo TEXT,
    descripcion TEXT,
    texto_alternativo TEXT,
    es_principal BOOLEAN DEFAULT false,
    orden INT DEFAULT 0,
    activo BOOLEAN DEFAULT true,
    creado_por UUID REFERENCES public.usuarios_internos(id) ON DELETE SET NULL,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.imagenes_universidad IS 'Metadatos de imágenes institucionales (archivos en Supabase Storage)';
COMMENT ON COLUMN public.imagenes_universidad.tipo IS 'logo, banner, galeria, etc.';

CREATE INDEX IF NOT EXISTS idx_imagenes_universidad_univ ON public.imagenes_universidad(universidad_id);
CREATE INDEX IF NOT EXISTS idx_imagenes_universidad_creador ON public.imagenes_universidad(creado_por);
CREATE INDEX IF NOT EXISTS idx_imagenes_universidad_activo ON public.imagenes_universidad(activo);

-- =====================================================
-- MIGRACIÓN 10: TABLA USUARIOS_UNIVERSIDAD
-- =====================================================

CREATE TABLE IF NOT EXISTS public.usuarios_universidad (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    universidad_id UUID REFERENCES public.universidades(id) ON DELETE CASCADE,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    correo TEXT UNIQUE NOT NULL,
    nombres TEXT NOT NULL,
    apellidos TEXT NOT NULL,
    cargo TEXT,
    rol_universidad TEXT DEFAULT 'editor',
    activo BOOLEAN DEFAULT true,
    ultimo_acceso_en TIMESTAMPTZ,
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.usuarios_universidad IS 'Usuarios B2B de universidades (futuro panel B2B)';

CREATE INDEX IF NOT EXISTS idx_usuarios_universidad_univ ON public.usuarios_universidad(universidad_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_universidad_rol ON public.usuarios_universidad(rol_universidad);
CREATE INDEX IF NOT EXISTS idx_usuarios_universidad_activo ON public.usuarios_universidad(activo);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_universidad_auth_unique ON public.usuarios_universidad(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- =====================================================
-- MIGRACIÓN 11: POLÍTICAS RLS PARA PANEL ADMIN
-- =====================================================

-- Función auxiliar para verificar si el usuario es super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
    AND r.codigo = 'super_admin'
    AND ui.activo = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Habilitar RLS en todas las tablas administrativas
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_internos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jornadas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tipos_beneficio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periodos_academicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periodos_comerciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.precios_oferta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beneficios_oferta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imagenes_universidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios_universidad ENABLE ROW LEVEL SECURITY;

-- Políticas para tabla ROLES
DROP POLICY IF EXISTS "solo_super_admin_select_roles" ON public.roles;
CREATE POLICY "solo_super_admin_select_roles" ON public.roles FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_insert_roles" ON public.roles;
CREATE POLICY "solo_super_admin_insert_roles" ON public.roles FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_update_roles" ON public.roles;
CREATE POLICY "solo_super_admin_update_roles" ON public.roles FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_delete_roles" ON public.roles;
CREATE POLICY "solo_super_admin_delete_roles" ON public.roles FOR DELETE TO authenticated USING (public.is_super_admin());

-- Políticas para USUARIOS_INTERNOS
DROP POLICY IF EXISTS "solo_super_admin_select_usuarios_internos" ON public.usuarios_internos;
CREATE POLICY "solo_super_admin_select_usuarios_internos" ON public.usuarios_internos FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_insert_usuarios_internos" ON public.usuarios_internos;
CREATE POLICY "solo_super_admin_insert_usuarios_internos" ON public.usuarios_internos FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_update_usuarios_internos" ON public.usuarios_internos;
CREATE POLICY "solo_super_admin_update_usuarios_internos" ON public.usuarios_internos FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_delete_usuarios_internos" ON public.usuarios_internos;
CREATE POLICY "solo_super_admin_delete_usuarios_internos" ON public.usuarios_internos FOR DELETE TO authenticated USING (public.is_super_admin());

-- Políticas para JORNADAS
DROP POLICY IF EXISTS "solo_super_admin_select_jornadas" ON public.jornadas;
CREATE POLICY "solo_super_admin_select_jornadas" ON public.jornadas FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_insert_jornadas" ON public.jornadas;
CREATE POLICY "solo_super_admin_insert_jornadas" ON public.jornadas FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_update_jornadas" ON public.jornadas;
CREATE POLICY "solo_super_admin_update_jornadas" ON public.jornadas FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_delete_jornadas" ON public.jornadas;
CREATE POLICY "solo_super_admin_delete_jornadas" ON public.jornadas FOR DELETE TO authenticated USING (public.is_super_admin());

-- Políticas para TIPOS_BENEFICIO
DROP POLICY IF EXISTS "solo_super_admin_select_tipos_beneficio" ON public.tipos_beneficio;
CREATE POLICY "solo_super_admin_select_tipos_beneficio" ON public.tipos_beneficio FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_insert_tipos_beneficio" ON public.tipos_beneficio;
CREATE POLICY "solo_super_admin_insert_tipos_beneficio" ON public.tipos_beneficio FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_update_tipos_beneficio" ON public.tipos_beneficio;
CREATE POLICY "solo_super_admin_update_tipos_beneficio" ON public.tipos_beneficio FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_delete_tipos_beneficio" ON public.tipos_beneficio;
CREATE POLICY "solo_super_admin_delete_tipos_beneficio" ON public.tipos_beneficio FOR DELETE TO authenticated USING (public.is_super_admin());

-- Políticas para PERIODOS_ACADEMICOS
DROP POLICY IF EXISTS "solo_super_admin_select_periodos_academicos" ON public.periodos_academicos;
CREATE POLICY "solo_super_admin_select_periodos_academicos" ON public.periodos_academicos FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_insert_periodos_academicos" ON public.periodos_academicos;
CREATE POLICY "solo_super_admin_insert_periodos_academicos" ON public.periodos_academicos FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_update_periodos_academicos" ON public.periodos_academicos;
CREATE POLICY "solo_super_admin_update_periodos_academicos" ON public.periodos_academicos FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_delete_periodos_academicos" ON public.periodos_academicos;
CREATE POLICY "solo_super_admin_delete_periodos_academicos" ON public.periodos_academicos FOR DELETE TO authenticated USING (public.is_super_admin());

-- Políticas para PERIODOS_COMERCIALES
DROP POLICY IF EXISTS "solo_super_admin_select_periodos_comerciales" ON public.periodos_comerciales;
CREATE POLICY "solo_super_admin_select_periodos_comerciales" ON public.periodos_comerciales FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_insert_periodos_comerciales" ON public.periodos_comerciales;
CREATE POLICY "solo_super_admin_insert_periodos_comerciales" ON public.periodos_comerciales FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_update_periodos_comerciales" ON public.periodos_comerciales;
CREATE POLICY "solo_super_admin_update_periodos_comerciales" ON public.periodos_comerciales FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_delete_periodos_comerciales" ON public.periodos_comerciales;
CREATE POLICY "solo_super_admin_delete_periodos_comerciales" ON public.periodos_comerciales FOR DELETE TO authenticated USING (public.is_super_admin());

-- Políticas para PRECIOS_OFERTA
DROP POLICY IF EXISTS "solo_super_admin_select_precios_oferta" ON public.precios_oferta;
CREATE POLICY "solo_super_admin_select_precios_oferta" ON public.precios_oferta FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_insert_precios_oferta" ON public.precios_oferta;
CREATE POLICY "solo_super_admin_insert_precios_oferta" ON public.precios_oferta FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_update_precios_oferta" ON public.precios_oferta;
CREATE POLICY "solo_super_admin_update_precios_oferta" ON public.precios_oferta FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_delete_precios_oferta" ON public.precios_oferta;
CREATE POLICY "solo_super_admin_delete_precios_oferta" ON public.precios_oferta FOR DELETE TO authenticated USING (public.is_super_admin());

-- Políticas para BENEFICIOS_OFERTA
DROP POLICY IF EXISTS "solo_super_admin_select_beneficios_oferta" ON public.beneficios_oferta;
CREATE POLICY "solo_super_admin_select_beneficios_oferta" ON public.beneficios_oferta FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_insert_beneficios_oferta" ON public.beneficios_oferta;
CREATE POLICY "solo_super_admin_insert_beneficios_oferta" ON public.beneficios_oferta FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_update_beneficios_oferta" ON public.beneficios_oferta;
CREATE POLICY "solo_super_admin_update_beneficios_oferta" ON public.beneficios_oferta FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_delete_beneficios_oferta" ON public.beneficios_oferta;
CREATE POLICY "solo_super_admin_delete_beneficios_oferta" ON public.beneficios_oferta FOR DELETE TO authenticated USING (public.is_super_admin());

-- Políticas para IMAGENES_UNIVERSIDAD
DROP POLICY IF EXISTS "solo_super_admin_select_imagenes_universidad" ON public.imagenes_universidad;
CREATE POLICY "solo_super_admin_select_imagenes_universidad" ON public.imagenes_universidad FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_insert_imagenes_universidad" ON public.imagenes_universidad;
CREATE POLICY "solo_super_admin_insert_imagenes_universidad" ON public.imagenes_universidad FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_update_imagenes_universidad" ON public.imagenes_universidad;
CREATE POLICY "solo_super_admin_update_imagenes_universidad" ON public.imagenes_universidad FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_delete_imagenes_universidad" ON public.imagenes_universidad;
CREATE POLICY "solo_super_admin_delete_imagenes_universidad" ON public.imagenes_universidad FOR DELETE TO authenticated USING (public.is_super_admin());

-- Políticas para USUARIOS_UNIVERSIDAD
DROP POLICY IF EXISTS "solo_super_admin_select_usuarios_universidad" ON public.usuarios_universidad;
CREATE POLICY "solo_super_admin_select_usuarios_universidad" ON public.usuarios_universidad FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_insert_usuarios_universidad" ON public.usuarios_universidad;
CREATE POLICY "solo_super_admin_insert_usuarios_universidad" ON public.usuarios_universidad FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_update_usuarios_universidad" ON public.usuarios_universidad;
CREATE POLICY "solo_super_admin_update_usuarios_universidad" ON public.usuarios_universidad FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "solo_super_admin_delete_usuarios_universidad" ON public.usuarios_universidad;
CREATE POLICY "solo_super_admin_delete_usuarios_universidad" ON public.usuarios_universidad FOR DELETE TO authenticated USING (public.is_super_admin());

COMMIT;
```

---

## ✅ Resultado Esperado

Si todo sale bien, verás un mensaje de éxito en el SQL Editor sin errores en rojo.

---

## 👉 Siguiente Paso

Después de ejecutar este SQL, ve al archivo **`INSTRUCCIONES_FINALES.md`** para crear el usuario super_admin.
