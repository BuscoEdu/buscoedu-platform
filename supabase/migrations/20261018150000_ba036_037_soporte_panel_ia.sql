-- =====================================================
-- BA-036 / BA-037 / BA-038 · Soporte de BD para el panel de IA (N1–N8 de Backend)
-- Autor: Base de datos BuscoEdu (bot) · 2026-10-18 · E1 Ola 3/4
-- Spec: briefs/e1-ia-multiproveedor.md (A2, A4, A6–A8, B1, B4, C1, D5)
--       + docs/backend/README-e1-api.md §Necesidades de BD (824ac4d)
--
-- Qué hace (y para qué):
--   N1 pruebas_conexion_ia ........ cada «Probar conexión» queda guardada (A6/A7/B1)
--   N2 config_actualizada_en ...... marca que invalida una prueba cuando cambia modelo/URL (A7)
--      + fn_ia_prueba_vigente / fn_ia_modelo_disponible (reglas de «prueba vigente»)
--   N3 bitacora_config_ia ......... quién cambió qué en proveedores/modelos/versiones (C1, A4)
--   N4 fn_ia_cambiar_interruptor .. encender/apagar + bitácora en una sola transacción (C1)
--   N5 fn_ia_restaurar_version .... volver a una versión anterior en una sola transacción (B4)
--   N6 proveedores_ia + preset_codigo, tipo_adaptador, url_base, asistente_paso/borrador (A2, A8)
--   N7 alertas_gasto_ia.vista_por + fn_ia_marcar_alerta_vista (D5)
--   N8 canal 'panel': NO se crea en canales_ia (ver Bloque 8)
--
-- Reglas: sin DELETE físico; bitácoras solo de inserción; ningún jsonb puede llevar
--   claves (CHECK sobre nombres prohibidos); escribe solo el servidor (service_role);
--   lee solo super_admin. Errores = código, sin SQLERRM.
-- Idempotente: IF NOT EXISTS, CREATE OR REPLACE, DROP … IF EXISTS antes de CREATE.
-- NO aplicada en prod. Deshacer: supabase/ops/20261018_ba036_037_deshacer.sql
-- =====================================================
BEGIN;

