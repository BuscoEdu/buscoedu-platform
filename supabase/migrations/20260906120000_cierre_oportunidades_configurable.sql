-- =====================================================================
-- BUSCOEDU · SISTEMA DE CIERRE DE OPORTUNIDADES (Ganada / Perdida)
-- CONFIGURABLE DESDE CRUD  ·  migración 2026-09-06
-- =====================================================================
-- OBJETIVO (según prompt de negocio):
--   - Permitir marcar una oportunidad como GANADA o PERDIDA desde CUALQUIER
--     etapa del embudo. El cierre mueve la oportunidad a la etapa "Cerrada"
--     con subestado "Ganada" o "Perdida" (Cerrada = agrupadora histórica).
--   - Los REQUISITOS de Ganada, las CAUSAS de Perdida y las REGLAS de
--     Desaparecido se administran desde un CRUD (no quedan quemados en código).
--   - Cada cierre y cada reapertura quedan en una AUDITORÍA inmutable con la
--     versión de configuración usada.
--   - Nada se borra físicamente (soft delete: activo=false). No se duplican
--     tablas existentes: se reutilizan oportunidades, etapas_embudo,
--     subestados_oportunidad e historial_etapas_oportunidad.
--
-- Esta migración es IDEMPOTENTE (se puede correr varias veces sin romper).
--
-- ---------------------------------------------------------------------
-- DIAGNÓSTICO PREVIO (opcional, ejecutar a mano ANTES si se desea):
--   -- ¿Existen las funciones auxiliares esperadas?
--   SELECT proname FROM pg_proc
--    WHERE proname IN ('is_super_admin','usuario_interno_id',
--                      'puede_ver_oportunidad','es_asesor_o_super');
--   -- ¿Qué etapas hay hoy?
--   SELECT nombre, orden, es_etapa_final_ganada, es_etapa_final_perdida, activo
--     FROM public.etapas_embudo ORDER BY orden;
-- ---------------------------------------------------------------------

BEGIN;

-- =====================================================================
-- 1.1 · COLUMNAS NUEVAS EN oportunidades
-- ---------------------------------------------------------------------
-- Se reutilizan las columnas ya existentes de migraciones previas:
--   fecha_cierre, causa_perdida (texto legado), razon_perdida,
--   funnel_version_id, fecha_validacion_pago_inscripcion.
-- Aquí se añaden SOLO las columnas específicas del nuevo flujo de cierre.
-- =====================================================================
ALTER TABLE public.oportunidades
  ADD COLUMN IF NOT EXISTS cierre_tipo             text,       -- 'ganada' | 'perdida'
  ADD COLUMN IF NOT EXISTS cierre_por              uuid REFERENCES public.usuarios_internos(id),
  ADD COLUMN IF NOT EXISTS cierre_por_tipo         text,       -- 'asesor' | 'super_admin' | 'universidad' | 'ia' | 'sistema'
  ADD COLUMN IF NOT EXISTS cierre_canal            text,       -- 'leadcenter' | 'whatsapp' | 'web' | 'ia' ...
  ADD COLUMN IF NOT EXISTS cierre_causa_id         uuid,       -- FK -> causas_perdida (solo si perdida)
  ADD COLUMN IF NOT EXISTS cierre_comentario       text,
  ADD COLUMN IF NOT EXISTS cierre_config_version   integer,    -- versión de reglas aplicada
  ADD COLUMN IF NOT EXISTS reabierta_en            timestamptz,
  ADD COLUMN IF NOT EXISTS reabierta_por           uuid REFERENCES public.usuarios_internos(id),
  ADD COLUMN IF NOT EXISTS reabierta_motivo        text;

COMMENT ON COLUMN public.oportunidades.cierre_tipo IS 'Tipo de cierre vigente: ganada | perdida (NULL si no está cerrada).';
COMMENT ON COLUMN public.oportunidades.cierre_causa_id IS 'Causa de pérdida seleccionada (FK a causas_perdida) cuando cierre_tipo = perdida.';
COMMENT ON COLUMN public.oportunidades.cierre_config_version IS 'Versión de la configuración de reglas usada al cerrar (trazabilidad).';

-- =====================================================================
-- 1.2 · CATÁLOGO CRUD DE CAUSAS DE PÉRDIDA
-- ---------------------------------------------------------------------
-- Editable desde el panel admin: crear / editar / activar-desactivar /
-- reordenar. Nunca se borra físicamente (activo=false).
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.causas_perdida (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre              text NOT NULL,
  detalle             text,
  orden               integer NOT NULL DEFAULT 100,
  activo              boolean NOT NULL DEFAULT true,
  requiere_comentario boolean NOT NULL DEFAULT true,  -- ¿exige explicación al asesor?
  permite_asesor      boolean NOT NULL DEFAULT true,  -- ¿la pueden usar asesores?
  permite_universidad boolean NOT NULL DEFAULT true,  -- ¿la pueden usar universidades?
  permite_ia          boolean NOT NULL DEFAULT false, -- ¿la puede usar la IA?
  creado_en           timestamptz NOT NULL DEFAULT now(),
  actualizado_en      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.causas_perdida IS 'Catálogo configurable de causas de pérdida (CRUD). Soft delete vía activo=false.';

-- FK diferida de oportunidades.cierre_causa_id -> causas_perdida.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'oportunidades_cierre_causa_id_fkey'
  ) THEN
    ALTER TABLE public.oportunidades
      ADD CONSTRAINT oportunidades_cierre_causa_id_fkey
      FOREIGN KEY (cierre_causa_id) REFERENCES public.causas_perdida(id);
  END IF;
