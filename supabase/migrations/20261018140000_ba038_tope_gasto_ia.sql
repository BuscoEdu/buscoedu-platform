-- =====================================================
-- BA-038 · Tope de gasto diario de IA por número + precios versionados (capa BD)
-- Autor: Base de datos BuscoEdu (bot) · 2026-10-18 · E1 Ola 3/4
-- Spec: briefs/e1-ia-multiproveedor.md D1–D8 · base: 20261018130000 (BA-034, Backend)
--
-- Qué hace:
--   1. topes_gasto_ia: tope diario (USD) y umbral de alerta (%) por canal/número.
--      Valores por defecto: USD 5 y 80 %. El tope es obligatorio y > 0, y el umbral
--      va de 1 a 99. No existe "sin límite": NOT NULL + CHECK.
--   2. bitacora_topes_gasto_ia: quién, cuándo, valor anterior → nuevo (D1).
--   3. precios_modelo_ia: precio por 1.000 tokens, versionado. Nunca se sobrescribe:
--      se cierra la versión vigente y se inserta una nueva.
--   4. alertas_gasto_ia: alerta del umbral y corte al 100 %, una por día y canal (D5/D6).
--   5. Funciones (solo service_role):
--      fn_ia_actualizar_tope, fn_ia_gasto_hoy, fn_ia_registrar_alerta_gasto,
--      fn_ia_registrar_precio y fn_ia_precio_vigente.
-- Para qué: evitar facturas sorpresa por errores, bucles o abuso. El panel edita el
--   tope sin redeploy. El backend consulta fn_ia_gasto_hoy antes de llamar a la IA y,
--   si ve 'cortado', no la llama (D6). La medianoche de Bogotá reinicia sola el día (D7).
--
-- ⚠ Alcance "número": todavía no existe lineas_whatsapp (Centro WA, fase futura) y
--   registros_costo_ia guarda canal_codigo, no la línea. Hoy hay un solo número
--   de WhatsApp, que es el canal 'whatsapp', así que el tope se guarda por canal (web,
--   whatsapp, …). Cuando exista lineas_whatsapp se agrega linea_id (ver README).
--
-- Reglas: no hay DELETE físico; las versiones de precio se cierran con vigente_hasta.
--   Escribe solo el servidor y lee solo super_admin. Los errores devuelven solo un
--   código y el motivo en español.
-- Idempotente: IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY IF EXISTS y ON CONFLICT DO NOTHING.
-- NO aplicada en prod. Deshacer: supabase/ops/20261018_ba038_deshacer.sql
-- =====================================================
BEGIN;

-- -----------------------------------------------------
-- Bloque 1: topes por canal/número.
-- Para qué: guardar el tope y el umbral editables. Los CHECK impiden NULL, 0,
-- valores negativos y umbrales fuera de 1–99, también si alguien escribe directo en la tabla.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.topes_gasto_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal_id uuid NOT NULL REFERENCES public.canales_ia(id),
  tope_diario_usd numeric(10, 2) NOT NULL DEFAULT 5.00,
  umbral_alerta_pct smallint NOT NULL DEFAULT 80,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid REFERENCES public.usuarios_internos(id),
  CONSTRAINT topes_gasto_ia_canal_unico UNIQUE (canal_id),
  CONSTRAINT topes_gasto_ia_tope_check CHECK (tope_diario_usd > 0),
  CONSTRAINT topes_gasto_ia_umbral_check CHECK (umbral_alerta_pct BETWEEN 1 AND 99)
);

COMMENT ON TABLE public.topes_gasto_ia IS
  'BA-038. Tope diario de gasto IA (USD) y umbral de alerta (%) por canal/número. Default 5 USD / 80 %. Nunca sin límite.';
COMMENT ON COLUMN public.topes_gasto_ia.tope_diario_usd IS 'Obligatorio y > 0. Al llegar al 100 % la IA no se llama ese día (D6).';
COMMENT ON COLUMN public.topes_gasto_ia.umbral_alerta_pct IS 'Entre 1 y 99. Al llegar al umbral, el panel muestra la alerta (D5).';

