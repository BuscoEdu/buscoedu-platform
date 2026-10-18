-- =====================================================
-- BA-035 · Claves de proveedores IA en Supabase Vault
-- Autor: Base de datos BuscoEdu (bot) · 2026-10-18 · E1 Ola 1/4
-- Spec: briefs/e1-ia-multiproveedor.md (A3, A4) + centro-control-wa-spec.md §8.4
--
-- Qué hace:
--   1) proveedores_ia gana columnas de METADATOS de la clave (origen, nombre del
--      secreto en Vault, fechas). Nunca el valor.
--   2) Tabla bitacora_claves_ia: quién guardó/reemplazó/revocó y cuándo (A4).
--   3) Funciones SECURITY DEFINER, ejecutables SOLO por service_role:
--        fn_ia_guardar_clave  → crea o reemplaza el secreto en Vault
--        fn_ia_revocar_clave  → destruye el valor (sobrescribe) y marca revocada
--        fn_ia_leer_clave     → devuelve el valor en claro, SOLO para el servidor
--        fn_ia_estado_clave   → «Configurada ✓ / Falta ✗» sin el valor (para la UI)
-- Para qué: agregar o rotar claves desde el admin SIN redeploy de Vercel, sin
--   que la clave quede en tablas legibles, en respuestas de la API ni en logs.
--
-- Reglas:
--   · Ninguna función devuelve la clave salvo fn_ia_leer_clave (service_role).
--   · Los errores nunca incluyen la clave (no se devuelve SQLERRM).
--   · Sin DELETE físico: revocar = sobrescribir el valor + marcar revocada_en.
--   · El backend llama por RPC parametrizada (nunca SQL armado con la clave).
-- Idempotente: IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS.
-- Deshacer: supabase/ops/20261018_ba035_deshacer.sql
-- =====================================================
BEGIN;

-- -----------------------------------------------------
-- Bloque 0: Vault debe existir (en prod: supabase_vault 0.3.1, verificado 18/10).
-- Si no está, la migración falla aquí y no deja nada a medias.
-- -----------------------------------------------------
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- -----------------------------------------------------
-- Bloque 1: metadatos de la clave en proveedores_ia (nunca el valor).
--   origen_secreto     → 'env' (variable de Vercel, como hoy) o 'vault'.
--   referencia_secreto → nombre de la variable (env) o del secreto en Vault.
--   clave_*_en         → fechas para «Configurada ✓» y la bitácora.
-- Por defecto 'env': los proveedores actuales (Abacus) siguen igual.
-- -----------------------------------------------------
ALTER TABLE public.proveedores_ia
  ADD COLUMN IF NOT EXISTS origen_secreto text NOT NULL DEFAULT 'env',
  ADD COLUMN IF NOT EXISTS referencia_secreto text,
  ADD COLUMN IF NOT EXISTS clave_actualizada_en timestamptz,
  ADD COLUMN IF NOT EXISTS clave_revocada_en timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'proveedores_ia_origen_secreto_check'
      AND conrelid = 'public.proveedores_ia'::regclass
  ) THEN
    ALTER TABLE public.proveedores_ia
      ADD CONSTRAINT proveedores_ia_origen_secreto_check
      CHECK (origen_secreto IN ('env', 'vault'));
  END IF;
END $$;

COMMENT ON COLUMN public.proveedores_ia.origen_secreto IS
  'BA-035. Dónde vive la clave: env (variable Vercel, exige redeploy al rotar) o vault (Supabase Vault, sin redeploy).';
COMMENT ON COLUMN public.proveedores_ia.referencia_secreto IS
  'BA-035. Nombre de la variable (env) o del secreto en Vault. Nunca el valor.';

-- -----------------------------------------------------
-- Bloque 2: bitácora de cambios de clave (A4: quién, cuándo). Sin el valor.
-- Solo inserta la función (SECURITY DEFINER); el cliente no escribe.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bitacora_claves_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id uuid NOT NULL REFERENCES public.proveedores_ia(id),
  accion text NOT NULL CHECK (accion IN ('guardar', 'reemplazar', 'revocar')),
  actor_usuario_id uuid REFERENCES public.usuarios_internos(id),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bitacora_claves_ia_proveedor
  ON public.bitacora_claves_ia (proveedor_id, creado_en DESC);