END$$;

-- Semilla inicial de causas (solo si la tabla está vacía).
INSERT INTO public.causas_perdida (nombre, detalle, orden, requiere_comentario, permite_ia)
SELECT * FROM (VALUES
  ('Precio',                  'La persona considera el precio demasiado alto',        10, true,  true),
  ('Competencia',             'Eligió otra institución u opción competidora',         20, true,  true),
  ('Ilocalizable',            'No se logró contactar tras los intentos definidos',    30, false, true),
  ('No interesado',           'La persona manifiesta que ya no está interesada',      40, true,  true),
  ('Requisitos no cumplidos', 'No cumple requisitos de acceso al programa',           50, true,  false),
  ('Otro',                    'Otra causa no listada (requiere explicación)',         60, true,  false)
) AS s(nombre, detalle, orden, requiere_comentario, permite_ia)
WHERE NOT EXISTS (SELECT 1 FROM public.causas_perdida);

-- =====================================================================
-- 1.3 · REGLAS DE CIERRE GANADA (versionadas, editables por CRUD)
-- ---------------------------------------------------------------------
-- Cada requisito puede valer: 'obligatorio' | 'opcional' | 'no_utilizado'.
-- Solo una fila activa a la vez (la de mayor versión activa).
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.reglas_cierre_ganada (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version                   integer NOT NULL DEFAULT 1,
  activo                    boolean NOT NULL DEFAULT true,
  -- Requisitos parametrizables (obligatorio | opcional | no_utilizado)
  req_pago_confirmado       text NOT NULL DEFAULT 'obligatorio',
  req_evidencia_pago        text NOT NULL DEFAULT 'obligatorio',
  req_programa              text NOT NULL DEFAULT 'obligatorio',
  req_universidad           text NOT NULL DEFAULT 'obligatorio',
  req_fecha_confirmacion    text NOT NULL DEFAULT 'obligatorio',
  req_actor_valido          text NOT NULL DEFAULT 'obligatorio',
  req_canal_origen          text NOT NULL DEFAULT 'opcional',
  req_comentario            text NOT NULL DEFAULT 'obligatorio',
  -- Gobierno del cierre
  roles_autorizados         text[] NOT NULL DEFAULT ARRAY['super_admin','asesor'],
  canales_habilitados       text[] NOT NULL DEFAULT ARRAY['leadcenter','whatsapp','web'],
  ia_puede_sugerir          boolean NOT NULL DEFAULT true,
  ia_puede_ejecutar         boolean NOT NULL DEFAULT false,
  requiere_aprobacion_humana boolean NOT NULL DEFAULT true,
  pago_validado_antes_cierre boolean NOT NULL DEFAULT true,
  permite_reabrir           boolean NOT NULL DEFAULT true,
  creado_por                uuid REFERENCES public.usuarios_internos(id),
  creado_en                 timestamptz NOT NULL DEFAULT now(),
  actualizado_en            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reglas_ganada_req_pago_chk       CHECK (req_pago_confirmado    IN ('obligatorio','opcional','no_utilizado')),
  CONSTRAINT reglas_ganada_req_evid_chk       CHECK (req_evidencia_pago     IN ('obligatorio','opcional','no_utilizado')),
  CONSTRAINT reglas_ganada_req_prog_chk       CHECK (req_programa           IN ('obligatorio','opcional','no_utilizado')),
  CONSTRAINT reglas_ganada_req_uni_chk        CHECK (req_universidad        IN ('obligatorio','opcional','no_utilizado')),
  CONSTRAINT reglas_ganada_req_fecha_chk      CHECK (req_fecha_confirmacion IN ('obligatorio','opcional','no_utilizado')),
  CONSTRAINT reglas_ganada_req_actor_chk      CHECK (req_actor_valido       IN ('obligatorio','opcional','no_utilizado')),
  CONSTRAINT reglas_ganada_req_canal_chk      CHECK (req_canal_origen       IN ('obligatorio','opcional','no_utilizado')),
  CONSTRAINT reglas_ganada_req_coment_chk     CHECK (req_comentario         IN ('obligatorio','opcional','no_utilizado'))
);
COMMENT ON TABLE public.reglas_cierre_ganada IS 'Reglas configurables del cierre Ganada. Versionadas; una activa a la vez.';