-- Bloque 1b: cada canal existente arranca con los valores por defecto (D2).
INSERT INTO public.topes_gasto_ia (canal_id)
SELECT c.id FROM public.canales_ia c
ON CONFLICT (canal_id) DO NOTHING;

-- Bloque 1c: todo canal nuevo recibe sus valores por defecto al crearse (D2).
CREATE OR REPLACE FUNCTION public.fn_ia_tope_por_defecto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.topes_gasto_ia (canal_id) VALUES (NEW.id)
  ON CONFLICT (canal_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canales_ia_tope_por_defecto ON public.canales_ia;
CREATE TRIGGER trg_canales_ia_tope_por_defecto
  AFTER INSERT ON public.canales_ia
  FOR EACH ROW EXECUTE FUNCTION public.fn_ia_tope_por_defecto();

-- -----------------------------------------------------
-- Bloque 2: bitácora de cambios del tope (D1: quién, cuándo, anterior → nuevo).
-- Para qué: auditar cada cambio. La escribe solo fn_ia_actualizar_tope.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bitacora_topes_gasto_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tope_id uuid NOT NULL REFERENCES public.topes_gasto_ia(id),
  campo text NOT NULL CHECK (campo IN ('tope_diario_usd', 'umbral_alerta_pct')),
  valor_anterior numeric(10, 2) NOT NULL,
  valor_nuevo numeric(10, 2) NOT NULL,
  actor_usuario_id uuid REFERENCES public.usuarios_internos(id),
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bitacora_topes_gasto_ia_tope
  ON public.bitacora_topes_gasto_ia (tope_id, creado_en DESC);

COMMENT ON TABLE public.bitacora_topes_gasto_ia IS
  'BA-038 D1. Historial de cambios de tope y umbral: campo, valor anterior → nuevo, actor y fecha.';

-- -----------------------------------------------------
-- Bloque 3: precios por modelo, versionados (pedido de Backend en BA-034).
-- Para qué: calcular el costo con un precio trazable. Nunca se sobrescribe un precio:
-- se cierra la versión vigente (vigente_hasta) y se inserta la nueva.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.precios_modelo_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor_id uuid NOT NULL REFERENCES public.proveedores_ia(id),
  modelo text NOT NULL,
  version text NOT NULL,
  entrada_usd_1k numeric(12, 6) NOT NULL CHECK (entrada_usd_1k >= 0),
  salida_usd_1k numeric(12, 6) NOT NULL CHECK (salida_usd_1k >= 0),
  vigente_desde timestamptz NOT NULL DEFAULT now(),
  vigente_hasta timestamptz,
  reemplaza_precio_id uuid REFERENCES public.precios_modelo_ia(id),
  fuente text,
  creado_por uuid REFERENCES public.usuarios_internos(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT precios_modelo_ia_version_unica UNIQUE (proveedor_id, modelo, version),
  CONSTRAINT precios_modelo_ia_rango_check CHECK (vigente_hasta IS NULL OR vigente_hasta > vigente_desde)
);

-- Bloque 3b: solo una versión vigente (sin fecha de cierre) por proveedor + modelo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_precios_modelo_ia_vigente
  ON public.precios_modelo_ia (proveedor_id, modelo) WHERE vigente_hasta IS NULL;

COMMENT ON TABLE public.precios_modelo_ia IS
  'BA-038. Precio USD por 1.000 tokens por proveedor+modelo, versionado (no se sobrescribe). Una sola fila vigente por modelo.';
COMMENT ON COLUMN public.precios_modelo_ia.fuente IS 'De dónde salió el precio (URL o nota). Nunca se inventa un precio.';

-- -----------------------------------------------------
-- Bloque 4: alertas de gasto (D5 umbral, D6 corte). Una por canal, día y tipo.
-- Para qué: que el panel muestre la alerta y quede registrada sin duplicarse en cada mensaje.
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alertas_gasto_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal_id uuid NOT NULL REFERENCES public.canales_ia(id),
  dia_bogota date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('umbral', 'corte')),
  gasto_usd numeric(12, 6) NOT NULL,
  tope_usd numeric(10, 2) NOT NULL,
  umbral_pct smallint NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  vista_en timestamptz,
  CONSTRAINT alertas_gasto_ia_unica UNIQUE (canal_id, dia_bogota, tipo)
);