COMMENT ON TABLE public.bitacora_claves_ia IS
  'BA-035. Historial de guardar/reemplazar/revocar claves IA. Nunca guarda la clave.';

-- RLS: lectura solo super_admin; sin policies de escritura (solo la función escribe).
ALTER TABLE public.bitacora_claves_ia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bitacora_claves_ia_select_super ON public.bitacora_claves_ia;
CREATE POLICY bitacora_claves_ia_select_super ON public.bitacora_claves_ia
  FOR SELECT TO authenticated
  USING (public.is_super_admin());
REVOKE INSERT, UPDATE, DELETE ON public.bitacora_claves_ia FROM anon, authenticated;

-- -----------------------------------------------------
-- Bloque 3: guardar o reemplazar la clave en Vault.
-- Entrada: código del proveedor, clave en claro, usuario interno que actúa
--   (el endpoint ya verificó que es super_admin).
-- Salida: {ok, accion, referencia} — NUNCA la clave.
-- Nombre del secreto: 'ia_proveedor_<codigo>' (estable, uno por proveedor).
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ia_guardar_clave(
  p_proveedor_codigo text,
  p_clave text,
  p_actor_usuario_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_proveedor_id uuid;
  v_nombre text;
  v_secreto_id uuid;
  v_accion text;
  v_clave text := btrim(coalesce(p_clave, ''));
BEGIN
  -- Validaciones mínimas, sin revelar el valor en el error.
  IF length(v_clave) < 8 OR length(v_clave) > 4096 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clave_invalida');
  END IF;

  SELECT id INTO v_proveedor_id
  FROM public.proveedores_ia
  WHERE codigo = p_proveedor_codigo;

  IF v_proveedor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'proveedor_inexistente');
  END IF;

  v_nombre := 'ia_proveedor_' || p_proveedor_codigo;

  -- ¿Ya hay secreto? → reemplazar; si no → crear.
  SELECT id INTO v_secreto_id FROM vault.secrets WHERE name = v_nombre;

  IF v_secreto_id IS NULL THEN
    PERFORM vault.create_secret(v_clave, v_nombre, 'BA-035 clave IA del proveedor ' || p_proveedor_codigo);
    v_accion := 'guardar';
  ELSE
    PERFORM vault.update_secret(v_secreto_id, v_clave);
    v_accion := 'reemplazar';
  END IF;

  -- Metadatos visibles: origen vault, referencia, fecha; se limpia la revocación.
  UPDATE public.proveedores_ia
  SET origen_secreto = 'vault',
      referencia_secreto = v_nombre,
      clave_actualizada_en = now(),
      clave_revocada_en = NULL,
      actualizado_en = now()
  WHERE id = v_proveedor_id;

  INSERT INTO public.bitacora_claves_ia (proveedor_id, accion, actor_usuario_id)
  VALUES (v_proveedor_id, v_accion, p_actor_usuario_id);

  RETURN jsonb_build_object('ok', true, 'accion', v_accion, 'referencia', v_nombre);
EXCEPTION WHEN others THEN
  -- Nunca SQLERRM: podría citar parámetros. Solo el código SQLSTATE.
  RETURN jsonb_build_object('ok', false, 'error', 'error_guardar_clave', 'sqlstate', SQLSTATE);
END;
$$;

-- -----------------------------------------------------
-- Bloque 4: revocar la clave (sin DELETE físico).
-- Sobrescribe el valor en Vault con un aleatorio (la clave real deja de existir),
-- marca clave_revocada_en y registra en bitácora.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ia_revocar_clave(
  p_proveedor_codigo text,
  p_actor_usuario_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_proveedor_id uuid;
  v_secreto_id uuid;
BEGIN
  SELECT id INTO v_proveedor_id
  FROM public.proveedores_ia
  WHERE codigo = p_proveedor_codigo;

  IF v_proveedor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'proveedor_inexistente');
  END IF;

  SELECT id INTO v_secreto_id FROM vault.secrets WHERE name = 'ia_proveedor_' || p_proveedor_codigo;

  IF v_secreto_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_clave_en_vault');
  END IF;

  PERFORM vault.update_secret(v_secreto_id, 'revocada:' || gen_random_uuid()::text);

  UPDATE public.proveedores_ia
  SET clave_revocada_en = now(),
      actualizado_en = now()
  WHERE id = v_proveedor_id;

  INSERT INTO public.bitacora_claves_ia (proveedor_id, accion, actor_usuario_id)
  VALUES (v_proveedor_id, 'revocar', p_actor_usuario_id);

  RETURN jsonb_build_object('ok', true, 'accion', 'revocar');