INSERT INTO public.reglas_cierre_ganada (version, activo)
SELECT 1, true
WHERE NOT EXISTS (SELECT 1 FROM public.reglas_cierre_ganada);

-- =====================================================================
-- 1.4 · REGLAS DE CIERRE PERDIDA (versionadas, editables por CRUD)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.reglas_cierre_perdida (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version                    integer NOT NULL DEFAULT 1,
  activo                     boolean NOT NULL DEFAULT true,
  comentario_obligatorio     boolean NOT NULL DEFAULT true, -- exige explicación siempre
  causa_obligatoria          boolean NOT NULL DEFAULT true, -- exige seleccionar causa
  roles_autorizados          text[] NOT NULL DEFAULT ARRAY['super_admin','asesor'],
  canales_habilitados        text[] NOT NULL DEFAULT ARRAY['leadcenter','whatsapp','web'],
  ia_puede_marcar            boolean NOT NULL DEFAULT false,
  requiere_aprobacion_humana boolean NOT NULL DEFAULT true,
  tiempo_minimo_horas        integer NOT NULL DEFAULT 0, -- tiempo mínimo antes de cierre automático
  permite_reabrir            boolean NOT NULL DEFAULT true,
  creado_por                 uuid REFERENCES public.usuarios_internos(id),
  creado_en                  timestamptz NOT NULL DEFAULT now(),
  actualizado_en             timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.reglas_cierre_perdida IS 'Reglas configurables del cierre Perdida. Versionadas; una activa a la vez.';

INSERT INTO public.reglas_cierre_perdida (version, activo)
SELECT 1, true
WHERE NOT EXISTS (SELECT 1 FROM public.reglas_cierre_perdida);

-- =====================================================================
-- 1.5 · REGLAS DE DESAPARECIDO (versionadas, editables por CRUD)
-- ---------------------------------------------------------------------
-- IMPORTANTE: "Desaparecido" es REVERSIBLE y NO cierra la oportunidad
-- automáticamente. A lo sumo sugiere marcarla como perdida tras cierto
-- tiempo, pero requiere acción/aprobación humana salvo que se habilite.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.reglas_desaparecido (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version                   integer NOT NULL DEFAULT 1,
  activo                    boolean NOT NULL DEFAULT true,
  horas_sin_respuesta       integer NOT NULL DEFAULT 72,  -- horas sin respuesta para marcar desaparecido
  numero_intentos           integer NOT NULL DEFAULT 3,   -- intentos de contacto requeridos
  canales_utilizados        text[] NOT NULL DEFAULT ARRAY['whatsapp','llamada','email'],
  horas_entre_intentos      integer NOT NULL DEFAULT 24,  -- tiempo mínimo entre intentos
  mensaje_ultimo_contacto   text,                         -- plantilla de mensaje de último contacto
  crea_tarea_seguimiento    boolean NOT NULL DEFAULT true,
  mueve_auto_a_desaparecido boolean NOT NULL DEFAULT false, -- automatiza el paso a desaparecido
  sugiere_perdida_tras_horas integer NOT NULL DEFAULT 168, -- sugiere perdida tras N horas (0 = nunca)
  ia_puede_sugerir          boolean NOT NULL DEFAULT true,
  cierre_automatico_permitido boolean NOT NULL DEFAULT false, -- NUNCA cerrar auto salvo activación explícita
  creado_por                uuid REFERENCES public.usuarios_internos(id),
  creado_en                 timestamptz NOT NULL DEFAULT now(),
  actualizado_en            timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.reglas_desaparecido IS 'Reglas configurables de "Desaparecido". Reversible; no cierra automáticamente salvo cierre_automatico_permitido.';

INSERT INTO public.reglas_desaparecido (version, activo, mensaje_ultimo_contacto)
SELECT 1, true, 'Hola, seguimos disponibles para ayudarte con tu inscripción. ¿Continuamos?'
WHERE NOT EXISTS (SELECT 1 FROM public.reglas_desaparecido);

-- =====================================================================
-- 1.6 · AUDITORÍA DE CIERRE / REAPERTURA (inmutable)
-- ---------------------------------------------------------------------
-- Registra cada cierre y cada reapertura. Nunca se actualiza ni se borra.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.auditoria_cierre_oportunidad (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oportunidad_id        uuid NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  accion                text NOT NULL, -- 'cierre_ganada' | 'cierre_perdida' | 'reapertura'
  etapa_anterior_id     uuid REFERENCES public.etapas_embudo(id),
  subestado_anterior_id uuid REFERENCES public.subestados_oportunidad(id),
  etapa_nueva_id        uuid REFERENCES public.etapas_embudo(id),
  subestado_nuevo_id    uuid REFERENCES public.subestados_oportunidad(id),
  ejecutado_por         uuid REFERENCES public.usuarios_internos(id),
  ejecutado_por_tipo    text,          -- 'asesor' | 'super_admin' | 'universidad' | 'ia' | 'sistema'
  canal                 text,
  regla_aplicada        text,          -- 'reglas_cierre_ganada' | 'reglas_cierre_perdida' ...
  config_version        integer,       -- versión de la regla aplicada
  requisitos_validados  jsonb,         -- snapshot de requisitos evaluados y sus valores
  causa_id              uuid REFERENCES public.causas_perdida(id),
  causa_nombre          text,          -- copia textual (por si la causa se edita después)
  comentario            text,
  evidencias            jsonb,         -- URLs / metadatos de comprobantes
  creado_en             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auditoria_cierre_oportunidad
  ON public.auditoria_cierre_oportunidad(oportunidad_id, creado_en DESC);
COMMENT ON TABLE public.auditoria_cierre_oportunidad IS 'Auditoría inmutable de cierres y reaperturas. Solo INSERT (nunca UPDATE/DELETE).';

-- =====================================================================
-- 1.7 · ETAPA "Cerrada" + SUBESTADOS "Ganada" / "Perdida"
-- ---------------------------------------------------------------------
-- Cerrada es la etapa agrupadora del cierre. Se crea si no existe. Sus
-- subestados Ganada/Perdida distinguen el resultado. Migramos, si existen,
-- las etapas legadas "Ganada"/"Perdida" (de nivel superior) hacia Cerrada
-- y las desactivamos (soft delete) para dejar un embudo limpio.
-- =====================================================================
DO $$
DECLARE
  v_cerrada     uuid;
  v_sub_ganada  uuid;
  v_sub_perdida uuid;
  v_max_orden   integer;
  v_etapa_gan_legada uuid;
  v_etapa_per_legada uuid;
BEGIN
  -- Etapa Cerrada (agrupadora). Marca ambos flags finales para compatibilidad
  -- con lógica existente que consulta es_etapa_final_*.
  SELECT id INTO v_cerrada FROM public.etapas_embudo WHERE lower(nombre) = 'cerrada' LIMIT 1;
  IF v_cerrada IS NULL THEN
    SELECT coalesce(max(orden),0) INTO v_max_orden FROM public.etapas_embudo;
    INSERT INTO public.etapas_embudo (nombre, descripcion, orden, color, es_etapa_final_ganada, es_etapa_final_perdida, activo)
    VALUES ('Cerrada', 'Etapa agrupadora del cierre (Ganada / Perdida)', v_max_orden + 1, '#64748B', true, true, true)
    RETURNING id INTO v_cerrada;
  END IF;

  -- Subestado Ganada
  SELECT id INTO v_sub_ganada FROM public.subestados_oportunidad
    WHERE etapa_id = v_cerrada AND lower(nombre) = 'ganada' LIMIT 1;
  IF v_sub_ganada IS NULL THEN
    INSERT INTO public.subestados_oportunidad (etapa_id, nombre, descripcion, orden, activo)
    VALUES (v_cerrada, 'Ganada', 'Conversión real validada (inscripción/pago confirmado)', 1, true)
    RETURNING id INTO v_sub_ganada;
  END IF;

  -- Subestado Perdida
  SELECT id INTO v_sub_perdida FROM public.subestados_oportunidad
    WHERE etapa_id = v_cerrada AND lower(nombre) = 'perdida' LIMIT 1;
  IF v_sub_perdida IS NULL THEN
    INSERT INTO public.subestados_oportunidad (etapa_id, nombre, descripcion, orden, activo)
    VALUES (v_cerrada, 'Perdida', 'Oportunidad cerrada sin conversión', 2, true)
    RETURNING id INTO v_sub_perdida;
  END IF;

  -- Migrar etapas legadas de nivel superior (si existen y son distintas de Cerrada).
  SELECT id INTO v_etapa_gan_legada FROM public.etapas_embudo
    WHERE lower(nombre) = 'ganada' AND id <> v_cerrada LIMIT 1;
  SELECT id INTO v_etapa_per_legada FROM public.etapas_embudo
    WHERE lower(nombre) = 'perdida' AND id <> v_cerrada LIMIT 1;

  IF v_etapa_gan_legada IS NOT NULL THEN
    UPDATE public.oportunidades
      SET etapa_id = v_cerrada, subestado_id = v_sub_ganada
      WHERE etapa_id = v_etapa_gan_legada;
    UPDATE public.etapas_embudo SET activo = false WHERE id = v_etapa_gan_legada;
  END IF;

  IF v_etapa_per_legada IS NOT NULL THEN
    UPDATE public.oportunidades
      SET etapa_id = v_cerrada, subestado_id = v_sub_perdida
      WHERE etapa_id = v_etapa_per_legada;
    UPDATE public.etapas_embudo SET activo = false WHERE id = v_etapa_per_legada;
  END IF;
END$$;

-- =====================================================================
-- 1.8 · ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
-- SELECT: cualquier asesor/super activo (catálogo de reglas y causas).
-- INSERT/UPDATE: solo super_admin (la config se administra desde admin).
-- Auditoría: SELECT internos; NUNCA UPDATE/DELETE (inmutable). El INSERT
--   real se hace desde RPCs SECURITY DEFINER (bypass RLS controlado).
-- =====================================================================
ALTER TABLE public.causas_perdida               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reglas_cierre_ganada         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reglas_cierre_perdida        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reglas_desaparecido          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_cierre_oportunidad ENABLE ROW LEVEL SECURITY;

-- Helper: aplica el trío de políticas (select internos + mutación super) a una tabla.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'causas_perdida','reglas_cierre_ganada','reglas_cierre_perdida','reglas_desaparecido'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS cierre_%1$s_select ON public.%1$s;', t);
    EXECUTE format('CREATE POLICY cierre_%1$s_select ON public.%1$s FOR SELECT TO authenticated USING (public.es_asesor_o_super());', t);

    EXECUTE format('DROP POLICY IF EXISTS cierre_%1$s_insert ON public.%1$s;', t);
    EXECUTE format('CREATE POLICY cierre_%1$s_insert ON public.%1$s FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());', t);

    EXECUTE format('DROP POLICY IF EXISTS cierre_%1$s_update ON public.%1$s;', t);
    EXECUTE format('CREATE POLICY cierre_%1$s_update ON public.%1$s FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());', t);
    -- Sin política de DELETE: no se permiten borrados físicos (soft delete vía activo=false).
  END LOOP;
END$$;

-- Auditoría: solo lectura para internos; sin políticas de INSERT/UPDATE/DELETE
-- para authenticated (las RPCs SECURITY DEFINER hacen el INSERT).
DROP POLICY IF EXISTS cierre_auditoria_select ON public.auditoria_cierre_oportunidad;
CREATE POLICY cierre_auditoria_select ON public.auditoria_cierre_oportunidad
  FOR SELECT TO authenticated USING (public.es_asesor_o_super());

-- =====================================================================
-- 1.9 · RPCs DE CIERRE Y REAPERTURA (SECURITY DEFINER, autorizadas)
-- =====================================================================

-- ---------------------------------------------------------------------
-- fn_cerrar_ganada: valida requisitos de la regla activa y cierra en
-- Cerrada/Ganada. Devuelve {ok, faltantes[], error}.
--   p_datos jsonb esperado (claves opcionales según reglas):
--     pago_confirmado (bool), evidencia_pago (text/url),
--     programa_id (uuid), universidad_id (uuid),
--     fecha_confirmacion (timestamptz), actor_valido (text),
--     canal_origen (text), comentario (text), evidencias (jsonb)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cerrar_ganada(
  p_oportunidad_id uuid,
  p_datos jsonb DEFAULT '{}'::jsonb,
  p_canal text DEFAULT 'leadcenter'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := public.usuario_interno_id();
  v_regla        public.reglas_cierre_ganada%ROWTYPE;
  v_cerrada      uuid;
  v_sub_ganada   uuid;
  v_etapa_ant    uuid;
  v_sub_ant      uuid;
  v_faltantes    text[] := ARRAY[]::text[];
  v_prog         uuid;
  v_uni          uuid;
  v_es_super     boolean := public.is_super_admin();
BEGIN
  -- Autorización básica
  IF NOT public.puede_ver_oportunidad(p_oportunidad_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado');
  END IF;

  -- Regla activa (mayor versión activa)
  SELECT * INTO v_regla FROM public.reglas_cierre_ganada
    WHERE activo = true ORDER BY version DESC LIMIT 1;
  IF v_regla.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_reglas_ganada');
  END IF;

  -- Etapa/subestado destino
  SELECT id INTO v_cerrada FROM public.etapas_embudo WHERE lower(nombre) = 'cerrada' LIMIT 1;
  SELECT id INTO v_sub_ganada FROM public.subestados_oportunidad
    WHERE etapa_id = v_cerrada AND lower(nombre) = 'ganada' LIMIT 1;
  IF v_cerrada IS NULL OR v_sub_ganada IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'etapa_cerrada_no_configurada');
  END IF;

  -- Estado actual (para historial y auditoría)
  SELECT etapa_id, subestado_id, programa_id, universidad_id
    INTO v_etapa_ant, v_sub_ant, v_prog, v_uni
    FROM public.oportunidades WHERE id = p_oportunidad_id;

  -- --- Validación de requisitos obligatorios ---
  IF v_regla.req_pago_confirmado = 'obligatorio'
     AND coalesce((p_datos->>'pago_confirmado')::boolean, false) = false THEN
    v_faltantes := array_append(v_faltantes, 'Pago de inscripción confirmado');
  END IF;
  IF v_regla.req_evidencia_pago = 'obligatorio'
     AND coalesce(p_datos->>'evidencia_pago','') = '' THEN
    v_faltantes := array_append(v_faltantes, 'Evidencia / comprobante de pago');
  END IF;
  IF v_regla.req_programa = 'obligatorio'
     AND coalesce(p_datos->>'programa_id', v_prog::text, '') = '' THEN
    v_faltantes := array_append(v_faltantes, 'Programa');
  END IF;
  IF v_regla.req_universidad = 'obligatorio'
     AND coalesce(p_datos->>'universidad_id', v_uni::text, '') = '' THEN
    v_faltantes := array_append(v_faltantes, 'Universidad');
  END IF;
  IF v_regla.req_fecha_confirmacion = 'obligatorio'
     AND coalesce(p_datos->>'fecha_confirmacion','') = '' THEN
    v_faltantes := array_append(v_faltantes, 'Fecha de confirmación');
  END IF;
  IF v_regla.req_actor_valido = 'obligatorio'
     AND coalesce(p_datos->>'actor_valido','') = '' THEN
    v_faltantes := array_append(v_faltantes, 'Actor que validó');
  END IF;
  IF v_regla.req_canal_origen = 'obligatorio'
     AND coalesce(p_datos->>'canal_origen','') = '' THEN
    v_faltantes := array_append(v_faltantes, 'Canal de origen');
  END IF;
  IF v_regla.req_comentario = 'obligatorio'
     AND coalesce(p_datos->>'comentario','') = '' THEN
    v_faltantes := array_append(v_faltantes, 'Comentario');
  END IF;

  -- Si hay obligatorios faltantes, se bloquea y se informa qué falta.
  IF array_length(v_faltantes, 1) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'requisitos_incompletos', 'faltantes', to_jsonb(v_faltantes));
  END IF;

  -- Aprobación humana: si la regla la exige, solo un humano interno puede ejecutar.
  IF v_regla.requiere_aprobacion_humana AND v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'requiere_aprobacion_humana');
  END IF;

  -- --- Aplicar cierre ---
  UPDATE public.oportunidades SET
    etapa_id              = v_cerrada,
    subestado_id          = v_sub_ganada,
    estado                = 'ganada',
    cierre_tipo           = 'ganada',
    cierre_por            = v_uid,
    cierre_por_tipo       = CASE WHEN v_es_super THEN 'super_admin' ELSE 'asesor' END,
    cierre_canal          = p_canal,
    cierre_comentario     = p_datos->>'comentario',
    cierre_config_version = v_regla.version,
    fecha_cierre          = now(),
    fecha_validacion_pago_inscripcion = coalesce(
      (p_datos->>'fecha_confirmacion')::timestamptz,
      CASE WHEN coalesce((p_datos->>'pago_confirmado')::boolean,false) THEN now() ELSE fecha_validacion_pago_inscripcion END),
    programa_id           = coalesce((p_datos->>'programa_id')::uuid, programa_id),
    universidad_id        = coalesce((p_datos->>'universidad_id')::uuid, universidad_id),
    reabierta_en          = NULL,  -- limpia estado de reapertura previa
    actualizado_en        = now()
  WHERE id = p_oportunidad_id;

  -- Historial (timeline) — el cierre se registra como transición.
  INSERT INTO public.historial_etapas_oportunidad (
    oportunidad_id, etapa_anterior_id, etapa_nueva_id,
    subestado_anterior_id, subestado_nuevo_id, motivo, cambiado_por, canal, creado_en
  ) VALUES (
    p_oportunidad_id, v_etapa_ant, v_cerrada, v_sub_ant, v_sub_ganada,
    'Cierre: Ganada' || CASE WHEN coalesce(p_datos->>'comentario','')<>'' THEN ' · '||(p_datos->>'comentario') ELSE '' END,
    v_uid, p_canal, now()
  );

  -- Auditoría inmutable
  INSERT INTO public.auditoria_cierre_oportunidad (
    oportunidad_id, accion, etapa_anterior_id, subestado_anterior_id,
    etapa_nueva_id, subestado_nuevo_id, ejecutado_por, ejecutado_por_tipo,
    canal, regla_aplicada, config_version, requisitos_validados, comentario, evidencias
  ) VALUES (
    p_oportunidad_id, 'cierre_ganada', v_etapa_ant, v_sub_ant,
    v_cerrada, v_sub_ganada, v_uid, CASE WHEN v_es_super THEN 'super_admin' ELSE 'asesor' END,
    p_canal, 'reglas_cierre_ganada', v_regla.version, p_datos, p_datos->>'comentario', p_datos->'evidencias'
  );

  RETURN jsonb_build_object('ok', true, 'oportunidad_id', p_oportunidad_id, 'tipo', 'ganada');
END;
$$;
COMMENT ON FUNCTION public.fn_cerrar_ganada(uuid,jsonb,text) IS 'Cierra una oportunidad como Ganada validando la regla activa; registra historial y auditoría.';

-- ---------------------------------------------------------------------
-- fn_cerrar_perdida: exige causa (si la regla lo pide) y comentario.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cerrar_perdida(
  p_oportunidad_id uuid,
  p_causa_id uuid,
  p_comentario text DEFAULT NULL,
  p_canal text DEFAULT 'leadcenter'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := public.usuario_interno_id();
  v_regla        public.reglas_cierre_perdida%ROWTYPE;
  v_causa        public.causas_perdida%ROWTYPE;
  v_cerrada      uuid;
  v_sub_perdida  uuid;
  v_etapa_ant    uuid;
  v_sub_ant      uuid;
  v_faltantes    text[] := ARRAY[]::text[];
  v_es_super     boolean := public.is_super_admin();
BEGIN
  IF NOT public.puede_ver_oportunidad(p_oportunidad_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado');
  END IF;

  SELECT * INTO v_regla FROM public.reglas_cierre_perdida
    WHERE activo = true ORDER BY version DESC LIMIT 1;
  IF v_regla.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_reglas_perdida');
  END IF;

  -- Causa obligatoria
  IF v_regla.causa_obligatoria AND p_causa_id IS NULL THEN
    v_faltantes := array_append(v_faltantes, 'Causa de pérdida');
  END IF;

  IF p_causa_id IS NOT NULL THEN
    SELECT * INTO v_causa FROM public.causas_perdida WHERE id = p_causa_id AND activo = true;
    IF v_causa.id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'causa_invalida');
    END IF;
    -- Comentario obligatorio por causa o por regla global
    IF (v_causa.requiere_comentario OR v_regla.comentario_obligatorio)
       AND coalesce(p_comentario,'') = '' THEN
      v_faltantes := array_append(v_faltantes, 'Explicación / comentario');
    END IF;
  ELSIF v_regla.comentario_obligatorio AND coalesce(p_comentario,'') = '' THEN
    v_faltantes := array_append(v_faltantes, 'Explicación / comentario');
  END IF;

  IF array_length(v_faltantes, 1) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'requisitos_incompletos', 'faltantes', to_jsonb(v_faltantes));
  END IF;

  IF v_regla.requiere_aprobacion_humana AND v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'requiere_aprobacion_humana');
  END IF;

  SELECT id INTO v_cerrada FROM public.etapas_embudo WHERE lower(nombre) = 'cerrada' LIMIT 1;
  SELECT id INTO v_sub_perdida FROM public.subestados_oportunidad
    WHERE etapa_id = v_cerrada AND lower(nombre) = 'perdida' LIMIT 1;
  IF v_cerrada IS NULL OR v_sub_perdida IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'etapa_cerrada_no_configurada');
  END IF;

  SELECT etapa_id, subestado_id INTO v_etapa_ant, v_sub_ant
    FROM public.oportunidades WHERE id = p_oportunidad_id;

  UPDATE public.oportunidades SET
    etapa_id              = v_cerrada,
    subestado_id          = v_sub_perdida,
    estado                = 'perdida',
    cierre_tipo           = 'perdida',
    cierre_por            = v_uid,
    cierre_por_tipo       = CASE WHEN v_es_super THEN 'super_admin' ELSE 'asesor' END,
    cierre_canal          = p_canal,
    cierre_causa_id       = p_causa_id,
    cierre_comentario     = p_comentario,
    cierre_config_version = v_regla.version,
    razon_perdida         = p_comentario,
    fecha_cierre          = now(),
    reabierta_en          = NULL,
    actualizado_en        = now()
  WHERE id = p_oportunidad_id;

  INSERT INTO public.historial_etapas_oportunidad (
    oportunidad_id, etapa_anterior_id, etapa_nueva_id,
    subestado_anterior_id, subestado_nuevo_id, motivo, cambiado_por, canal, creado_en
  ) VALUES (
    p_oportunidad_id, v_etapa_ant, v_cerrada, v_sub_ant, v_sub_perdida,
    'Cierre: Perdida' || CASE WHEN v_causa.nombre IS NOT NULL THEN ' · Causa: '||v_causa.nombre ELSE '' END
      || CASE WHEN coalesce(p_comentario,'')<>'' THEN ' · '||p_comentario ELSE '' END,
    v_uid, p_canal, now()
  );

  INSERT INTO public.auditoria_cierre_oportunidad (
    oportunidad_id, accion, etapa_anterior_id, subestado_anterior_id,
    etapa_nueva_id, subestado_nuevo_id, ejecutado_por, ejecutado_por_tipo,
    canal, regla_aplicada, config_version, causa_id, causa_nombre, comentario
  ) VALUES (
    p_oportunidad_id, 'cierre_perdida', v_etapa_ant, v_sub_ant,
    v_cerrada, v_sub_perdida, v_uid, CASE WHEN v_es_super THEN 'super_admin' ELSE 'asesor' END,
    p_canal, 'reglas_cierre_perdida', v_regla.version, p_causa_id, v_causa.nombre, p_comentario
  );

  RETURN jsonb_build_object('ok', true, 'oportunidad_id', p_oportunidad_id, 'tipo', 'perdida');