COMMENT ON TABLE public.alertas_gasto_ia IS
  'BA-038 D5/D6. Alerta de umbral o corte por canal y día de Bogotá (una sola). vista_en = el admin la marcó como vista.';

-- Bloque 4b: índice para sumar el gasto de hoy por canal (consulta de fn_ia_gasto_hoy).
CREATE INDEX IF NOT EXISTS idx_registros_costo_ia_canal_creado
  ON public.registros_costo_ia (canal_codigo, creado_en DESC);

-- -----------------------------------------------------
-- Bloque 5: RLS. Lectura solo super_admin; el cliente no escribe nada.
-- (service_role ignora RLS: lo usan el backend y las funciones.)
-- -----------------------------------------------------
ALTER TABLE public.topes_gasto_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bitacora_topes_gasto_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.precios_modelo_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas_gasto_ia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS topes_gasto_ia_select_super ON public.topes_gasto_ia;
CREATE POLICY topes_gasto_ia_select_super ON public.topes_gasto_ia
  FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS bitacora_topes_gasto_ia_select_super ON public.bitacora_topes_gasto_ia;
CREATE POLICY bitacora_topes_gasto_ia_select_super ON public.bitacora_topes_gasto_ia
  FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS precios_modelo_ia_select_super ON public.precios_modelo_ia;
CREATE POLICY precios_modelo_ia_select_super ON public.precios_modelo_ia
  FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS alertas_gasto_ia_select_super ON public.alertas_gasto_ia;
CREATE POLICY alertas_gasto_ia_select_super ON public.alertas_gasto_ia
  FOR SELECT TO authenticated USING (public.is_super_admin());

REVOKE INSERT, UPDATE, DELETE ON public.topes_gasto_ia, public.bitacora_topes_gasto_ia,
  public.precios_modelo_ia, public.alertas_gasto_ia FROM anon, authenticated;

-- -----------------------------------------------------
-- Bloque 6: fn_ia_actualizar_tope (D1, D3, D4).
-- Para qué: el endpoint del panel guarda tope y umbral, con validación y motivo en
-- español, y deja cada cambio en la bitácora. NULL en un parámetro = no cambiar ese
-- campo (nunca "sin límite"). Los CHECK de la tabla son la segunda barrera.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ia_actualizar_tope(
  p_canal_codigo text,
  p_tope_diario_usd numeric,
  p_umbral_alerta_pct integer,
  p_actor_usuario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_canal_id uuid;
  v_tope public.topes_gasto_ia%ROWTYPE;
BEGIN
  -- 6.1 Validar entradas antes de escribir (fail-closed).
  IF p_tope_diario_usd IS NULL AND p_umbral_alerta_pct IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sin_cambios', 'motivo', 'No hay valores para guardar.');
  END IF;
  IF p_tope_diario_usd IS NOT NULL AND (p_tope_diario_usd <= 0 OR p_tope_diario_usd > 99999999.99) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tope_invalido', 'motivo', 'El tope es obligatorio y mayor que 0');
  END IF;
  IF p_umbral_alerta_pct IS NOT NULL AND p_umbral_alerta_pct NOT BETWEEN 1 AND 99 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'umbral_invalido', 'motivo', 'El umbral de alerta debe estar entre 1 y 99 %');
  END IF;

  -- 6.2 Buscar el canal y asegurar su fila con los valores por defecto (D2).
  SELECT id INTO v_canal_id FROM public.canales_ia WHERE codigo = p_canal_codigo;
  IF v_canal_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'canal_inexistente', 'motivo', 'El número o canal no existe.');
  END IF;
  INSERT INTO public.topes_gasto_ia (canal_id) VALUES (v_canal_id) ON CONFLICT (canal_id) DO NOTHING;
  SELECT * INTO v_tope FROM public.topes_gasto_ia WHERE canal_id = v_canal_id FOR UPDATE;

  -- 6.3 Bitácora solo de lo que cambia de verdad (anterior → nuevo).
  IF p_tope_diario_usd IS NOT NULL AND round(p_tope_diario_usd, 2) <> v_tope.tope_diario_usd THEN
    INSERT INTO public.bitacora_topes_gasto_ia (tope_id, campo, valor_anterior, valor_nuevo, actor_usuario_id)
    VALUES (v_tope.id, 'tope_diario_usd', v_tope.tope_diario_usd, round(p_tope_diario_usd, 2), p_actor_usuario_id);
  END IF;
  IF p_umbral_alerta_pct IS NOT NULL AND p_umbral_alerta_pct <> v_tope.umbral_alerta_pct THEN
    INSERT INTO public.bitacora_topes_gasto_ia (tope_id, campo, valor_anterior, valor_nuevo, actor_usuario_id)
    VALUES (v_tope.id, 'umbral_alerta_pct', v_tope.umbral_alerta_pct, p_umbral_alerta_pct, p_actor_usuario_id);
  END IF;

  -- 6.4 Guardar. Si se sube el tope, el corte se levanta en la siguiente consulta (D7).
  UPDATE public.topes_gasto_ia
  SET tope_diario_usd = coalesce(round(p_tope_diario_usd, 2), tope_diario_usd),
      umbral_alerta_pct = coalesce(p_umbral_alerta_pct, umbral_alerta_pct),
      actualizado_en = now(),
      actualizado_por = p_actor_usuario_id
  WHERE id = v_tope.id
  RETURNING * INTO v_tope;

  RETURN jsonb_build_object('ok', true, 'canal', p_canal_codigo,
    'tope_diario_usd', v_tope.tope_diario_usd, 'umbral_alerta_pct', v_tope.umbral_alerta_pct);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', 'error_interno', 'sqlstate', SQLSTATE);