EXCEPTION WHEN others THEN
  RETURN jsonb_build_object('ok', false, 'error', 'error_revocar_clave', 'sqlstate', SQLSTATE);
END;
$$;

-- -----------------------------------------------------
-- Bloque 5: leer la clave en claro — SOLO servidor (service_role).
-- Devuelve NULL si el proveedor no usa vault, no hay secreto o está revocada.
-- El backend la usa en memoria para llamar al proveedor; nunca la registra.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ia_leer_clave(p_proveedor_codigo text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_clave text;
BEGIN
  SELECT ds.decrypted_secret INTO v_clave
  FROM public.proveedores_ia p
  JOIN vault.decrypted_secrets ds ON ds.name = p.referencia_secreto
  WHERE p.codigo = p_proveedor_codigo
    AND p.origen_secreto = 'vault'
    AND p.clave_revocada_en IS NULL;

  RETURN v_clave;
END;
$$;

-- -----------------------------------------------------
-- Bloque 6: estado de la clave para la UI («Configurada ✓ / Falta ✗»).
-- Sin el valor. Se expone vía endpoint server-side (super_admin).
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ia_estado_clave(p_proveedor_codigo text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT CASE WHEN p.id IS NULL THEN
           jsonb_build_object('ok', false, 'error', 'proveedor_inexistente')
         ELSE jsonb_build_object(
           'ok', true,
           'origen', p.origen_secreto,
           'configurada', CASE
              -- env: hoy el nombre de la variable vive en despliegues_ia.referencia_secreto
              -- (el valor está en Vercel; la BD no puede comprobarlo, solo que hay nombre).
              WHEN p.origen_secreto = 'env' THEN coalesce(p.referencia_secreto IS NOT NULL, false)
                   OR EXISTS (SELECT 1 FROM public.despliegues_ia d
                              WHERE d.proveedor_id = p.id AND d.referencia_secreto IS NOT NULL)
              ELSE p.clave_revocada_en IS NULL
                   AND EXISTS (SELECT 1 FROM vault.secrets s WHERE s.name = p.referencia_secreto)
            END,
           'actualizada_en', p.clave_actualizada_en,
           'revocada_en', p.clave_revocada_en)
         END
  FROM (SELECT 1) x
  LEFT JOIN public.proveedores_ia p ON p.codigo = p_proveedor_codigo;
$$;

-- -----------------------------------------------------
-- Bloque 7: permisos. Por defecto Postgres da EXECUTE a PUBLIC: se quita a
-- todos y se da solo a service_role. anon/authenticated → «permission denied».
-- -----------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_ia_guardar_clave(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ia_revocar_clave(text, uuid)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ia_leer_clave(text)               FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ia_estado_clave(text)             FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_ia_guardar_clave(text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ia_revocar_clave(text, uuid)      TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ia_leer_clave(text)               TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ia_estado_clave(text)             TO service_role;

COMMENT ON FUNCTION public.fn_ia_guardar_clave(text, text, uuid) IS 'BA-035. Guarda/reemplaza la clave IA en Vault. Solo service_role. Nunca devuelve la clave.';
COMMENT ON FUNCTION public.fn_ia_revocar_clave(text, uuid) IS 'BA-035. Revoca: sobrescribe el valor en Vault y marca revocada. Sin DELETE físico. Solo service_role.';
COMMENT ON FUNCTION public.fn_ia_leer_clave(text) IS 'BA-035. Devuelve la clave en claro SOLO al servidor (service_role). Nunca exponer por API ni loguear.';
COMMENT ON FUNCTION public.fn_ia_estado_clave(text) IS 'BA-035. Configurada ✓/Falta ✗ sin el valor. Solo service_role.';

COMMIT;