-- -----------------------------------------------------
-- Bloque 1 (N1): pruebas de conexión.
-- Para qué: saber si un modelo respondió, cuándo, con qué latencia y, si falló, por qué
-- (código de motivo para el texto en español del panel). Solo inserción.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pruebas_conexion_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  despliegue_id uuid NOT NULL REFERENCES public.despliegues_ia(id),
  proveedor_id uuid NOT NULL REFERENCES public.proveedores_ia(id),
  exitosa boolean NOT NULL,
  latencia_ms integer CHECK (latencia_ms IS NULL OR latencia_ms >= 0),
  modelo_respondio text,
  motivo_codigo text CHECK (motivo_codigo IS NULL OR motivo_codigo IN (
    'timeout', 'limite_tasa', 'autenticacion', 'sin_saldo', 'contexto_excedido',
    'politica_contenido', 'servidor', 'respuesta_invalida', 'sin_clave',
    'proveedor_no_permitido', 'proveedor_inactivo')),
  actor_usuario_id uuid REFERENCES public.usuarios_internos(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  -- Una prueba exitosa no lleva motivo de error.
  CONSTRAINT pruebas_conexion_ia_motivo_check CHECK (NOT (exitosa AND motivo_codigo IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_pruebas_conexion_ia_despliegue
  ON public.pruebas_conexion_ia (despliegue_id, creado_en DESC);

COMMENT ON TABLE public.pruebas_conexion_ia IS
  'BA-036 A6/A7. Resultado de cada «Probar conexión» por modelo: éxito, latencia, modelo que respondió y motivo. Sin claves ni textos. Solo inserción.';

-- -----------------------------------------------------
-- Bloque 2 (N2): marcas de cambio de configuración.
-- Para qué: una prueba deja de valer si después cambió el modelo/URL/parámetros
-- (despliegue), la URL del proveedor o la clave. Backend actualiza estas marcas
-- solo en esos cambios (no al encender/apagar).
-- -----------------------------------------------------
ALTER TABLE public.despliegues_ia
  ADD COLUMN IF NOT EXISTS config_actualizada_en timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.proveedores_ia
  ADD COLUMN IF NOT EXISTS config_actualizada_en timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.despliegues_ia.config_actualizada_en IS 'BA-036 A7. Último cambio de modelo, URL o parámetros de conexión. Invalida pruebas anteriores.';
COMMENT ON COLUMN public.proveedores_ia.config_actualizada_en IS 'BA-036 A7. Último cambio de url_base. Invalida pruebas anteriores.';

-- -----------------------------------------------------
-- Bloque 3 (N6): datos del asistente y de conexión del proveedor.
-- Para qué: el asistente «Agregar proveedor» retoma donde iba (A8) en cualquier
-- dispositivo y la ficha muestra preset, adaptador y URL. El borrador jamás guarda claves.
-- -----------------------------------------------------
ALTER TABLE public.proveedores_ia
  ADD COLUMN IF NOT EXISTS preset_codigo text,
  ADD COLUMN IF NOT EXISTS tipo_adaptador text,
  ADD COLUMN IF NOT EXISTS url_base text,
  ADD COLUMN IF NOT EXISTS asistente_paso smallint,
  ADD COLUMN IF NOT EXISTS asistente_borrador jsonb;

-- 3b: restricciones (se crean una sola vez).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proveedores_ia_preset_check') THEN
    ALTER TABLE public.proveedores_ia ADD CONSTRAINT proveedores_ia_preset_check CHECK (preset_codigo IS NULL OR preset_codigo IN
      ('abacus_ai', 'openai', 'xai', 'anthropic', 'google', 'openrouter', 'otro_compatible'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proveedores_ia_tipo_adaptador_check') THEN
    ALTER TABLE public.proveedores_ia ADD CONSTRAINT proveedores_ia_tipo_adaptador_check CHECK (tipo_adaptador IS NULL OR tipo_adaptador IN
      ('abacus', 'openai', 'xai', 'anthropic', 'google', 'openai_compatible'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proveedores_ia_url_base_check') THEN
    ALTER TABLE public.proveedores_ia ADD CONSTRAINT proveedores_ia_url_base_check CHECK (url_base IS NULL OR url_base LIKE 'https://%');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proveedores_ia_asistente_paso_check') THEN
    ALTER TABLE public.proveedores_ia ADD CONSTRAINT proveedores_ia_asistente_paso_check CHECK (asistente_paso IS NULL OR asistente_paso BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proveedores_ia_borrador_sin_secretos_check') THEN
    ALTER TABLE public.proveedores_ia ADD CONSTRAINT proveedores_ia_borrador_sin_secretos_check
      CHECK (NOT (coalesce(asistente_borrador, '{}'::jsonb) ?| ARRAY['clave', 'api_key', 'token', 'secret', 'password']));
  END IF;
END $$;

-- 3c: backfill del proveedor que ya existe en prod (solo si está vacío).
UPDATE public.proveedores_ia
SET preset_codigo = coalesce(preset_codigo, 'abacus_ai'),
    tipo_adaptador = coalesce(tipo_adaptador, 'abacus')
WHERE codigo = 'abacus_ai' AND (preset_codigo IS NULL OR tipo_adaptador IS NULL);

COMMENT ON COLUMN public.proveedores_ia.asistente_borrador IS 'BA-036 A8. Avance del asistente (sin claves: CHECK de nombres prohibidos en el primer nivel).';

-- -----------------------------------------------------
-- Bloque 4 (N3): bitácora de configuración IA.
-- Para qué: la ficha muestra quién creó, editó, encendió, apagó, archivó, asignó
-- modelo o restauró, con valor anterior → nuevo y el impacto que vio el admin.
-- Solo inserción; los jsonb no admiten nombres de campo de secretos.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bitacora_config_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidad text NOT NULL CHECK (entidad IN ('proveedor', 'despliegue', 'version')),
  entidad_id uuid NOT NULL,
  accion text NOT NULL CHECK (accion IN ('crear', 'editar', 'encender', 'apagar', 'archivar', 'asignar_modelo', 'restaurar')),
  valor_anterior jsonb,
  valor_nuevo jsonb,
  impacto jsonb,
  nota text,
  actor_usuario_id uuid REFERENCES public.usuarios_internos(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bitacora_config_ia_sin_secretos_check CHECK (
    NOT (coalesce(valor_anterior, '{}'::jsonb) ?| ARRAY['clave', 'api_key', 'token', 'secret', 'password'])
    AND NOT (coalesce(valor_nuevo, '{}'::jsonb) ?| ARRAY['clave', 'api_key', 'token', 'secret', 'password']))
);

CREATE INDEX IF NOT EXISTS idx_bitacora_config_ia_entidad
  ON public.bitacora_config_ia (entidad, entidad_id, creado_en DESC);

COMMENT ON TABLE public.bitacora_config_ia IS
  'BA-036/037 C1, A4. Historial de cambios de proveedores, modelos y versiones de agente. Sin secretos. Solo inserción.';

-- -----------------------------------------------------
-- Bloque 5 (N7): quién marcó vista una alerta de gasto.
-- -----------------------------------------------------
ALTER TABLE public.alertas_gasto_ia
  ADD COLUMN IF NOT EXISTS vista_por uuid REFERENCES public.usuarios_internos(id);

-- -----------------------------------------------------
-- Bloque 6: RLS de las tablas nuevas + bloqueo de UPDATE/DELETE (solo inserción).
-- Para qué: lectura solo super_admin; el cliente no escribe; ni service_role puede
-- reescribir o borrar la historia (trigger que lo rechaza).
-- -----------------------------------------------------
ALTER TABLE public.pruebas_conexion_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bitacora_config_ia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pruebas_conexion_ia_select_super ON public.pruebas_conexion_ia;
CREATE POLICY pruebas_conexion_ia_select_super ON public.pruebas_conexion_ia
  FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS bitacora_config_ia_select_super ON public.bitacora_config_ia;
CREATE POLICY bitacora_config_ia_select_super ON public.bitacora_config_ia
  FOR SELECT TO authenticated USING (public.is_super_admin());

REVOKE INSERT, UPDATE, DELETE ON public.pruebas_conexion_ia, public.bitacora_config_ia FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_ia_solo_insercion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'solo_insercion: % no admite % (historial inmutable)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS trg_pruebas_conexion_ia_solo_insercion ON public.pruebas_conexion_ia;
CREATE TRIGGER trg_pruebas_conexion_ia_solo_insercion
  BEFORE UPDATE OR DELETE ON public.pruebas_conexion_ia
  FOR EACH ROW EXECUTE FUNCTION public.fn_ia_solo_insercion();
DROP TRIGGER IF EXISTS trg_bitacora_config_ia_solo_insercion ON public.bitacora_config_ia;
CREATE TRIGGER trg_bitacora_config_ia_solo_insercion
  BEFORE UPDATE OR DELETE ON public.bitacora_config_ia
  FOR EACH ROW EXECUTE FUNCTION public.fn_ia_solo_insercion();

-- -----------------------------------------------------
-- Bloque 7 (N2): fn_ia_prueba_vigente y fn_ia_modelo_disponible.
-- Para qué: una sola regla en BD para «prueba vigente» (A7) y «modelo disponible» (B1).
--   prueba vigente = la ÚLTIMA prueba del modelo es exitosa
--     y es posterior a config_actualizada_en del modelo y del proveedor
--     y a clave_actualizada_en, y la clave no está revocada.
--   disponible = prueba vigente + modelo y proveedor encendidos (estado 'activo' y activo).
-- Se separan porque antes de encender (A7) se exige prueba vigente sin estar encendido.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ia_prueba_vigente(p_despliegue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT u.exitosa
           AND u.creado_en > d.config_actualizada_en
           AND u.creado_en > p.config_actualizada_en
           AND u.creado_en > coalesce(p.clave_actualizada_en, '-infinity'::timestamptz)
           AND p.clave_revocada_en IS NULL
    FROM public.despliegues_ia d
    JOIN public.proveedores_ia p ON p.id = d.proveedor_id
    JOIN LATERAL (
      SELECT pc.exitosa, pc.creado_en FROM public.pruebas_conexion_ia pc
      WHERE pc.despliegue_id = d.id ORDER BY pc.creado_en DESC LIMIT 1
    ) u ON true
    WHERE d.id = p_despliegue_id
  ), false);
$$;

CREATE OR REPLACE FUNCTION public.fn_ia_modelo_disponible(p_despliegue_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT d.estado = 'activo' AND d.activo AND p.estado = 'activo' AND p.activo
    FROM public.despliegues_ia d JOIN public.proveedores_ia p ON p.id = d.proveedor_id
    WHERE d.id = p_despliegue_id
  ), false) AND public.fn_ia_prueba_vigente(p_despliegue_id);
$$;

-- -----------------------------------------------------
-- Bloque 8 (N8): canal 'panel'.
-- Decisión: NO se inserta en canales_ia. registros_costo_ia.canal_codigo es texto libre,
-- así que las pruebas del panel se registran con 'panel' sin fila; el motor sigue
-- rechazando 'panel' como canal de conversación (F1), y fn_ia_gasto_hoy('panel')
-- responde canal_inexistente (no se le aplica tope de estudiantes). Si un día se crea,
-- debe ir con activo = false. (Sin SQL en este bloque.)
-- -----------------------------------------------------

-- -----------------------------------------------------
-- Bloque 9 (N4): fn_ia_cambiar_interruptor.
-- Para qué: encender/apagar un proveedor o un modelo y dejar la bitácora (con el
-- impacto que vio el admin) en la MISMA transacción. No valida la prueba (Backend).
-- Archivado no se enciende ni se apaga.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ia_cambiar_interruptor(
  p_tipo text,
  p_id uuid,
  p_encender boolean,
  p_impacto jsonb,
  p_actor_usuario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado text;
  v_nuevo text := CASE WHEN p_encender THEN 'activo' ELSE 'inactivo' END;
BEGIN
  -- 9.1 Validar entradas.
  IF p_tipo NOT IN ('proveedor', 'despliegue') OR p_id IS NULL OR p_encender IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'datos_invalidos');
  END IF;

  -- 9.2 Leer y bloquear la fila.
  IF p_tipo = 'proveedor' THEN
    SELECT estado INTO v_estado FROM public.proveedores_ia WHERE id = p_id FOR UPDATE;
  ELSE
    SELECT estado INTO v_estado FROM public.despliegues_ia WHERE id = p_id FOR UPDATE;
  END IF;
  IF v_estado IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_encontrado');
  END IF;
  IF v_estado = 'archivado' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'archivado');
  END IF;
  IF v_estado = v_nuevo THEN
    RETURN jsonb_build_object('ok', true, 'sin_cambios', true, 'estado_anterior', v_estado, 'estado_nuevo', v_nuevo);
  END IF;

  -- 9.3 Cambiar estado + bitácora (misma transacción).
  IF p_tipo = 'proveedor' THEN
    UPDATE public.proveedores_ia SET estado = v_nuevo, actualizado_en = now() WHERE id = p_id;
  ELSE
    UPDATE public.despliegues_ia SET estado = v_nuevo, actualizado_en = now() WHERE id = p_id;
  END IF;

  INSERT INTO public.bitacora_config_ia (entidad, entidad_id, accion, valor_anterior, valor_nuevo, impacto, actor_usuario_id)
  VALUES (p_tipo, p_id, CASE WHEN p_encender THEN 'encender' ELSE 'apagar' END,
          jsonb_build_object('estado', v_estado), jsonb_build_object('estado', v_nuevo), p_impacto, p_actor_usuario_id);

  RETURN jsonb_build_object('ok', true, 'sin_cambios', false, 'estado_anterior', v_estado, 'estado_nuevo', v_nuevo);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', 'error_interno', 'sqlstate', SQLSTATE);
END;
$$;

-- -----------------------------------------------------
-- Bloque 10 (N5): fn_ia_restaurar_version.
-- Para qué: volver a una versión que ya estuvo publicada, sin dejar al agente a medias:
-- desactiva la publicada actual, publica la elegida, apunta agentes_ia.version_activa_id
-- y deja la bitácora, todo o nada.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ia_restaurar_version(
  p_version_id uuid,
  p_nota text,
  p_actor_usuario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ver public.versiones_agente_ia%ROWTYPE;
  v_activa uuid;
BEGIN
  -- 10.1 Versión y agente (bloqueados para evitar dos restauraciones a la vez).
  SELECT * INTO v_ver FROM public.versiones_agente_ia WHERE id = p_version_id FOR UPDATE;
  IF v_ver.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_encontrado');
  END IF;
  SELECT version_activa_id INTO v_activa FROM public.agentes_ia WHERE id = v_ver.agente_id FOR UPDATE;
  IF v_activa = v_ver.id AND v_ver.estado = 'publicada' THEN
    RETURN jsonb_build_object('ok', true, 'sin_cambios', true);
  END IF;
  IF v_ver.estado <> 'desactivada' OR v_ver.publicada_en IS NULL OR NOT v_ver.activo THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_restaurable');
  END IF;

  -- 10.2 Desactivar la(s) publicada(s) del agente.
  UPDATE public.versiones_agente_ia
  SET estado = 'desactivada', desactivada_en = now(), actualizado_en = now()
  WHERE agente_id = v_ver.agente_id AND estado = 'publicada' AND id <> v_ver.id;

  -- 10.3 Publicar la elegida y apuntar el agente.
  UPDATE public.versiones_agente_ia
  SET estado = 'publicada', publicada_en = now(), desactivada_en = NULL, actualizado_en = now()
  WHERE id = v_ver.id;
  UPDATE public.agentes_ia
  SET version_activa_id = v_ver.id, actualizado_en = now(), actualizado_por = p_actor_usuario_id
  WHERE id = v_ver.agente_id;

  -- 10.4 Bitácora.
  INSERT INTO public.bitacora_config_ia (entidad, entidad_id, accion, valor_anterior, valor_nuevo, nota, actor_usuario_id)
  VALUES ('version', v_ver.id, 'restaurar',
          jsonb_build_object('version_activa_id', v_activa),
          jsonb_build_object('version_activa_id', v_ver.id, 'numero_version', v_ver.numero_version),
          p_nota, p_actor_usuario_id);

  RETURN jsonb_build_object('ok', true, 'sin_cambios', false, 'version_anterior_id', v_activa, 'version_activa_id', v_ver.id);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', 'error_interno', 'sqlstate', SQLSTATE);
END;
$$;

-- -----------------------------------------------------
-- Bloque 11 (N7): fn_ia_marcar_alerta_vista. Idempotente: la primera vez guarda
-- quién y cuándo; las siguientes no cambian nada.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ia_marcar_alerta_vista(p_alerta_id uuid, p_actor_usuario_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vista timestamptz;
  v_existe boolean;
BEGIN
  SELECT true, vista_en INTO v_existe, v_vista FROM public.alertas_gasto_ia WHERE id = p_alerta_id FOR UPDATE;
  IF v_existe IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_encontrado');
  END IF;
  IF v_vista IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'sin_cambios', true, 'vista_en', v_vista);
  END IF;
  UPDATE public.alertas_gasto_ia SET vista_en = now(), vista_por = p_actor_usuario_id
  WHERE id = p_alerta_id RETURNING vista_en INTO v_vista;
  RETURN jsonb_build_object('ok', true, 'sin_cambios', false, 'vista_en', v_vista);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', 'error_interno', 'sqlstate', SQLSTATE);
END;
$$;

-- -----------------------------------------------------
-- Bloque 12: permisos. Solo el servidor (service_role) ejecuta las funciones.
-- -----------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_ia_solo_insercion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ia_prueba_vigente(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ia_modelo_disponible(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ia_cambiar_interruptor(text, uuid, boolean, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ia_restaurar_version(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ia_marcar_alerta_vista(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ia_prueba_vigente(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ia_modelo_disponible(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ia_cambiar_interruptor(text, uuid, boolean, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ia_restaurar_version(uuid, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ia_marcar_alerta_vista(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.fn_ia_prueba_vigente(uuid) IS 'BA-036 A7. true si la última prueba es exitosa y posterior a cambios de modelo/URL/clave, y la clave no está revocada. Solo service_role.';
COMMENT ON FUNCTION public.fn_ia_modelo_disponible(uuid) IS 'BA-037 B1. Prueba vigente + modelo y proveedor encendidos. Solo service_role.';
COMMENT ON FUNCTION public.fn_ia_cambiar_interruptor(text, uuid, boolean, jsonb, uuid) IS 'BA-036 C1. Enciende/apaga proveedor o modelo + bitácora en una transacción. Solo service_role.';
COMMENT ON FUNCTION public.fn_ia_restaurar_version(uuid, text, uuid) IS 'BA-037 B4. Restaura una versión desactivada (antes publicada) + bitácora en una transacción. Solo service_role.';
COMMENT ON FUNCTION public.fn_ia_marcar_alerta_vista(uuid, uuid) IS 'BA-038 D5. Marca una alerta como vista (quién y cuándo), idempotente. Solo service_role.';

COMMIT;