END;
$$;

-- -----------------------------------------------------
-- Bloque 7: fn_ia_gasto_hoy (D5, D6, D7, D8).
-- Para qué: una sola consulta da el gasto estimado de hoy (día de Bogotá), el tope,
-- el % usado y el estado: 'normal' | 'alerta' (≥ umbral) | 'cortado' (≥ 100 %).
-- El backend la llama antes de cada llamada a la IA y el panel la muestra.
-- La medianoche de Bogotá reinicia el día sola (D7), sin tareas programadas.
-- Cuenta todos los intentos con costo, incluidas las simulaciones (también cuestan
-- dinero). intentos_sin_costo avisa que el estimado es parcial (Abacus sin precio).
-- Canal sin fila de tope → defaults 5 / 80 (D2), nunca sin límite.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ia_gasto_hoy(p_canal_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dia date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_desde timestamptz := (v_dia::timestamp AT TIME ZONE 'America/Bogota');
  v_canal_id uuid;
  v_tope numeric(10, 2) := 5.00;
  v_umbral smallint := 80;
  v_gasto numeric(12, 6);
  v_sin_costo integer;
  v_pct numeric;
BEGIN
  -- 7.1 Canal y tope (o valores por defecto).
  SELECT id INTO v_canal_id FROM public.canales_ia WHERE codigo = p_canal_codigo;
  IF v_canal_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'canal_inexistente');
  END IF;
  SELECT t.tope_diario_usd, t.umbral_alerta_pct INTO v_tope, v_umbral
  FROM public.topes_gasto_ia t WHERE t.canal_id = v_canal_id;
  v_tope := coalesce(v_tope, 5.00);
  v_umbral := coalesce(v_umbral, 80);

  -- 7.2 Gasto de hoy (desde las 00:00 de Bogotá) e intentos sin costo conocido.
  SELECT coalesce(sum(r.costo_estimado_usd), 0),
         count(*) FILTER (WHERE r.costo_estimado_usd IS NULL AND r.resultado IN ('exitoso', 'error', 'formato_invalido'))
  INTO v_gasto, v_sin_costo
  FROM public.registros_costo_ia r
  WHERE r.canal_codigo = p_canal_codigo AND r.creado_en >= v_desde;

  -- 7.3 Porcentaje y estado.
  v_pct := round(v_gasto / v_tope * 100, 1);

  RETURN jsonb_build_object(
    'ok', true,
    'canal', p_canal_codigo,
    'dia_bogota', v_dia,
    'gasto_usd', round(v_gasto, 4),
    'tope_diario_usd', v_tope,
    'umbral_alerta_pct', v_umbral,
    'pct_usado', v_pct,
    'estado', CASE WHEN v_gasto >= v_tope THEN 'cortado'
                   WHEN v_pct >= v_umbral THEN 'alerta'
                   ELSE 'normal' END,
    'intentos_sin_costo', v_sin_costo
  );