END;
$$;
COMMENT ON FUNCTION public.fn_cerrar_perdida(uuid,uuid,text,text) IS 'Cierra una oportunidad como Perdida validando causa y comentario; registra historial y auditoría.';

-- ---------------------------------------------------------------------
-- fn_reabrir_oportunidad: conserva el cierre en la auditoría, pide motivo
-- y mueve a la nueva etapa/subestado indicada. Historial permanece intacto.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reabrir_oportunidad(
  p_oportunidad_id uuid,
  p_etapa_nueva uuid,
  p_subestado_nuevo uuid DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_canal text DEFAULT 'leadcenter'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := public.usuario_interno_id();
  v_etapa_ant uuid;
  v_sub_ant   uuid;
  v_es_super  boolean := public.is_super_admin();
  v_permite_g boolean;
  v_permite_p boolean;
  v_cierre    text;
BEGIN
  IF NOT public.puede_ver_oportunidad(p_oportunidad_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_autorizado');
  END IF;

  IF coalesce(p_motivo,'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'motivo_requerido');
  END IF;
  IF p_etapa_nueva IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'etapa_requerida');
  END IF;

  SELECT etapa_id, subestado_id, cierre_tipo INTO v_etapa_ant, v_sub_ant, v_cierre
    FROM public.oportunidades WHERE id = p_oportunidad_id;

  -- Respeta el flag permite_reabrir de la regla correspondiente.
  SELECT permite_reabrir INTO v_permite_g FROM public.reglas_cierre_ganada
    WHERE activo = true ORDER BY version DESC LIMIT 1;
  SELECT permite_reabrir INTO v_permite_p FROM public.reglas_cierre_perdida
    WHERE activo = true ORDER BY version DESC LIMIT 1;
  IF v_cierre = 'ganada' AND coalesce(v_permite_g,true) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reapertura_no_permitida_ganada');
  END IF;
  IF v_cierre = 'perdida' AND coalesce(v_permite_p,true) = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reapertura_no_permitida_perdida');
  END IF;

  UPDATE public.oportunidades SET
    etapa_id       = p_etapa_nueva,
    subestado_id   = p_subestado_nuevo,
    estado         = 'activa',
    cierre_tipo    = NULL,           -- deja de estar cerrada (el cierre queda en auditoría)
    reabierta_en   = now(),
    reabierta_por  = v_uid,
    reabierta_motivo = p_motivo,
    actualizado_en = now()
  WHERE id = p_oportunidad_id;

  INSERT INTO public.historial_etapas_oportunidad (
    oportunidad_id, etapa_anterior_id, etapa_nueva_id,
    subestado_anterior_id, subestado_nuevo_id, motivo, cambiado_por, canal, creado_en
  ) VALUES (
    p_oportunidad_id, v_etapa_ant, p_etapa_nueva, v_sub_ant, p_subestado_nuevo,
    'Reapertura · ' || p_motivo, v_uid, p_canal, now()
  );

  INSERT INTO public.auditoria_cierre_oportunidad (
    oportunidad_id, accion, etapa_anterior_id, subestado_anterior_id,
    etapa_nueva_id, subestado_nuevo_id, ejecutado_por, ejecutado_por_tipo,
    canal, comentario
  ) VALUES (
    p_oportunidad_id, 'reapertura', v_etapa_ant, v_sub_ant,
    p_etapa_nueva, p_subestado_nuevo, v_uid,
    CASE WHEN v_es_super THEN 'super_admin' ELSE 'asesor' END, p_canal, p_motivo
  );

  RETURN jsonb_build_object('ok', true, 'oportunidad_id', p_oportunidad_id);
END;
$$;
COMMENT ON FUNCTION public.fn_reabrir_oportunidad(uuid,uuid,uuid,text,text) IS 'Reabre una oportunidad cerrada conservando el cierre en auditoría; exige motivo y nueva etapa.';

COMMIT;

-- =====================================================================
-- VALIDACIÓN POSTERIOR (ejecutar a mano para verificar; opcional):
--   SELECT nombre, activo FROM public.etapas_embudo WHERE lower(nombre)='cerrada';
--   SELECT nombre, orden, activo FROM public.causas_perdida ORDER BY orden;
--   SELECT version, activo FROM public.reglas_cierre_ganada;
--   SELECT version, activo FROM public.reglas_cierre_perdida;
--   SELECT version, activo FROM public.reglas_desaparecido;
--   -- Prueba de cierre perdida (reemplaza los UUID):
--   -- SELECT public.fn_cerrar_perdida('<op_id>', '<causa_id>', 'Prueba', 'leadcenter');
-- =====================================================================
