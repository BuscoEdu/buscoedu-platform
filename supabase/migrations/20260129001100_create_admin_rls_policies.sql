-- =============================================================
-- Migración: Políticas RLS para panel de administración (solo super_admin)
-- Archivo: 20260129001100_create_admin_rls_policies.sql
--
-- Objetivo:
--   Restringir SELECT/INSERT/UPDATE/DELETE en tablas internas del panel
--   para que únicamente usuarios autenticados con rol super_admin
--   (definido en usuarios_internos -> roles.codigo) puedan operar.
--
-- Nota técnica:
--   - SELECT y DELETE usan cláusula USING.
--   - INSERT usa cláusula WITH CHECK.
--   - UPDATE usa BOTH: USING + WITH CHECK.
-- =============================================================

-- -------------------------------------------------------------
-- 1) Tabla: roles
-- -------------------------------------------------------------
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solo_super_admin_select_roles"
ON public.roles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_insert_roles"
ON public.roles
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_update_roles"
ON public.roles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_delete_roles"
ON public.roles
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

-- -------------------------------------------------------------
-- 2) Tabla: usuarios_internos
-- -------------------------------------------------------------
ALTER TABLE public.usuarios_internos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solo_super_admin_select_usuarios_internos"
ON public.usuarios_internos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_insert_usuarios_internos"
ON public.usuarios_internos
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_update_usuarios_internos"
ON public.usuarios_internos
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_delete_usuarios_internos"
ON public.usuarios_internos
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

-- -------------------------------------------------------------
-- 3) Tabla: jornadas
-- -------------------------------------------------------------
ALTER TABLE public.jornadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solo_super_admin_select_jornadas"
ON public.jornadas
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_insert_jornadas"
ON public.jornadas
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_update_jornadas"
ON public.jornadas
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_delete_jornadas"
ON public.jornadas
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

-- -------------------------------------------------------------
-- 4) Tabla: tipos_beneficio
-- -------------------------------------------------------------
ALTER TABLE public.tipos_beneficio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solo_super_admin_select_tipos_beneficio"
ON public.tipos_beneficio
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_insert_tipos_beneficio"
ON public.tipos_beneficio
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_update_tipos_beneficio"
ON public.tipos_beneficio
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_delete_tipos_beneficio"
ON public.tipos_beneficio
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

-- -------------------------------------------------------------
-- 5) Tabla: periodos_academicos
-- -------------------------------------------------------------
ALTER TABLE public.periodos_academicos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solo_super_admin_select_periodos_academicos"
ON public.periodos_academicos
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_insert_periodos_academicos"
ON public.periodos_academicos
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_update_periodos_academicos"
ON public.periodos_academicos
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_delete_periodos_academicos"
ON public.periodos_academicos
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

-- -------------------------------------------------------------
-- 6) Tabla: periodos_comerciales
-- -------------------------------------------------------------
ALTER TABLE public.periodos_comerciales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solo_super_admin_select_periodos_comerciales"
ON public.periodos_comerciales
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_insert_periodos_comerciales"
ON public.periodos_comerciales
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_update_periodos_comerciales"
ON public.periodos_comerciales
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_delete_periodos_comerciales"
ON public.periodos_comerciales
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

-- -------------------------------------------------------------
-- 7) Tabla: precios_oferta
-- -------------------------------------------------------------
ALTER TABLE public.precios_oferta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solo_super_admin_select_precios_oferta"
ON public.precios_oferta
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_insert_precios_oferta"
ON public.precios_oferta
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_update_precios_oferta"
ON public.precios_oferta
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_delete_precios_oferta"
ON public.precios_oferta
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

-- -------------------------------------------------------------
-- 8) Tabla: beneficios_oferta
-- -------------------------------------------------------------
ALTER TABLE public.beneficios_oferta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solo_super_admin_select_beneficios_oferta"
ON public.beneficios_oferta
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_insert_beneficios_oferta"
ON public.beneficios_oferta
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_update_beneficios_oferta"
ON public.beneficios_oferta
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_delete_beneficios_oferta"
ON public.beneficios_oferta
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

-- -------------------------------------------------------------
-- 9) Tabla: imagenes_universidad
-- -------------------------------------------------------------
ALTER TABLE public.imagenes_universidad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solo_super_admin_select_imagenes_universidad"
ON public.imagenes_universidad
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_insert_imagenes_universidad"
ON public.imagenes_universidad
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_update_imagenes_universidad"
ON public.imagenes_universidad
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_delete_imagenes_universidad"
ON public.imagenes_universidad
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

-- -------------------------------------------------------------
-- 10) Tabla: usuarios_universidad
-- -------------------------------------------------------------
ALTER TABLE public.usuarios_universidad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solo_super_admin_select_usuarios_universidad"
ON public.usuarios_universidad
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_insert_usuarios_universidad"
ON public.usuarios_universidad
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_update_usuarios_universidad"
ON public.usuarios_universidad
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);

CREATE POLICY "solo_super_admin_delete_usuarios_universidad"
ON public.usuarios_universidad
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.usuarios_internos ui
    JOIN public.roles r ON ui.rol_id = r.id
    WHERE ui.auth_user_id = auth.uid()
      AND r.codigo = 'super_admin'
      AND ui.activo = true
  )
);