END;
$$;

-- -----------------------------------------------------
-- Bloque 8: fn_ia_registrar_alerta_gasto (D5, D6: "la alerta queda registrada").
-- Para qué: el backend la llama cuando fn_ia_gasto_hoy da 'alerta' o 'cortado'.
-- Guarda una sola alerta por canal, día y tipo (si ya existe, no duplica).
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ia_registrar_alerta_gasto(p_canal_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estado jsonb := public.fn_ia_gasto_hoy(p_canal_codigo);
  v_tipo text;
  v_nueva boolean := false;
BEGIN
  IF NOT coalesce((v_estado->>'ok')::boolean, false) THEN
    RETURN v_estado;
  END IF;
  v_tipo := CASE v_estado->>'estado' WHEN 'cortado' THEN 'corte' WHEN 'alerta' THEN 'umbral' END;
  IF v_tipo IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'registrada', false, 'estado', 'normal');
  END IF;

  -- 8.1 Al cortar también queda la de umbral (por si se saltó de golpe del 70 % al 100 %).
  INSERT INTO public.alertas_gasto_ia (canal_id, dia_bogota, tipo, gasto_usd, tope_usd, umbral_pct)
  SELECT c.id, (v_estado->>'dia_bogota')::date, t.tipo, (v_estado->>'gasto_usd')::numeric,
         (v_estado->>'tope_diario_usd')::numeric, (v_estado->>'umbral_alerta_pct')::smallint
  FROM public.canales_ia c
  CROSS JOIN (SELECT unnest(CASE WHEN v_tipo = 'corte' THEN ARRAY['umbral', 'corte'] ELSE ARRAY['umbral'] END) AS tipo) t
  WHERE c.codigo = p_canal_codigo
  ON CONFLICT (canal_id, dia_bogota, tipo) DO NOTHING;
  v_nueva := FOUND;

  RETURN jsonb_build_object('ok', true, 'registrada', v_nueva, 'tipo', v_tipo, 'estado', v_estado->>'estado');
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', 'error_interno', 'sqlstate', SQLSTATE);
END;
$$;

-- -----------------------------------------------------
-- Bloque 9: fn_ia_registrar_precio (precio versionado, sin sobrescribir).
-- Para qué: cargar o cambiar el precio de un modelo. Cierra la versión vigente
-- (vigente_hasta = now()) e inserta la nueva enlazada con reemplaza_precio_id.
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ia_registrar_precio(
  p_proveedor_codigo text,
  p_modelo text,
  p_entrada_usd_1k numeric,
  p_salida_usd_1k numeric,
  p_version text,
  p_fuente text,
  p_actor_usuario_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proveedor_id uuid;
  v_anterior uuid;
  v_nuevo uuid;
BEGIN
  -- 9.1 Validar.
  IF coalesce(trim(p_modelo), '') = '' OR coalesce(trim(p_version), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'datos_incompletos', 'motivo', 'Modelo y versión son obligatorios.');
  END IF;
  IF p_entrada_usd_1k IS NULL OR p_salida_usd_1k IS NULL OR p_entrada_usd_1k < 0 OR p_salida_usd_1k < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'precio_invalido', 'motivo', 'Los precios son obligatorios y no pueden ser negativos.');
  END IF;
  SELECT id INTO v_proveedor_id FROM public.proveedores_ia WHERE codigo = p_proveedor_codigo;
  IF v_proveedor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'proveedor_inexistente');
  END IF;
  IF EXISTS (SELECT 1 FROM public.precios_modelo_ia
             WHERE proveedor_id = v_proveedor_id AND modelo = trim(p_modelo) AND version = trim(p_version)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_existente', 'motivo', 'Esa versión de precio ya existe; usa una versión nueva.');
  END IF;

  -- 9.2 Cerrar la vigente (si hay) e insertar la nueva.
  UPDATE public.precios_modelo_ia SET vigente_hasta = now()
  WHERE proveedor_id = v_proveedor_id AND modelo = trim(p_modelo) AND vigente_hasta IS NULL
  RETURNING id INTO v_anterior;

  INSERT INTO public.precios_modelo_ia (proveedor_id, modelo, version, entrada_usd_1k, salida_usd_1k,
    vigente_desde, reemplaza_precio_id, fuente, creado_por)
  VALUES (v_proveedor_id, trim(p_modelo), trim(p_version), p_entrada_usd_1k, p_salida_usd_1k,
    clock_timestamp(), v_anterior, p_fuente, p_actor_usuario_id)
  RETURNING id INTO v_nuevo;

  RETURN jsonb_build_object('ok', true, 'precio_id', v_nuevo, 'reemplaza_precio_id', v_anterior);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', 'error_interno', 'sqlstate', SQLSTATE);
END;
$$;

-- -----------------------------------------------------
-- Bloque 10: fn_ia_precio_vigente.
-- Para qué: que el backend lea el precio vigente con la misma forma que PreciosModelo
-- ({entrada_usd_1k, salida_usd_1k, version}). Sin precio → NULL; el costo queda en
-- null y no se inventa (igual que hoy en BA-034).
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ia_precio_vigente(p_proveedor_codigo text, p_modelo text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('entrada_usd_1k', pm.entrada_usd_1k, 'salida_usd_1k', pm.salida_usd_1k, 'version', pm.version)
  FROM public.precios_modelo_ia pm
  JOIN public.proveedores_ia p ON p.id = pm.proveedor_id
  WHERE p.codigo = p_proveedor_codigo AND pm.modelo = p_modelo AND pm.vigente_hasta IS NULL;
$$;

-- -----------------------------------------------------
-- Bloque 11: permisos. Las funciones solo las ejecuta el servidor (service_role).
-- El endpoint verifica super_admin y pasa el actor.
-- -----------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_ia_tope_por_defecto() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ia_actualizar_tope(text, numeric, integer, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ia_gasto_hoy(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ia_registrar_alerta_gasto(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ia_registrar_precio(text, text, numeric, numeric, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_ia_precio_vigente(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_ia_actualizar_tope(text, numeric, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ia_gasto_hoy(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ia_registrar_alerta_gasto(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ia_registrar_precio(text, text, numeric, numeric, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_ia_precio_vigente(text, text) TO service_role;

COMMENT ON FUNCTION public.fn_ia_actualizar_tope(text, numeric, integer, uuid) IS 'BA-038 D1/D3/D4. Guarda tope y umbral validados + bitácora. Solo service_role.';
COMMENT ON FUNCTION public.fn_ia_gasto_hoy(text) IS 'BA-038 D5–D8. Gasto de hoy (Bogotá), tope, % y estado normal|alerta|cortado. Solo service_role.';
COMMENT ON FUNCTION public.fn_ia_registrar_alerta_gasto(text) IS 'BA-038 D5/D6. Registra la alerta de umbral o corte, una por día. Solo service_role.';
COMMENT ON FUNCTION public.fn_ia_registrar_precio(text, text, numeric, numeric, text, text, uuid) IS 'BA-038. Nueva versión de precio; cierra la anterior. Solo service_role.';
COMMENT ON FUNCTION public.fn_ia_precio_vigente(text, text) IS 'BA-038. Precio vigente {entrada_usd_1k, salida_usd_1k, version} o NULL. Solo service_role.';

COMMIT;

-- VERIFY (comentado):
-- SELECT c.codigo, t.tope_diario_usd, t.umbral_alerta_pct FROM topes_gasto_ia t JOIN canales_ia c ON c.id = t.canal_id;
-- SELECT fn_ia_gasto_hoy('whatsapp');
